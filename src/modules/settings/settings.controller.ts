import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import type { Prisma } from '@prisma/client';
import { updateSettingsSchema } from './settings.schema.js';

const strParam = (val: unknown): string | undefined => {
  if (Array.isArray(val)) {
    const first: unknown = val[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
};

export class SettingsController {
  // GET /api/v3/settings/:orgId
  static async fetchSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization ID is required', 400, 'BAD_REQUEST');
      }

      let settingsRecord = await prisma.organizationSettings.findFirst({
        where: { orgId }
      });

      settingsRecord ??= await prisma.organizationSettings.create({
        data: {
          orgId,
          settings: { weekoff: [0, 6] }
        }
      });

      res.status(200).json(settingsRecord);
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/v3/settings/:orgId
  static async updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization ID is required', 400, 'BAD_REQUEST');
      }

      const parsedBody = updateSettingsSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError(parsedBody.error.issues[0]?.message ?? 'Invalid settings format', 400, 'VALIDATION_ERROR');
      }

      const settingsData = parsedBody.data.settings as Prisma.InputJsonValue;

      const existingRecord = await prisma.organizationSettings.findFirst({
        where: { orgId }
      });

      let updated;
      if (!existingRecord) {
        updated = await prisma.organizationSettings.create({
          data: {
            orgId,
            settings: settingsData
          }
        });
      } else {
        updated = await prisma.organizationSettings.update({
          where: { id: existingRecord.id },
          data: { settings: settingsData }
        });
      }

      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v3/settings/reset/:orgId
  static async resetSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization ID is required', 400, 'BAD_REQUEST');
      }

      const defaultSettings = { weekoff: [0, 6] };

      const existingSettings = await prisma.organizationSettings.findFirst({
        where: { orgId }
      });

      if (!existingSettings) {
        await prisma.organizationSettings.create({
          data: {
            orgId,
            settings: defaultSettings
          }
        });
      } else {
        await prisma.organizationSettings.updateMany({
          where: { orgId },
          data: { settings: defaultSettings }
        });
      }

      res.status(200).json({ message: 'Settings reset successfully' });
    } catch (error) {
      next(error);
    }
  }
}
