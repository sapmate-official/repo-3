import { Router } from 'express';
import { authenticateAny } from '../middleware/auth.js';
import { authRouter } from '../modules/auth/auth.router.js';
import { organizationRouter } from '../modules/organization/organization.router.js';
import { departmentRouter } from '../modules/department/department.router.js';
import { employeeRouter } from '../modules/employee/employee.router.js';
import { onboardingRouter } from '../modules/onboarding/onboarding.router.js';
import { EmployeeController } from '../modules/employee/employee.controller.js';

export const v1Router = Router();

// Mount auth module under both /general (100% frontend backward compatible) and /auth
v1Router.use('/general', authRouter);
v1Router.use('/auth', authRouter);
v1Router.use('/organization', organizationRouter);

// Department module (supports both /department and /departments)
v1Router.use('/department', departmentRouter);
v1Router.use('/departments', departmentRouter);

// Employee module (supports both /employee and /employees)
v1Router.use('/employee', employeeRouter);
v1Router.use('/employees', employeeRouter);

// Onboarding module
v1Router.use('/onboarding', onboardingRouter);

// Legacy v1 helper endpoints for frontend backward compatibility
v1Router.get('/manager/employee-list', authenticateAny, EmployeeController.listLegacy);
v1Router.post('/employee/register', authenticateAny, EmployeeController.create);

export default v1Router;
