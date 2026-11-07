import { Router } from 'express';
import { EmployeeController } from './employee.controller.js';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
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
employeeRouter.get('/employee-id/:orgId', requireOrgScope(), EmployeeController.generateId);
employeeRouter.get('/employee-id/:orgId/check/:employeeId', validate({ params: checkEmployeeIdParamSchema }), requireOrgScope(), EmployeeController.checkId);

// List employees (supports server-side pagination, filters, sorting)
employeeRouter.get('/', validate({ query: listEmployeesQuerySchema }), requireOrgScope(), EmployeeController.list);

// Get single employee by ID or employeeId
employeeRouter.get('/:id', validate({ params: employeeIdParamSchema }), requireOrgScope(), EmployeeController.getById);

// Create employee
employeeRouter.post('/', validate({ body: createEmployeeSchema }), requireOrgScope(), EmployeeController.create);

// Update employee (supports /:id and query /?id=...)
employeeRouter.put('/:id', validate({ params: employeeIdParamSchema, body: updateEmployeeSchema }), requireOrgScope(), EmployeeController.update);
employeeRouter.put('/', validate({ body: updateEmployeeSchema }), requireOrgScope(), EmployeeController.update);
employeeRouter.patch('/:id', validate({ params: employeeIdParamSchema, body: updateEmployeeSchema }), requireOrgScope(), EmployeeController.update);
employeeRouter.patch('/', validate({ body: updateEmployeeSchema }), requireOrgScope(), EmployeeController.update);

// Delete employee
employeeRouter.delete('/:id', validate({ params: employeeIdParamSchema }), requireOrgScope(), EmployeeController.delete);
employeeRouter.delete('/', requireOrgScope(), EmployeeController.delete);

export default employeeRouter;
