
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
    let attempts = 0;

    const connect = () => {
      if (disposed) return;

      const token = tokenStore.get();
      if (!token) {
        setStatus('disconnected');
        return;
      }

      setStatus('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

      socket.onopen = () => {
        if (disposed || !socket) return;
        socket.send(JSON.stringify({ type: 'auth', token }));
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        let message: SocketMessage;

        try {
          message = JSON.parse(event.data) as SocketMessage;
        } catch {
          return;
        }

        if (message.type === 'authenticated') {
          attempts = 0;
          setStatus('connected');
          return;
        }

        if (message.type === 'staff_notification') {
          callbackRef.current(message.notification);
        }

        if (message.type === 'error') {
          console.warn('Staff notification socket:', message.message);
        }
      };

      socket.onerror = () => {
        // onclose handles reconnecting; avoid logging tokens or message contents.
      };

      socket.onclose = () => {
        if (disposed) return;

        setStatus('disconnected');
        attempts += 1;

        // Exponential backoff capped at 30 seconds.
        const delay = Math.min(1000 * 2 ** Math.min(attempts - 1, 5), 30_000);
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);

      if (socket) {
        // Prevent the close event from starting another connection.
        socket.onclose = null;
        socket.close();
      }

      setStatus('disconnected');
    };
  }, []);

  return { status };
}
