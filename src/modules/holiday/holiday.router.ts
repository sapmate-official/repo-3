import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { requireAnyPermission } from '../../middleware/requirePermission.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSION_KEYS } from '../auth/permissionKeys.js';
import { HolidayController, HolidayTypeController } from './holiday.controller.js';
import {
  holidayIdParamSchema,
  holidayTypeIdParamSchema,
  orgIdParamSchema,
  createHolidaySchema,
  updateHolidaySchema,
  listHolidaysQuerySchema,
  holidayCalendarQuerySchema,
  upcomingHolidaysQuerySchema,
  bulkCreateHolidaySchema,
  toggleHolidaySchema,
  createHolidayTypeSchema,
  updateHolidayTypeSchema
} from './holiday.schema.js';

const viewPermissions = [
  PERMISSION_KEYS.holidayView,
  'view_holiday'
];

const managePermissions = [
  PERMISSION_KEYS.holidayManage,
  PERMISSION_KEYS.holidayCreate,
  PERMISSION_KEYS.holidayUpdate,
  PERMISSION_KEYS.holidayDelete
];

// --- Holiday Router ---
export const holidayRouter = Router();

// Calendar and upcoming sub-resources (must be defined BEFORE /:id to prevent route shadowing)
holidayRouter.get(
  '/calendar',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(viewPermissions),
  validate({ query: holidayCalendarQuerySchema }),
  HolidayController.getCalendar
);

holidayRouter.get(
  '/upcoming',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(viewPermissions),
  validate({ query: upcomingHolidaysQuerySchema }),
  HolidayController.getUpcoming
);

// Bulk creation
holidayRouter.post(
  '/bulk',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(managePermissions),
  validate({ body: bulkCreateHolidaySchema }),
  HolidayController.bulkCreate
);

// List by orgId alias (legacy support)
holidayRouter.get(
  '/org/:orgId',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(viewPermissions),
  validate({ params: orgIdParamSchema, query: listHolidaysQuerySchema }),
  HolidayController.list
);

// Base list and create
holidayRouter.get(
  '/',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(viewPermissions),
  validate({ query: listHolidaysQuerySchema }),
  HolidayController.list
);

holidayRouter.post(
  '/',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(managePermissions),
  validate({ body: createHolidaySchema }),
  HolidayController.create
);

// Toggle status
holidayRouter.patch(
  '/:id/toggle',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(managePermissions),
  validate({ params: holidayIdParamSchema, body: toggleHolidaySchema }),
  HolidayController.toggle
);

// Single holiday operations
holidayRouter.get(
  '/:id',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(viewPermissions),
  validate({ params: holidayIdParamSchema }),
  HolidayController.getById
);

holidayRouter.put(
  '/:id',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(managePermissions),
  validate({ params: holidayIdParamSchema, body: updateHolidaySchema }),
  HolidayController.update
);

holidayRouter.patch(
  '/:id',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(managePermissions),
  validate({ params: holidayIdParamSchema, body: updateHolidaySchema }),
  HolidayController.update
);

holidayRouter.delete(
  '/:id',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(managePermissions),
  validate({ params: holidayIdParamSchema }),
  HolidayController.delete
);

// --- Holiday Type Router ---
export const holidayTypeRouter = Router();

// List by orgId alias (legacy support)
holidayTypeRouter.get(
  '/org/:orgId',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(viewPermissions),
  validate({ params: orgIdParamSchema }),
  HolidayTypeController.list
);

// Base list and create
holidayTypeRouter.get(
  '/',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(viewPermissions),
  HolidayTypeController.list
);

holidayTypeRouter.post(
  '/',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(managePermissions),
  validate({ body: createHolidayTypeSchema }),
  HolidayTypeController.create
);

// Single holiday type operations
holidayTypeRouter.get(
  '/:id',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(viewPermissions),
  validate({ params: holidayTypeIdParamSchema }),
  HolidayTypeController.getById
);

holidayTypeRouter.put(
  '/:id',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(managePermissions),
  validate({ params: holidayTypeIdParamSchema, body: updateHolidayTypeSchema }),
  HolidayTypeController.update
);

holidayTypeRouter.patch(
  '/:id',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(managePermissions),
  validate({ params: holidayTypeIdParamSchema, body: updateHolidayTypeSchema }),
  HolidayTypeController.update
);

holidayTypeRouter.delete(
  '/:id',
  authenticateAny,
  requireOrgScope(),
  requireAnyPermission(managePermissions),
  validate({ params: holidayTypeIdParamSchema }),
  HolidayTypeController.delete
);
