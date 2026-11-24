
import { useEffect, useRef, useState } from 'react';
import { tokenStore } from '@/lib/api';

export type LiveStaffNotification = {
  id: string;
  recipientUserId: string;
  title: string;
  body: string;
  category: string;
  entityType?: string | null;
  entityId?: string | null;
  status: string;
  readAt?: string | null;
  createdAt: string;
};

type SocketMessage =
  | { type: 'authenticated'; userId: string }
  | { type: 'staff_notification'; notification: LiveStaffNotification }
  | { type: 'error'; message: string }
  | { type: 'pong' };

type SocketStatus = 'disconnected' | 'connecting' | 'connected';

export function useStaffNotificationsSocket(
  onNotification: (notification: LiveStaffNotification) => void,
) {
  const [status, setStatus] = useState<SocketStatus>('disconnected');
  const callbackRef = useRef(onNotification);

  useEffect(() => {
    callbackRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let authTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const connect = () => {
      if (disposed) return;

      const token = tokenStore.get();

      if (!token) {
        console.warn('[Staff WS] No authentication token found.');
        setStatus('disconnected');
        return;
      }

      setStatus('connecting');

    const protocol =
  window.location.protocol === 'https:' ? 'wss:' : 'ws:';

const backendHost =
  window.location.hostname === 'localhost'
    ? 'localhost:4000'
    : `${window.location.hostname}:4000`;

const socketUrl = `${protocol}//${backendHost}/ws`;

      console.info('[Staff WS] Connecting:', socketUrl);

      const currentSocket = new WebSocket(socketUrl);
      socket = currentSocket;

      currentSocket.onopen = () => {
        if (disposed || currentSocket !== socket) return;

        console.info('[Staff WS] Connection opened. Authenticating...');

        currentSocket.send(
          JSON.stringify({
            type: 'auth',
            token,
          }),
        );

        // Do not leave the UI connecting indefinitely.
        authTimer = setTimeout(() => {
          if (
            currentSocket.readyState === WebSocket.OPEN &&
            !disposed
          ) {
            console.error('[Staff WS] Authentication timed out.');
            currentSocket.close(4000, 'Authentication timeout');
          }
        }, 8000);
      };

      currentSocket.onmessage = (event: MessageEvent<string>) => {
        let message: SocketMessage;

        try {
          message = JSON.parse(event.data) as SocketMessage;
        } catch {
          console.error('[Staff WS] Invalid server message.');
          return;
        }

        if (message.type === 'authenticated') {
          if (authTimer) clearTimeout(authTimer);

          attempts = 0;
          setStatus('connected');

          console.info(
            '[Staff WS] Authenticated successfully:',
            message.userId,
          );

          return;
        }

        if (message.type === 'staff_notification') {
          callbackRef.current(message.notification);
          return;
        }

        if (message.type === 'error') {
          console.error('[Staff WS] Server rejected request:', message.message);
        }
      };

      currentSocket.onerror = () => {
        console.error('[Staff WS] WebSocket connection error.');
      };

      currentSocket.onclose = (event: CloseEvent) => {
        if (authTimer) clearTimeout(authTimer);

        if (disposed || currentSocket !== socket) return;

        console.warn('[Staff WS] Connection closed:', {
          code: event.code,
          reason: event.reason,
          clean: event.wasClean,
        });

        setStatus('disconnected');

        attempts += 1;

        const delay = Math.min(
          1000 * 2 ** Math.min(attempts - 1, 5),
          30_000,
        );

        console.info(`[Staff WS] Reconnecting in ${delay}ms`);

        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;

      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (authTimer) clearTimeout(authTimer);

      if (socket) {
        socket.onclose = null;
        socket.close();
      }

      setStatus('disconnected');
    };
  }, []);

  return { status };
}
