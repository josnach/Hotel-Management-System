import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

import { verifyAccessToken } from '../lib/session';

type SocketWithUser = WebSocket & {
  staffUserId?: string;
  authenticated?: boolean;
  authenticating?: boolean;
};

type AuthMessage = {
  type?: string;
  token?: string;
};

const socketsByUser = new Map<string, Set<SocketWithUser>>();

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify(payload), (error) => {
    if (error) {
      socket.terminate();
    }
  });
}

function removeSocket(socket: SocketWithUser): void {
  const userId = socket.staffUserId;

  if (!userId) return;

  const sockets = socketsByUser.get(userId);

  if (!sockets) {
    socket.staffUserId = undefined;
    socket.authenticated = false;
    return;
  }

  sockets.delete(socket);

  if (sockets.size === 0) {
    socketsByUser.delete(userId);
  }

  socket.staffUserId = undefined;
  socket.authenticated = false;
}

export function publishChatEvent(
  userId: string,
  payload: unknown,
): void {
  const sockets = socketsByUser.get(userId);

  if (!sockets) return;

  for (const socket of sockets) {
    // Defense in depth: verify the registered identity matches.
    if (
      socket.staffUserId === userId &&
      socket.authenticated === true
    ) {
      send(socket, payload);
    }
  }
}

export function publishChatEventToMany(
  userIds: string[],
  payload: unknown,
): void {
  for (const userId of new Set(userIds)) {
    publishChatEvent(userId, payload);
  }
}

export function attachStaffChatSocket(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws/staff-chat',
    maxPayload: 8 * 1024,
  });

  wss.on('connection', (rawSocket) => {
    const socket = rawSocket as SocketWithUser;

    const authTimeout = setTimeout(() => {
      if (!socket.authenticated) {
        socket.close(4401, 'Authentication required');
      }
    }, 10_000);

    socket.on('message', async (raw) => {
      if (socket.readyState !== WebSocket.OPEN) return;

      let message: AuthMessage;

      try {
        message = JSON.parse(raw.toString()) as AuthMessage;
      } catch {
        socket.close(4400, 'Invalid message');
        return;
      }

      // Authenticated sockets cannot issue additional commands here.
      if (socket.authenticated) {
        send(socket, {
          type: 'error',
          message: 'Unsupported socket command',
        });
        return;
      }

      // Prevent concurrent authentication attempts.
      if (socket.authenticating) {
        socket.close(4401, 'Authentication already in progress');
        return;
      }

      if (
        message.type !== 'auth' ||
        typeof message.token !== 'string' ||
        message.token.trim().length === 0
      ) {
        socket.close(4401, 'Authentication required');
        return;
      }

      socket.authenticating = true;

      try {
        const { user } = await verifyAccessToken(message.token);

        // The connection may have closed while authentication was pending.
        if (socket.readyState !== WebSocket.OPEN) return;

        socket.staffUserId = user.id;
        socket.authenticated = true;

        const sockets =
          socketsByUser.get(user.id) ?? new Set<SocketWithUser>();

        sockets.add(socket);
        socketsByUser.set(user.id, sockets);

        clearTimeout(authTimeout);

        send(socket, {
          type: 'authenticated',
        });
      } catch {
        clearTimeout(authTimeout);

        if (socket.readyState === WebSocket.OPEN) {
          socket.close(4401, 'Invalid or expired token');
        }
      } finally {
        socket.authenticating = false;
      }
    });

    socket.on('close', () => {
      clearTimeout(authTimeout);
      removeSocket(socket);
    });

    socket.on('error', () => {
      clearTimeout(authTimeout);
      removeSocket(socket);
    });
  });

  return wss;
}
