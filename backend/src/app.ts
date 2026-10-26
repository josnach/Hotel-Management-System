import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { authenticate } from './middleware/auth';
import { errorHandler, notFound } from './middleware/error';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { maintenanceRouter, roomsRouter } from './routes/rooms';
import { groupsRouter, guestsRouter, staysRouter } from './routes/guests';
import { foliosRouter } from './routes/folios';
import { ordersRouter, salesPointsRouter } from './routes/sales';
import { inventoryRouter, storesRouter } from './routes/inventory';
import { eventsRouter, reservationsRouter } from './routes/bookings';
import { financeRouter } from './routes/finance';
import { payrollRouter } from './routes/payroll';
import { receivablesRouter } from './routes/receivables';
import { powerRouter } from './routes/power';
import { crmRouter } from './routes/crm';
import { dashboardRouter, reportsRouter, securityRouter } from './routes/reports';
import { auditRouter, guardRouter } from './routes/guard';
import { policyRouter } from './routes/policy';
import { barRouter } from './routes/bar';
import { housekeepingRouter } from './routes/housekeeping';
import { nightAuditRouter, shiftsRouter } from './routes/nightaudit';
import { currenciesRouter } from './routes/currencies';
import { documentsRouter } from './routes/documents';
import { publicRoomsRouter } from './routes/publicRooms'; 

import { messagingRouter, publicRouter, webhookRouter } from './routes/messaging';
import staffNotificationsRouter from './routes/staffNotifications.js';
import { guestRequestsRouter } from './routes/guestrequests';
import { portalRouter } from './routes/portal';
import { staffChatRouter } from './routes/staffChat';
import { revenueForecastRouter } from './routes/revenueForecast';
import { publicBookingsRouter } from './routes/publicBookings';


export const app = express();
app.use(helmet());
app.use(cors({ origin: config.corsOrigin.split(','), credentials: true }));
// The WhatsApp webhook needs the raw body to verify Meta's signature, so it is mounted before the JSON parser.
app.use('/webhooks/whatsapp', webhookRouter);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('tiny'));

app.use('/p', publicRouter);
app.get('/health', (_q, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);

const api = express.Router();
api.use(authenticate);
api.use('/users', usersRouter);
api.use('/rooms', roomsRouter);
api.use('/maintenance', maintenanceRouter);
api.use('/guests', guestsRouter);
api.use('/groups', groupsRouter);
api.use('/stays', staysRouter);
api.use('/folios', foliosRouter);
api.use('/reservations', reservationsRouter);
api.use('/sales-points', salesPointsRouter);
api.use('/orders', ordersRouter);
api.use('/inventory', inventoryRouter);
api.use('/stores', storesRouter);
api.use('/events', eventsRouter);
api.use('/finance', financeRouter);
api.use('/finance', payrollRouter);
api.use('/finance/receivables', receivablesRouter);
api.use('/power', powerRouter);
api.use('/crm', crmRouter);
api.use('/reports', reportsRouter);
api.use('/security', securityRouter);
api.use('/dashboard', dashboardRouter);
api.use('/guard', guardRouter);
api.use('/audit', auditRouter);
api.use('/messaging', messagingRouter);
api.use('/policy', policyRouter);
api.use('/bar', barRouter);
api.use('/housekeeping', housekeepingRouter);
api.use('/shifts', shiftsRouter);
api.use('/night-audit', nightAuditRouter);
api.use('/guest-requests', guestRequestsRouter);
app.use('/api/portal', portalRouter); // public: the room QR page
app.use('/api/staff-notifications', staffNotificationsRouter);
app.use('/api/staff-chat', staffChatRouter);
api.use('/revenue-forecast', revenueForecastRouter);
api.use('/currencies', currenciesRouter);
api.use('/documents', documentsRouter);
app.use('/api/public/rooms', publicRoomsRouter);
app.use('/api/public/bookings', publicBookingsRouter
    
);
app.use('/api', api);

app.use(notFound);
app.use(errorHandler);
