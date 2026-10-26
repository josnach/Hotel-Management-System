import cron from 'node-cron';
import { app } from './app';
import { config } from './config';
import { prisma } from './lib/prisma';
import { runAutoExtension } from './services/stays';
import { startMessagingJobs } from './messaging/worker';
import { generateStayoverTasks } from './services/housekeeping';
import { createServer } from 'node:http';
import { attachStaffNotificationSocket } from './services/staffNotificationsSocket';
import { attachStaffChatSocket } from './services/staffChatSocket';
import { purgeOldSessions } from './lib/session';

const server = createServer(app);

attachStaffNotificationSocket(server);
attachStaffChatSocket(server);

server.listen(config.port, () => {
  console.log(`HMS API listening on :${config.port}`);
  console.log(`Staff notification WebSocket available at /ws`);
});

// Daily auto-extension of guests who are past checkout (default 14:00 hotel time)
cron.schedule(config.autoExtensionCron, () => {
  runAutoExtension().then((r) => console.log('Auto extension:', r)).catch((e) => console.error('Auto extension failed', e));
}, { timezone: process.env.TZ ?? 'Africa/Lagos' });

// 07:30 daily: light stayover cleans for rooms that stay another night
cron.schedule(process.env.STAYOVER_CRON ?? '30 7 * * *', () => {
  generateStayoverTasks().then((n) => console.log('Stayover tasks created:', n)).catch((e) => console.error('Stayover generation failed', e));
}, { timezone: process.env.TZ ?? 'Africa/Lagos' });

// 03:15 daily: delete sessions that expired or were revoked over 30 days ago
cron.schedule('15 3 * * *', () => {
  purgeOldSessions().then((r) => console.log('Old sessions purged:', r.count)).catch((e) => console.error('Session purge failed', e));
}, { timezone: process.env.TZ ?? 'Africa/Lagos' });

startMessagingJobs();

const shutdown = async () => { server.close(); await prisma.$disconnect(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
