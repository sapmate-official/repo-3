import { Router } from 'express';
import { DepartmentController } from './department.controller.js';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { validate } from '../../middleware/validate.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  departmentIdParamSchema,
  departmentOrgParamSchema
} from './department.schema.js';

export const departmentRouter = Router();

// Apply auth (user or superadmin) and tenant scoping to all department operations
departmentRouter.use(authenticateAny);

// List departments for the user's organization (supports / and /org/:orgId for backward compatibility)
departmentRouter.get('/', requireOrgScope(), DepartmentController.list);
departmentRouter.get('/org/:orgId', validate({ params: departmentOrgParamSchema }), requireOrgScope(), DepartmentController.list);

// Get single department
departmentRouter.get('/:id', validate({ params: departmentIdParamSchema }), requireOrgScope(), DepartmentController.getById);

// Create department
departmentRouter.post('/', validate({ body: createDepartmentSchema }), requireOrgScope(), DepartmentController.create);

// Update department
departmentRouter.put('/:id', validate({ params: departmentIdParamSchema, body: updateDepartmentSchema }), requireOrgScope(), DepartmentController.update);
departmentRouter.patch('/:id', validate({ params: departmentIdParamSchema, body: updateDepartmentSchema }), requireOrgScope(), DepartmentController.update);

// Delete department
departmentRouter.delete('/:id', validate({ params: departmentIdParamSchema }), requireOrgScope(), DepartmentController.delete);

export default departmentRouter;
