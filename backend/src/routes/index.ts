import { Router } from 'express';
import { categoriesRouter } from '../modules/categories/categories.routes.js';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { instaboxRouter } from '../modules/instabox/instabox.routes.js';
import { remindersRouter } from '../modules/reminders/reminders.routes.js';
import { schedulesRouter } from '../modules/schedules/schedules.routes.js';
import { settingsRouter } from '../modules/settings/settings.routes.js';
import { transactionsRouter } from '../modules/transactions/transactions.routes.js';
import { walletsRouter } from '../modules/wallets/wallets.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/wallets', walletsRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/transactions', transactionsRouter);
apiRouter.use('/schedules', schedulesRouter);
apiRouter.use('/reminders', remindersRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/instabox', instaboxRouter);
