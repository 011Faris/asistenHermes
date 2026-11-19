import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import { getSettingsHandler, updateSettingsHandler } from './settings.controller.js';
import { updateSettingsSchema } from './settings.validation.js';

export const settingsRouter = Router();

settingsRouter.get('/', getSettingsHandler);
settingsRouter.patch('/', validate('body', updateSettingsSchema), updateSettingsHandler);
