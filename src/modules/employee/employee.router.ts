import { Router } from 'express';
import { EmployeeController } from './employee.controller.js';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { requirePermission, requireSelfOrPermission } from '../../middleware/requirePermission.js';
import { PERMISSION_KEYS } from '../auth/permissionKeys.js';
import { validate } from '../../middleware/validate.js';
import {
  listEmployeesQuerySchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  employeeIdParamSchema,
  checkEmployeeIdParamSchema
} from './employee.schema.js';

export const employeeRouter = Router();

// Secure all employee routes with authentication (supports both user and superadmin tokens)
employeeRouter.use(authenticateAny);

// Generate & check employee ID
employeeRouter.get('/employee-id/:orgId', requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), EmployeeController.generateId);
employeeRouter.get('/employee-id/:orgId/check/:employeeId', validate({ params: checkEmployeeIdParamSchema }), requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), EmployeeController.checkId);

// List employees (supports server-side pagination, filters, sorting)
employeeRouter.get('/', validate({ query: listEmployeesQuerySchema }), requireOrgScope(), requirePermission(PERMISSION_KEYS.userRead), EmployeeController.list);

// Get single employee by ID or employeeId
employeeRouter.get('/:id', validate({ params: employeeIdParamSchema }), requireOrgScope(), requireSelfOrPermission(PERMISSION_KEYS.userRead), EmployeeController.getById);

// Create employee
employeeRouter.post('/', validate({ body: createEmployeeSchema }), requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), EmployeeController.create);

// Update employee (self-service or users with write permission)
employeeRouter.put('/:id', validate({ params: employeeIdParamSchema, body: updateEmployeeSchema }), requireOrgScope(), requireSelfOrPermission(PERMISSION_KEYS.userWrite), EmployeeController.update);
employeeRouter.put('/', validate({ body: updateEmployeeSchema }), requireOrgScope(), requireSelfOrPermission(PERMISSION_KEYS.userWrite), EmployeeController.update);
employeeRouter.patch('/:id', validate({ params: employeeIdParamSchema, body: updateEmployeeSchema }), requireOrgScope(), requireSelfOrPermission(PERMISSION_KEYS.userWrite), EmployeeController.update);
employeeRouter.patch('/', validate({ body: updateEmployeeSchema }), requireOrgScope(), requireSelfOrPermission(PERMISSION_KEYS.userWrite), EmployeeController.update);

// Delete employee
employeeRouter.delete('/:id', validate({ params: employeeIdParamSchema }), requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), EmployeeController.delete);
employeeRouter.delete('/', requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), EmployeeController.delete);

export default employeeRouter;
