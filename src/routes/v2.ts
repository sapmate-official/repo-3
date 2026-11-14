import { Router } from 'express';
import { authenticateAny } from '../middleware/auth.js';
import { requireOrgScope } from '../middleware/requireOrgScope.js';
import { requirePermission, requireSelfOrPermission } from '../middleware/requirePermission.js';
import { PERMISSION_KEYS } from '../modules/auth/permissionKeys.js';
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
import attendanceRouter from '../modules/attendance/attendance.router.js';
import {
  leaveBalanceRouter,
  leaveRequestRouter,
  leaveTypeRouter
} from '../modules/leave/leave.router.js';
import { holidayRouter, holidayTypeRouter } from '../modules/holiday/holiday.router.js';
import { bankRouter } from '../modules/bank/bank.router.js';
import { UserRoleController } from '../modules/role/userRole.controller.js';
import { EmployeeController } from '../modules/employee/employee.controller.js';

export const v2Router = Router();

// ==========================================
// Compatibility Routes for Legacy Frontend (v2)
// ==========================================

// Attendance module
v2Router.use('/attendance', attendanceRouter);

// Leave modules
v2Router.use('/leave-type', leaveTypeRouter);
v2Router.use('/leave-types', leaveTypeRouter);
v2Router.use('/leave-request', leaveRequestRouter);
v2Router.use('/leave-requests', leaveRequestRouter);
v2Router.use('/leave-balance', leaveBalanceRouter);
v2Router.use('/leave-balances', leaveBalanceRouter);

// Public endpoints (no auth required)
v2Router.use('/public', publicRouter);

// Dashboard endpoints
v2Router.use('/dashboard', dashboardRouter);
v2Router.use('/screen/dashboard', dashboardRouter);

// Organization endpoints
v2Router.get(
  '/organization/employee-list/:orgId',
  authenticateAny,
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.userRead),
  EmployeeController.listLegacy
);
v2Router.get(
  '/organization/employees/:orgId',
  authenticateAny,
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.userRead),
  EmployeeController.listLegacy
);
v2Router.get(
  '/organization/employees/employee-id/:orgId',
  authenticateAny,
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.userWrite),
  EmployeeController.generateId
);
v2Router.get(
  '/organization/employees/employee-id/:orgId/check/:employeeId',
  authenticateAny,
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.userWrite),
  EmployeeController.checkId
);
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

// Holiday endpoints
v2Router.use('/holiday', holidayRouter);
v2Router.use('/holidays', holidayRouter);
v2Router.use('/holiday-type', holidayTypeRouter);
v2Router.use('/holiday-types', holidayTypeRouter);

// Bank Details endpoints
v2Router.use('/bank-details', bankRouter);
v2Router.use('/bank', bankRouter);

// User profile & management endpoints (/api/v2/user/...)
v2Router.get(
  '/user/user-list',
  authenticateAny,
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.userRead),
  EmployeeController.listLegacy
);
v2Router.get(
  '/user/all',
  authenticateAny,
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.userRead),
  EmployeeController.listLegacy
);
v2Router.get(
  '/user/org/:orgId',
  authenticateAny,
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.userRead),
  EmployeeController.listLegacy
);
v2Router.get(
  '/user/subordinates/:userId',
  authenticateAny,
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.viewSubordinates),
  EmployeeController.listSubordinates
);
v2Router.get(
  '/user/:id/permissions',
  authenticateAny,
  requireOrgScope(),
  requireSelfOrPermission(PERMISSION_KEYS.userRead),
  EmployeeController.getPermissions
);
v2Router.put(
  '/user/:userId/role/:prevRoleId/:roleId',
  authenticateAny,
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.roleManage),
  UserRoleController.replaceLegacy
);
v2Router.put(
  '/user/:id/department/:departmentId',
  authenticateAny,
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.userWrite),
  EmployeeController.assignDepartment
);
v2Router.get(
  '/user/:id',
  authenticateAny,
  requireOrgScope(),
  requireSelfOrPermission(PERMISSION_KEYS.userRead),
  EmployeeController.getById
);
v2Router.put(
  '/user/:id',
  authenticateAny,
  requireOrgScope(),
  requireSelfOrPermission(PERMISSION_KEYS.userWrite),
  EmployeeController.update
);
v2Router.patch(
  '/user/:id',
  authenticateAny,
  requireOrgScope(),
  requireSelfOrPermission(PERMISSION_KEYS.userWrite),
  EmployeeController.update
);
v2Router.delete(
  '/user/:id',
  authenticateAny,
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.userWrite),
  EmployeeController.delete
);
v2Router.get(
  '/user',
  authenticateAny,
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.userRead),
  EmployeeController.listLegacy
);
v2Router.post(
  '/user',
  authenticateAny,
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.userWrite),
  EmployeeController.create
);

export default v2Router;
