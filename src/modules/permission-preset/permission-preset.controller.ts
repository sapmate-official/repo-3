import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import type { Prisma } from '@prisma/client';
import { createPresetSchema, updatePresetSchema } from './permission-preset.schema.js';

const strParam = (val: unknown): string | undefined => {
  if (Array.isArray(val)) {
    const first: unknown = val[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
};

export class PermissionPresetController {
  // GET /api/v3/permission-preset/org/:orgId
  static async getPresets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization ID is required', 400, 'BAD_REQUEST');
      }

      const presets = await prisma.permissionPreset.findMany({
        where: { orgId }
      });

      res.status(200).json(presets);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v3/permission-preset/:id
  static async getPresetById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Preset ID is required', 400, 'BAD_REQUEST');
      }

      const preset = await prisma.permissionPreset.findUnique({
        where: { id }
      });

      if (!preset) {
        throw new AppError('Preset not found', 404, 'NOT_FOUND');
      }

      res.status(200).json(preset);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v3/permission-preset
  static async createPreset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedBody = createPresetSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError(parsedBody.error.issues[0]?.message ?? 'Invalid preset data', 400, 'VALIDATION_ERROR');
      }

      const { orgId, name, description, permissions } = parsedBody.data;

      // Check if preset with same name exists in organization
      const existing = await prisma.permissionPreset.findFirst({
        where: { orgId, name }
      });

      if (existing) {
        throw new AppError('Preset with this name already exists', 400, 'DUPLICATE_PRESET');
      }

      const preset = await prisma.permissionPreset.create({
        data: {
          orgId,
          name,
          description,
          permissions: permissions ?? []
        }
      });

      res.status(201).json(preset);
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/v3/permission-preset/:id
  static async updatePreset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Preset ID is required', 400, 'BAD_REQUEST');
      }

      const parsedBody = updatePresetSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError(parsedBody.error.issues[0]?.message ?? 'Invalid update data', 400, 'VALIDATION_ERROR');
      }

      const existingPreset = await prisma.permissionPreset.findUnique({
        where: { id }
      });

      if (!existingPreset) {
        throw new AppError('Preset not found', 404, 'NOT_FOUND');
      }

      const { name, description, permissions } = parsedBody.data;

      const updateData: Prisma.PermissionPresetUpdateInput = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (permissions !== undefined) updateData.permissions = permissions as Prisma.InputJsonValue;

      const updated = await prisma.permissionPreset.update({
        where: { id },
        data: updateData
      });

      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/v3/permission-preset/:id
  static async deletePreset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Preset ID is required', 400, 'BAD_REQUEST');
      }

      const existingPreset = await prisma.permissionPreset.findUnique({
        where: { id }
      });

      if (!existingPreset) {
        throw new AppError('Preset not found', 404, 'NOT_FOUND');
      }

      await prisma.permissionPreset.delete({
        where: { id }
      });

      res.status(200).json({ message: 'Preset deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}
