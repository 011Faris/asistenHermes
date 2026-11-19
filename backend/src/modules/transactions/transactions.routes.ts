import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  createExpenseHandler,
  createIncomeHandler,
  createTransferHandler,
  getTransactionHandler,
  listTransactionsHandler,
} from './transactions.controller.js';
import {
  createExpenseSchema,
  createIncomeSchema,
  createTransferSchema,
  idParamSchema,
  listTransactionsQuerySchema,
} from './transactions.validation.js';

export const transactionsRouter = Router();

// Catatan: tidak ada endpoint DELETE permanen — pembatalan memakai
// mekanisme reversal jurnal (tahap berikutnya), bukan hapus histori.
transactionsRouter.get('/', validate('query', listTransactionsQuerySchema), listTransactionsHandler);
transactionsRouter.get('/:id', validate('params', idParamSchema), getTransactionHandler);
transactionsRouter.post('/income', validate('body', createIncomeSchema), createIncomeHandler);
transactionsRouter.post('/expense', validate('body', createExpenseSchema), createExpenseHandler);
transactionsRouter.post('/transfer', validate('body', createTransferSchema), createTransferHandler);
