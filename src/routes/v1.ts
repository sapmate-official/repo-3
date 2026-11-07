import { Router } from 'express';
import { authenticateAny } from '../middleware/auth.js';
import { authRouter } from '../modules/auth/auth.router.js';
import { organizationRouter } from '../modules/organization/organization.router.js';
import { departmentRouter } from '../modules/department/department.router.js';
import { employeeRouter } from '../modules/employee/employee.router.js';
import { onboardingRouter } from '../modules/onboarding/onboarding.router.js';
import { dashboardRouter } from '../modules/dashboard/dashboard.router.js';
import { publicRouter } from '../modules/public/public.router.js';
import { roleRouter } from '../modules/role/role.router.js';
import { permissionRouter } from '../modules/permission/permission.router.js';
import attendanceRouter from '../modules/attendance/attendance.router.js';
import { EmployeeController } from '../modules/employee/employee.controller.js';

export const v1Router = Router();

// Public routes (no auth required)
v1Router.use('/public', publicRouter);

// Dashboard module
v1Router.use('/dashboard', dashboardRouter);

// Attendance module
v1Router.use('/attendance', attendanceRouter);

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

// Role & Permission modules
v1Router.use('/role', roleRouter);
v1Router.use('/roles', roleRouter);
v1Router.use('/permission', permissionRouter);
v1Router.use('/permissions', permissionRouter);

// Legacy v1 helper endpoints for frontend backward compatibility
v1Router.get('/manager/employee-list', authenticateAny, EmployeeController.listLegacy);
v1Router.post('/employee/register', authenticateAny, EmployeeController.create);

export default v1Router;
