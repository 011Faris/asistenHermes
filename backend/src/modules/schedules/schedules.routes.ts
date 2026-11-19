import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  createScheduleHandler,
  deleteScheduleHandler,
  getScheduleHandler,
  listSchedulesHandler,
  updateScheduleHandler,
  updateScheduleStatusHandler,
} from './schedules.controller.js';
import {
  createScheduleSchema,
  idParamSchema,
  listSchedulesQuerySchema,
  updateScheduleSchema,
  updateScheduleStatusSchema,
} from './schedules.validation.js';

export const schedulesRouter = Router();

schedulesRouter.get('/', validate('query', listSchedulesQuerySchema), listSchedulesHandler);
schedulesRouter.get('/:id', validate('params', idParamSchema), getScheduleHandler);
schedulesRouter.post('/', validate('body', createScheduleSchema), createScheduleHandler);
schedulesRouter.patch(
  '/:id',
  validate('params', idParamSchema),
  validate('body', updateScheduleSchema),
  updateScheduleHandler,
);
schedulesRouter.patch(
  '/:id/status',
  validate('params', idParamSchema),
  validate('body', updateScheduleStatusSchema),
  updateScheduleStatusHandler,
);
schedulesRouter.delete('/:id', validate('params', idParamSchema), deleteScheduleHandler);
