import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import type { Prisma } from '@prisma/client';
import {
  createSubscriptionPlanSchema,
  updateSubscriptionPlanSchema,
  planIdParamsSchema
} from './subscription-plan.schema.js';

const strParam = (val: unknown): string | undefined => {
  if (Array.isArray(val)) {
    const first: unknown = val[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
};

export class SubscriptionPlanController {
  // GET /api/v2/subscription-plan
  static async getSubscriptionPlans(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await prisma.subscriptionPlan.findMany({
        orderBy: {
          monthlyPrice: 'asc'
        },
        include: {
          _count: {
            select: { organizations: true }
          }
        }
      });

      res.status(200).json(plans);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/subscription-plan/:id
  static async getSubscriptionPlanById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Subscription plan ID is required', 400, 'BAD_REQUEST');
      }

      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id },
        include: {
          _count: {
            select: { organizations: true }
          }
        }
      });

      if (!plan) {
        throw new AppError('Subscription plan not found', 404, 'NOT_FOUND');
      }

      res.status(200).json(plan);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/subscription-plan
  static async createSubscriptionPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedBody = createSubscriptionPlanSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError(
          parsedBody.error.issues.map((i) => i.message).join(', '),
          400,
          'VALIDATION_ERROR'
        );
      }

      const { name, description, monthlyPrice, annualPrice, maxUsers, features, isActive } =
        parsedBody.data;

      const existingPlan = await prisma.subscriptionPlan.findUnique({
        where: { name }
      });

      if (existingPlan) {
        throw new AppError('A subscription plan with this name already exists', 409, 'CONFLICT');
      }

      const newPlan = await prisma.subscriptionPlan.create({
        data: {
          name,
          description: description ?? null,
          monthlyPrice,
          annualPrice,
          maxUsers,
          features: (features ?? undefined) as Prisma.InputJsonValue | undefined,
          isActive: isActive ?? true
        }
      });

      res.status(201).json(newPlan);
    } catch (error) {
      next(error);
    }
  }

  // PUT or PATCH /api/v2/subscription-plan/:id
  static async updateSubscriptionPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Subscription plan ID is required', 400, 'BAD_REQUEST');
      }

      const parsedBody = updateSubscriptionPlanSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError(
          parsedBody.error.issues.map((i) => i.message).join(', '),
          400,
          'VALIDATION_ERROR'
        );
      }

      const existingPlan = await prisma.subscriptionPlan.findUnique({
        where: { id },
        include: {
          _count: {
            select: { organizations: true }
          }
        }
      });

      if (!existingPlan) {
        throw new AppError('Subscription plan not found', 404, 'NOT_FOUND');
      }

      const data = parsedBody.data;

      if (data.name && data.name !== existingPlan.name) {
        const duplicate = await prisma.subscriptionPlan.findUnique({
          where: { name: data.name }
        });
        if (duplicate) {
          throw new AppError('A subscription plan with this name already exists', 409, 'CONFLICT');
        }
      }

      const updateData: Prisma.SubscriptionPlanUpdateInput = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.monthlyPrice !== undefined) updateData.monthlyPrice = data.monthlyPrice;
      if (data.annualPrice !== undefined) updateData.annualPrice = data.annualPrice;
      if (data.maxUsers !== undefined) updateData.maxUsers = data.maxUsers;
      if (data.features !== undefined) {
        updateData.features = data.features as Prisma.InputJsonValue;
      }
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      const updatedPlan = await prisma.subscriptionPlan.update({
        where: { id },
        data: updateData
      });

      res.status(200).json({
        ...updatedPlan,
        organizationCount: existingPlan._count.organizations
      });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/v2/subscription-plan/:id
  static async deleteSubscriptionPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Subscription plan ID is required', 400, 'BAD_REQUEST');
      }

      const existingPlan = await prisma.subscriptionPlan.findUnique({
        where: { id },
        include: {
          _count: {
            select: { organizations: true }
          }
        }
      });

      if (!existingPlan) {
        throw new AppError('Subscription plan not found', 404, 'NOT_FOUND');
      }

      if (existingPlan._count.organizations > 0) {
        throw new AppError(
          `Cannot delete plan currently assigned to ${existingPlan._count.organizations} organization(s)`,
          400,
          'PLAN_IN_USE'
        );
      }

      await prisma.subscriptionPlan.delete({
        where: { id }
      });

      res.status(200).json({ message: 'Subscription plan deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v2/subscription-plan/:id/toggle-status
  static async toggleSubscriptionPlanStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Subscription plan ID is required', 400, 'BAD_REQUEST');
      }

      const existingPlan = await prisma.subscriptionPlan.findUnique({
        where: { id }
      });

      if (!existingPlan) {
        throw new AppError('Subscription plan not found', 404, 'NOT_FOUND');
      }

      const updatedPlan = await prisma.subscriptionPlan.update({
        where: { id },
        data: {
          isActive: !existingPlan.isActive
        }
      });

      res.status(200).json(updatedPlan);
    } catch (error) {
      next(error);
    }
  }
}
