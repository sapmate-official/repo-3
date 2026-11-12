import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import {
  requireAnyPermission,
  requirePermission
} from '../../middleware/requirePermission.js';
import { PERMISSION_KEYS } from '../auth/permissionKeys.js';
import {
  LeaveBalanceController,
  LeaveRequestController,
  LeaveTypeController
} from './leave.controller.js';

const leaveTypeReadPermissions = [
  PERMISSION_KEYS.leaveTypeRead,
  PERMISSION_KEYS.leaveTypeCreate,
  PERMISSION_KEYS.leaveTypeUpdate,
  PERMISSION_KEYS.leaveTypeDelete,
  PERMISSION_KEYS.leaveRequestCreate,
  PERMISSION_KEYS.leaveBalanceView,
  PERMISSION_KEYS.leaveSubordinatesView,
  PERMISSION_KEYS.leaveAllView
];

export const leaveTypeRouter = Router();

leaveTypeRouter.use(authenticateAny);

leaveTypeRouter.get(
  '/org/:org_id',
  requireOrgScope('org_id'),
  requireAnyPermission(leaveTypeReadPermissions),
  LeaveTypeController.list
);

leaveTypeRouter.get(
  '/:id',
  requireOrgScope(),
  requireAnyPermission(leaveTypeReadPermissions),
  LeaveTypeController.getById
);

leaveTypeRouter.post(
  '/',
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.leaveTypeCreate),
  LeaveTypeController.create
);

leaveTypeRouter.put(
  '/:id',
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.leaveTypeUpdate),
  LeaveTypeController.update
);

leaveTypeRouter.patch(
  '/:id',
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.leaveTypeUpdate),
  LeaveTypeController.update
);

leaveTypeRouter.delete(
  '/:id',
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.leaveTypeDelete),
  LeaveTypeController.delete
);

export const leaveRequestRouter = Router();

leaveRequestRouter.use(authenticateAny);

leaveRequestRouter.get(
  '/org/:id',
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.leaveAllView),
  LeaveRequestController.listOrganization
);

leaveRequestRouter.get(
  '/user/:id',
  requireOrgScope(),
  requireAnyPermission([
    PERMISSION_KEYS.leaveRequestCreate,
    PERMISSION_KEYS.leaveSubordinatesView,
    PERMISSION_KEYS.leaveAllView,
    PERMISSION_KEYS.leaveApprove,
    PERMISSION_KEYS.leaveReject
  ]),
  LeaveRequestController.listByUser
);

leaveRequestRouter.get(
  '/manager/:id',
  requireOrgScope(),
  LeaveRequestController.listByManager
);

leaveRequestRouter.post(
  '/approve/:id',
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.leaveApprove),
  LeaveRequestController.approve
);

leaveRequestRouter.post(
  '/reject/:id',
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.leaveReject),
  LeaveRequestController.reject
);

leaveRequestRouter.post(
  '/cancel/:id',
  requireOrgScope(),
  LeaveRequestController.cancel
);

leaveRequestRouter.get(
  '/:id',
  requireOrgScope(),
  requireAnyPermission([
    PERMISSION_KEYS.leaveRequestCreate,
    PERMISSION_KEYS.leaveSubordinatesView,
    PERMISSION_KEYS.leaveAllView,
    PERMISSION_KEYS.leaveApprove,
    PERMISSION_KEYS.leaveReject
  ]),
  LeaveRequestController.getById
);

leaveRequestRouter.post(
  '/',
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.leaveRequestCreate),
  LeaveRequestController.create
);

leaveRequestRouter.put(
  '/:id',
  requireOrgScope(),
  requireAnyPermission([
    PERMISSION_KEYS.leaveRequestCreate,
    PERMISSION_KEYS.leaveAllView
  ]),
  LeaveRequestController.update
);

leaveRequestRouter.patch(
  '/:id',
  requireOrgScope(),
  requireAnyPermission([
    PERMISSION_KEYS.leaveRequestCreate,
    PERMISSION_KEYS.leaveAllView
  ]),
  LeaveRequestController.update
);

leaveRequestRouter.delete(
  '/:id',
  requireOrgScope(),
  requireAnyPermission([
    PERMISSION_KEYS.leaveRequestCreate,
    PERMISSION_KEYS.leaveAllView
  ]),
  LeaveRequestController.delete
);

export const leaveBalanceRouter = Router();

leaveBalanceRouter.use(authenticateAny);

leaveBalanceRouter.get(
  '/',
  requireOrgScope(),
  requireAnyPermission([
    PERMISSION_KEYS.leaveAllView,
    PERMISSION_KEYS.leaveBalanceManage
  ]),
  LeaveBalanceController.list
);

leaveBalanceRouter.get(
  '/user/:userId',
  requireOrgScope(),
  LeaveBalanceController.listByUser
);

leaveBalanceRouter.get(
  '/:leavetypeId/:userId',
  requireOrgScope(),
  LeaveBalanceController.getByTypeAndUser
);

leaveBalanceRouter.get(
  '/:id',
  requireOrgScope(),
  LeaveBalanceController.getById
);

leaveBalanceRouter.post(
  '/',
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.leaveBalanceManage),
  LeaveBalanceController.create
);

leaveBalanceRouter.put(
  '/:id',
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.leaveBalanceManage),
  LeaveBalanceController.update
);

leaveBalanceRouter.patch(
  '/:id',
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.leaveBalanceManage),
  LeaveBalanceController.update
);

leaveBalanceRouter.delete(
  '/:id',
  requireOrgScope(),
  requirePermission(PERMISSION_KEYS.leaveBalanceManage),
  LeaveBalanceController.delete
);
