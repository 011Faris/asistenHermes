import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  createCategoryHandler,
  deleteCategoryHandler,
  getCategoryHandler,
  listCategoriesHandler,
  updateCategoryHandler,
} from './categories.controller.js';
import {
  createCategorySchema,
  idParamSchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from './categories.validation.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', validate('query', listCategoriesQuerySchema), listCategoriesHandler);
categoriesRouter.get('/:id', validate('params', idParamSchema), getCategoryHandler);
categoriesRouter.post('/', validate('body', createCategorySchema), createCategoryHandler);
categoriesRouter.patch(
  '/:id',
  validate('params', idParamSchema),
  validate('body', updateCategorySchema),
  updateCategoryHandler,
);
categoriesRouter.delete('/:id', validate('params', idParamSchema), deleteCategoryHandler);
