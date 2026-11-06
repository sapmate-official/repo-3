import { Router } from 'express';
import { authenticateAny } from '../middleware/auth.js';
import { organizationRouter } from '../modules/organization/organization.router.js';
import { departmentRouter } from '../modules/department/department.router.js';
import { employeeRouter } from '../modules/employee/employee.router.js';
import { onboardingRouter } from '../modules/onboarding/onboarding.router.js';
import { publicRouter } from '../modules/public/public.router.js';
import { EmployeeController } from '../modules/employee/employee.controller.js';

export const v2Router = Router();

// ==========================================
// Compatibility Routes for Legacy Frontend (v2)
// ==========================================

// Public endpoints (no auth required)
v2Router.use('/public', publicRouter);

// Organization endpoints
v2Router.get('/organization/employee-list/:orgId', authenticateAny, EmployeeController.listLegacy);
v2Router.get('/organization/employees/:orgId', authenticateAny, EmployeeController.listLegacy);
v2Router.use('/organization', organizationRouter);

// Department endpoints
v2Router.use('/department', departmentRouter);
v2Router.use('/departments', departmentRouter);

// Onboarding endpoints
v2Router.use('/onboarding', onboardingRouter);

// Employee endpoints
v2Router.use('/employees', employeeRouter);
v2Router.use('/employee', employeeRouter);

// User profile & management endpoints (/api/v2/user/...)
v2Router.get('/user/:id', authenticateAny, EmployeeController.getById);
v2Router.put('/user/:id', authenticateAny, EmployeeController.update);
v2Router.patch('/user/:id', authenticateAny, EmployeeController.update);
v2Router.delete('/user/:id', authenticateAny, EmployeeController.delete);
v2Router.get('/user', authenticateAny, EmployeeController.listLegacy);
v2Router.post('/user', authenticateAny, EmployeeController.create);

export default v2Router;
