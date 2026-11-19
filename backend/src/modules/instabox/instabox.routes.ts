import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import { instaboxAuthMiddleware } from '../../middlewares/instabox.middleware.js';
import {
  consoleHandler,
  consoleJsHandler,
  listMachinesHandler,
  operationStatusHandler,
  wakeMachineHandler,
} from './instabox.controller.js';
import { operationIdParamSchema, wakeMachineSchema } from './instabox.validation.js';

export const instaboxRouter = Router();

// Halaman kontrol publik (tidak memuat secret apa pun).
instaboxRouter.get('/console', consoleHandler);
instaboxRouter.get('/console.js', consoleJsHandler);

// Seluruh endpoint API di bawah ini wajib autentikasi khusus InstaBox
// (kunci master ATAU kunci UI) — pengganti auth global untuk prefix ini.
instaboxRouter.use(instaboxAuthMiddleware);

instaboxRouter.get('/machines', listMachinesHandler);
instaboxRouter.post('/wake', validate('body', wakeMachineSchema), wakeMachineHandler);
instaboxRouter.get('/operations/:id', validate('params', operationIdParamSchema), operationStatusHandler);
