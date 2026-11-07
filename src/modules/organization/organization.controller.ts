import { type NextFunction, type Request, type Response } from 'express';
import { logger } from '../../config/logger.js';
import { isAppError } from '../../util/errors.js';
import { OrganizationService } from './organization.service.js';
import type {
  CreateOrganizationInput,
  ListOrganizationsQuery,
  SetOrgAdminInput,
  UpdateOrganizationInput
} from './organization.schema.js';

const respondError = (error: unknown, res: Response, next: NextFunction): void => {
  if (isAppError(error)) {
    logger.warn({ code: error.code }, error.message);
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }

  next(error);
};

export class OrganizationController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as unknown as ListOrganizationsQuery;
      const result = await OrganizationService.list(query);
      res.status(200).json(result);
    } catch (error) {
      respondError(error, res, next);
    }
  }

  static async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orgId } = req.params as { orgId: string };
      const organization = await OrganizationService.get(orgId);
      res.status(200).json(organization);
    } catch (error) {
      respondError(error, res, next);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = req.body as CreateOrganizationInput;
      const organization = await OrganizationService.create(input);
      res.status(201).json(organization);
    } catch (error) {
      respondError(error, res, next);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orgId } = req.params as { orgId: string };
      const input = req.body as UpdateOrganizationInput;
      const organization = await OrganizationService.update(orgId, input);
      res.status(200).json(organization);
    } catch (error) {
      respondError(error, res, next);
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orgId } = req.params as { orgId: string };
      await OrganizationService.remove(orgId);
      res.status(204).send();
    } catch (error) {
      respondError(error, res, next);
    }
  }

  static async listAdmins(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orgId } = req.params as { orgId: string };
      const admins = await OrganizationService.listAdmins(orgId);
      res.status(200).json({ data: admins });
    } catch (error) {
      respondError(error, res, next);
    }
  }

  static async setAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orgId } = req.params as { orgId: string };
      const { userId } = req.body as SetOrgAdminInput;
      const admin = await OrganizationService.setAdmin(orgId, userId);
      res.status(201).json(admin);
    } catch (error) {
      respondError(error, res, next);
    }
  }

  static async removeAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orgId, adminId } = req.params as { orgId: string; adminId: string };
      await OrganizationService.removeAdmin(orgId, adminId);
      res.status(204).send();
    } catch (error) {
      respondError(error, res, next);
    }
  }
}
