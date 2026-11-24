
import cron from 'node-cron';
import { createServer } from 'node:http';

import { app } from './app';
import { config } from './config';
import { prisma } from './lib/prisma';
import { purgeOldSessions } from './lib/session';

import { runAutoExtension } from './services/stays';
import { generateStayoverTasks } from './services/housekeeping';

import { startMessagingJobs } from './messaging/worker';

import { createStaffNotificationSocket } from './services/staffNotificationsSocket';
import { createStaffChatSocket } from './services/staffChatSocket';
import { notifyStaff } from './services/staffNotifications';

const server = createServer(app);

// Create both WebSocket servers without attaching them directly
// to the HTTP server.
const notificationsWss = createStaffNotificationSocket();
const chatWss = createStaffChatSocket();

// Centralized WebSocket upgrade routing.
server.on('upgrade', (req, socket, head) => {
  let pathname: string;

  try {
    pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch (error) {
    console.error('[WebSocket] Invalid upgrade URL:', error);
    socket.destroy();
    return;
  }

  if (pathname === '/ws') {
    notificationsWss.handleUpgrade(req, socket, head, (ws) => {
      notificationsWss.emit('connection', ws, req);
    });

    return;
  }

  if (pathname === '/ws/chat') {
    chatWss.handleUpgrade(req, socket, head, (ws) => {
      chatWss.emit('connection', ws, req);
    });

    return;
  }

  // Reject unknown WebSocket endpoints.
  socket.destroy();
});

// Start HTTP server.
server.listen(config.port, () => {
  console.log(`HMS API listening on :${config.port}`);
  console.log('Staff notification WebSocket available at /ws');
  console.log('Staff chat WebSocket available at /ws/chat');
});


// Daily auto-extension of guests who are past checkout.
cron.schedule(
  config.autoExtensionCron,
  () => {
    runAutoExtension()
      .then((result) => console.log('Auto extension:', result))
      .catch((error) => console.error('Auto extension failed', error));
  },
  {
    timezone: process.env.TZ ?? 'Africa/Lagos',
  },
);

// 07:30 daily: generate light stayover cleaning tasks.
cron.schedule(
  process.env.STAYOVER_CRON ?? '30 7 * * *',
  () => {
    generateStayoverTasks()
      .then((count) => console.log('Stayover tasks created:', count))
      .catch((error) => console.error('Stayover generation failed', error));
  },
  {
    timezone: process.env.TZ ?? 'Africa/Lagos',
  },
);

// 03:15 daily: delete sessions that expired or were revoked
// more than 30 days ago.
cron.schedule(
  '15 3 * * *',
  () => {
    purgeOldSessions()
      .then((result) => console.log('Old sessions purged:', result.count))
      .catch((error) => console.error('Session purge failed', error));
  },
  {
    timezone: process.env.TZ ?? 'Africa/Lagos',
  },
);

// Start background messaging jobs.
startMessagingJobs();

// Graceful shutdown.
const shutdown = async () => {
  console.log('Shutting down HMS API...');

  notificationsWss.close();
  chatWss.close();

  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log('HMS API shut down successfully.');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
