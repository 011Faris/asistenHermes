import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  createReminderHandler,
  deleteReminderHandler,
  listRemindersHandler,
  updateReminderHandler,
} from './reminders.controller.js';
import {
  createReminderSchema,
  idParamSchema,
  listRemindersQuerySchema,
  updateReminderSchema,
} from './reminders.validation.js';

export const remindersRouter = Router();

remindersRouter.get('/', validate('query', listRemindersQuerySchema), listRemindersHandler);
remindersRouter.post('/', validate('body', createReminderSchema), createReminderHandler);
remindersRouter.patch(
  '/:id',
  validate('params', idParamSchema),
  validate('body', updateReminderSchema),
  updateReminderHandler,
);
remindersRouter.delete('/:id', validate('params', idParamSchema), deleteReminderHandler);
