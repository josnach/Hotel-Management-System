
import { WebSocket, WebSocketServer } from 'ws';

import { verifyAccessToken } from '../lib/session';

type ClientMessage = {
  type?: string;
  token?: string;
};

export type StaffNotificationEvent = {
  id: string;
  recipientUserId: string;
  title: string;
  body: string;
  category: string;
  entityType?: string | null;
  entityId?: string | null;
  status: string;
  readAt?: Date | string | null;
  createdAt: Date | string;
};

type AuthenticatedSocket = WebSocket & {
  staffUserId?: string;
  isAlive?: boolean;
  authenticating?: boolean;
};

const socketsByUser = new Map<
  string,
  Set<AuthenticatedSocket>
>();

function sendJson(
  socket: WebSocket,
  payload: unknown,
): void {
  if (socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify(payload), (error) => {
    if (error) {
      socket.terminate();
    }
  });
}

function removeSocket(socket: AuthenticatedSocket): void {
  const userId = socket.staffUserId;

  if (!userId) return;

  const sockets = socketsByUser.get(userId);

  if (sockets) {
    sockets.delete(socket);

    if (sockets.size === 0) {
      socketsByUser.delete(userId);
    }
  }

  socket.staffUserId = undefined;
}

function isAuthenticated(
  socket: AuthenticatedSocket,
): boolean {
  return (
    typeof socket.staffUserId === 'string' &&
    socket.staffUserId.length > 0
  );
}

/**
 * Create the staff notification WebSocket server.
 *
 * The HTTP upgrade request is handled centrally
 * in server.ts.
 *
 * Endpoint: /ws
 *
 * Clients must send this as their first message:
 * { type: 'auth', token: '<JWT>' }
 */
export function createStaffNotificationSocket() {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 8 * 1024,
  });

  wss.on('connection', (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;

    socket.isAlive = true;
    socket.authenticating = false;

    console.log('[Staff WS] New connection received');

    // Require authentication within ten seconds.
    const authTimeout = setTimeout(() => {
      if (!isAuthenticated(socket)) {
        console.warn(
          '[Staff WS] Authentication timeout',
        );

        sendJson(socket, {
          type: 'error',
          message: 'Authentication required',
        });

        socket.close(1008, 'Authentication required');
      }
    }, 10_000);

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('message', async (rawMessage) => {
      if (socket.readyState !== WebSocket.OPEN) return;

      let message: ClientMessage;

      try {
        message = JSON.parse(
          rawMessage.toString(),
        ) as ClientMessage;
      } catch {
        sendJson(socket, {
          type: 'error',
          message: 'Invalid message format',
        });

        socket.close(1008, 'Invalid message format');
        return;
      }

      // Authenticated sockets cannot issue client commands
      // through this notification-only endpoint.
      if (isAuthenticated(socket)) {
        sendJson(socket, {
          type: 'error',
          message: 'Unsupported command',
        });

        return;
      }

      // Reject concurrent authentication attempts.
      if (socket.authenticating) {
        socket.close(
          1008,
          'Authentication already in progress',
        );

        return;
      }

      // Authentication must happen before application commands.
      if (
        message.type !== 'auth' ||
        typeof message.token !== 'string' ||
        message.token.trim().length === 0
      ) {
        sendJson(socket, {
          type: 'error',
          message: 'Send an auth message first',
        });

        socket.close(1008, 'Authentication required');
        return;
      }

      socket.authenticating = true;

      try {
        // Validate token and session.
        const { user } = await verifyAccessToken(
          message.token,
        );

        // The connection may have closed during validation.
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.staffUserId = user.id;

        console.log(
          '[Staff WS] Staff authenticated:',
          user.id,
        );

        const sockets =
          socketsByUser.get(user.id) ??
          new Set<AuthenticatedSocket>();

        sockets.add(socket);
        socketsByUser.set(user.id, sockets);

        clearTimeout(authTimeout);

        sendJson(socket, {
          type: 'authenticated',
          userId: user.id,
          at: new Date().toISOString(),
        });
      } catch (error) {
        console.error(
          '[Staff WS] Authentication failed:',
          error,
        );

        clearTimeout(authTimeout);

        if (socket.readyState === WebSocket.OPEN) {
          sendJson(socket, {
            type: 'error',
            message: 'Invalid or expired token',
          });

          socket.close(
            1008,
            'Invalid or expired token',
          );
        }
      } finally {
        socket.authenticating = false;
      }
    });

    // Handle disconnection and cleanup once.
    socket.on('close', (code, reason) => {
      console.log('[Staff WS] Client disconnected:', {
        code,
        reason: reason.toString(),
      });

      clearTimeout(authTimeout);
      removeSocket(socket);
    });

    socket.on('error', (error) => {
      console.error(
        '[Staff WS] Socket error:',
        error,
      );

      clearTimeout(authTimeout);
      removeSocket(socket);
    });
  });

  // Heartbeat detects connections that no longer respond.
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const socket = client as AuthenticatedSocket;

      if (socket.isAlive === false) {
        removeSocket(socket);
        socket.terminate();
        continue;
      }

      socket.isAlive = false;

      if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      }
    }
  }, 30_000);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  return wss;
}

/**
 * Publish a notification after it has been saved
 * to the database.
 *
 * Only authenticated connections belonging to
 * the intended recipient receive the event.
 */
export function publishStaffNotification(
  recipientUserId: string,
  notification: StaffNotificationEvent,
): void {
  if (notification.recipientUserId !== recipientUserId) {
    return;
  }

  const sockets = socketsByUser.get(recipientUserId);

  if (!sockets?.size) return;

  const payload = {
    type: 'staff_notification',
    notification: {
      ...notification,
      createdAt: new Date(
        notification.createdAt,
      ).toISOString(),
      readAt: notification.readAt
        ? new Date(notification.readAt).toISOString()
        : null,
    },
  };

  for (const socket of sockets) {
    if (
      socket.readyState === WebSocket.OPEN &&
      socket.staffUserId === recipientUserId
    ) {
      sendJson(socket, payload);
    }
  }
}
