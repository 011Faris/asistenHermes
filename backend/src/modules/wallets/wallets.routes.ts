import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  createWalletHandler,
  getWalletBalanceHandler,
  getWalletHandler,
  listWalletsHandler,
  updateWalletHandler,
  updateWalletStatusHandler,
} from './wallets.controller.js';
import {
  createWalletSchema,
  idParamSchema,
  updateWalletSchema,
  updateWalletStatusSchema,
} from './wallets.validation.js';

export const walletsRouter = Router();

walletsRouter.get('/', listWalletsHandler);
walletsRouter.get('/:id', validate('params', idParamSchema), getWalletHandler);
walletsRouter.get('/:id/balance', validate('params', idParamSchema), getWalletBalanceHandler);
walletsRouter.post('/', validate('body', createWalletSchema), createWalletHandler);
walletsRouter.patch('/:id', validate('params', idParamSchema), validate('body', updateWalletSchema), updateWalletHandler);
walletsRouter.patch(
  '/:id/status',
  validate('params', idParamSchema),
  validate('body', updateWalletStatusSchema),
  updateWalletStatusHandler,
);
