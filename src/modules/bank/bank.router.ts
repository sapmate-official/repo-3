import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { validate } from '../../middleware/validate.js';
import { BankController } from './bank.controller.js';
import {
  userIdParamSchema,
  bankUserOrIdParamSchema,
  createBankDetailsSchema,
  updateBankDetailsSchema,
  listBankDetailsQuerySchema
} from './bank.schema.js';

export const bankRouter = Router();

bankRouter.use(authenticateAny);
bankRouter.use(requireOrgScope());

// List all bank details in tenant
bankRouter.get(
  '/',
  validate({ query: listBankDetailsQuerySchema }),
  BankController.list
);

// Get by specific /user/:userId route
bankRouter.get(
  '/user/:userId',
  validate({ params: userIdParamSchema }),
  BankController.getByUserId
);

// Get by :id (where :id can be userId or bank record id)
bankRouter.get(
  '/:id',
  validate({ params: bankUserOrIdParamSchema }),
  BankController.getByIdOrUserId
);

// Create or upsert
bankRouter.post(
  '/',
  validate({ body: createBankDetailsSchema }),
  BankController.createOrUpsert
);

// Update / Upsert
bankRouter.put(
  '/:id',
  validate({ params: bankUserOrIdParamSchema, body: updateBankDetailsSchema }),
  BankController.update
);

bankRouter.put(
  '/',
  validate({ body: updateBankDetailsSchema }),
  BankController.update
);

bankRouter.patch(
  '/:id',
  validate({ params: bankUserOrIdParamSchema, body: updateBankDetailsSchema }),
  BankController.update
);

bankRouter.patch(
  '/',
  validate({ body: updateBankDetailsSchema }),
  BankController.update
);

// Delete
bankRouter.delete(
  '/:id',
  validate({ params: bankUserOrIdParamSchema }),
  BankController.delete
);

bankRouter.delete(
  '/',
  BankController.delete
);

export default bankRouter;
