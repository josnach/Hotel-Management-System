
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

const socketsByUser = new Map<
  string,
  Set<SocketWithUser>
>();

function send(
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

/**
 * Publish a chat event to one authenticated staff member.
 */
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

/**
 * Publish a chat event to multiple authenticated staff members.
 */
export function publishChatEventToMany(
  userIds: string[],
  payload: unknown,
): void {
  for (const userId of new Set(userIds)) {
    publishChatEvent(userId, payload);
  }
}

/**
 * Create the staff chat WebSocket server.
 *
 * HTTP upgrade routing is handled centrally in index.ts.
 *
 * Endpoint: /ws/chat
 *
 * Clients must send this as their first message:
 * { type: 'auth', token: '<JWT>' }
 */
export function createStaffChatSocket() {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 8 * 1024,
  });

  wss.on('connection', (rawSocket) => {
    const socket = rawSocket as SocketWithUser;

    socket.authenticated = false;
    socket.authenticating = false;

    console.log('[Staff Chat WS] New connection received');

    // Require authentication within ten seconds.
    const authTimeout = setTimeout(() => {
      if (!socket.authenticated) {
        console.warn(
          '[Staff Chat WS] Authentication timeout',
        );

        socket.close(4401, 'Authentication required');
      }
    }, 10_000);

    socket.on('message', async (raw) => {
      if (socket.readyState !== WebSocket.OPEN) return;

      let message: AuthMessage;

      try {
        message = JSON.parse(
          raw.toString(),
        ) as AuthMessage;
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
        socket.close(
          4401,
          'Authentication already in progress',
        );

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
        const { user } = await verifyAccessToken(
          message.token,
        );

        // The connection may have closed while authentication
        // was waiting for the session/database lookup.
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.staffUserId = user.id;
        socket.authenticated = true;

        console.log(
          '[Staff Chat WS] Staff authenticated:',
          user.id,
        );

        const sockets =
          socketsByUser.get(user.id) ??
          new Set<SocketWithUser>();

        sockets.add(socket);
        socketsByUser.set(user.id, sockets);

        clearTimeout(authTimeout);

        send(socket, {
          type: 'authenticated',
        });
      } catch (error) {
        console.error(
          '[Staff Chat WS] Authentication failed:',
          error,
        );

        clearTimeout(authTimeout);

        if (socket.readyState === WebSocket.OPEN) {
          socket.close(
            4401,
            'Invalid or expired token',
          );
        }
      } finally {
        socket.authenticating = false;
      }
    });

    socket.on('close', (code, reason) => {
      console.log('[Staff Chat WS] Client disconnected:', {
        code,
        reason: reason.toString(),
      });

      clearTimeout(authTimeout);
      removeSocket(socket);
    });

    socket.on('error', (error) => {
      console.error(
        '[Staff Chat WS] Socket error:',
        error,
      );

      clearTimeout(authTimeout);
      removeSocket(socket);
    });
  });

  return wss;
}
