import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { authenticateSuperAdmin } from '../../middleware/superAdminAuth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { validate } from '../../middleware/validate.js';
import { OrganizationController } from './organization.controller.js';
import {
  adminParamsSchema,
  createOrganizationSchema,
  listOrganizationsQuerySchema,
  orgIdParamsSchema,
  setOrgAdminSchema,
  updateOrganizationSchema
} from './organization.schema.js';

export const organizationRouter = Router();

// Organization CRUD is a platform-level operation, restricted to super-admins.
organizationRouter.get(
  '/',
  authenticateSuperAdmin,
  validate({ query: listOrganizationsQuerySchema }),
  OrganizationController.list
);

organizationRouter.post(
  '/',
  authenticateSuperAdmin,
  validate({ body: createOrganizationSchema }),
  OrganizationController.create
);

organizationRouter.get(
  '/:orgId',
  authenticateSuperAdmin,
  validate({ params: orgIdParamsSchema }),
  OrganizationController.get
);

organizationRouter.put(
  '/:orgId',
  authenticateSuperAdmin,
  validate({ params: orgIdParamsSchema, body: updateOrganizationSchema }),
  OrganizationController.update
);

organizationRouter.patch(
  '/:orgId',
  authenticateSuperAdmin,
  validate({ params: orgIdParamsSchema, body: updateOrganizationSchema }),
  OrganizationController.update
);

organizationRouter.delete(
  '/:orgId',
  authenticateSuperAdmin,
  validate({ params: orgIdParamsSchema }),
  OrganizationController.remove
);

// Organization admin management is available to super-admins and the
// organization's own admins. requireOrgScope + requirePermission enforce both.
const orgAdminGuards = [
  authenticateAny,
  requireOrgScope('orgId'),
  requirePermission('manage_organization')
] as const;

organizationRouter.get(
  '/:orgId/admins',
  ...orgAdminGuards,
  validate({ params: orgIdParamsSchema }),
  OrganizationController.listAdmins
);

organizationRouter.post(
  '/:orgId/admins',
  ...orgAdminGuards,
  validate({ params: orgIdParamsSchema, body: setOrgAdminSchema }),
  OrganizationController.setAdmin
);

organizationRouter.delete(
  '/:orgId/admins/:adminId',
  ...orgAdminGuards,
  validate({ params: adminParamsSchema }),
  OrganizationController.removeAdmin
);
