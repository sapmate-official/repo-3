import { Router } from 'express';
import { authenticateAny } from '../middleware/auth.js';
import { organizationRouter } from '../modules/organization/organization.router.js';
import { departmentRouter } from '../modules/department/department.router.js';
import { employeeRouter } from '../modules/employee/employee.router.js';
import { onboardingRouter } from '../modules/onboarding/onboarding.router.js';
import { dashboardRouter } from '../modules/dashboard/dashboard.router.js';
import { publicRouter } from '../modules/public/public.router.js';
import { roleRouter } from '../modules/role/role.router.js';
import { permissionRouter } from '../modules/permission/permission.router.js';
import { rolePermissionRouter } from '../modules/role/rolePermission.router.js';
import { userRoleRouter } from '../modules/role/userRole.router.js';
import { UserRoleController } from '../modules/role/userRole.controller.js';
import { EmployeeController } from '../modules/employee/employee.controller.js';

export const v2Router = Router();

// ==========================================
// Compatibility Routes for Legacy Frontend (v2)
// ==========================================

// Public endpoints (no auth required)
v2Router.use('/public', publicRouter);

// Dashboard endpoints
v2Router.use('/dashboard', dashboardRouter);
v2Router.use('/screen/dashboard', dashboardRouter);

// Organization endpoints
v2Router.get('/organization/employee-list/:orgId', authenticateAny, EmployeeController.listLegacy);
v2Router.get('/organization/employees/:orgId', authenticateAny, EmployeeController.listLegacy);
v2Router.get('/organization/employees/employee-id/:orgId', authenticateAny, EmployeeController.generateId);
v2Router.get('/organization/employees/employee-id/:orgId/check/:employeeId', authenticateAny, EmployeeController.checkId);
v2Router.use('/organization', organizationRouter);

// Department endpoints
v2Router.use('/department', departmentRouter);
v2Router.use('/departments', departmentRouter);

// Onboarding endpoints
v2Router.use('/onboarding', onboardingRouter);

// Role & Permission endpoints
v2Router.use('/role', roleRouter);
v2Router.use('/roles', roleRouter);
v2Router.use('/permission', permissionRouter);
v2Router.use('/permissions', permissionRouter);
v2Router.use('/role-permission', rolePermissionRouter);
v2Router.use('/user-role', userRoleRouter);

// Employee endpoints
v2Router.use('/employees', employeeRouter);
v2Router.use('/employee', employeeRouter);

// User profile & management endpoints (/api/v2/user/...)
v2Router.get('/user/user-list', authenticateAny, EmployeeController.listLegacy);
v2Router.get('/user/all', authenticateAny, EmployeeController.listLegacy);
v2Router.get('/user/org/:orgId', authenticateAny, EmployeeController.listLegacy);
v2Router.get('/user/subordinates/:userId', authenticateAny, EmployeeController.listSubordinates);
v2Router.get('/user/:id/permissions', authenticateAny, EmployeeController.getPermissions);
v2Router.put(
  '/user/:userId/role/:prevRoleId/:roleId',
  authenticateAny,
  UserRoleController.replaceLegacy
);
v2Router.put('/user/:id/department/:departmentId', authenticateAny, EmployeeController.assignDepartment);
v2Router.get('/user/:id', authenticateAny, EmployeeController.getById);
v2Router.put('/user/:id', authenticateAny, EmployeeController.update);
v2Router.patch('/user/:id', authenticateAny, EmployeeController.update);
v2Router.delete('/user/:id', authenticateAny, EmployeeController.delete);
v2Router.get('/user', authenticateAny, EmployeeController.listLegacy);
v2Router.post('/user', authenticateAny, EmployeeController.create);

export default v2Router;
