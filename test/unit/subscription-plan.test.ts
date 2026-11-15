import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const prismaMock = vi.hoisted(() => ({
  subscriptionPlan: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { SubscriptionPlanController } from '../../src/modules/subscription-plan/subscription-plan.controller.js';

describe('SubscriptionPlanController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const next: NextFunction = vi.fn();

  it('lists subscription plans sorted by monthly price', async () => {
    const plans = [
      { id: 'plan-1', name: 'Starter', monthlyPrice: 10, _count: { organizations: 2 } },
      { id: 'plan-2', name: 'Enterprise', monthlyPrice: 50, _count: { organizations: 5 } }
    ];
    prismaMock.subscriptionPlan.findMany.mockResolvedValue(plans);

    const req = {} as Request;
    const res = mockRes();

    await SubscriptionPlanController.getSubscriptionPlans(req, res, next);

    expect(prismaMock.subscriptionPlan.findMany).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(plans);
  });

  it('retrieves single subscription plan with organization count', async () => {
    const plan = { id: 'plan-1', name: 'Starter', monthlyPrice: 10, _count: { organizations: 2 } };
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue(plan);

    const req = { params: { id: 'plan-1' } } as unknown as Request;
    const res = mockRes();

    await SubscriptionPlanController.getSubscriptionPlanById(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(plan);
  });

  it('creates a new subscription plan when valid and unique', async () => {
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue(null);
    const createdPlan = {
      id: 'plan-new',
      name: 'Growth',
      monthlyPrice: 25,
      annualPrice: 250,
      maxUsers: 50,
      isActive: true
    };
    prismaMock.subscriptionPlan.create.mockResolvedValue(createdPlan);

    const req = {
      body: {
        name: 'Growth',
        description: 'Mid-tier business plan',
        monthlyPrice: 25,
        annualPrice: 250,
        maxUsers: 50
      }
    } as Request;
    const res = mockRes();

    await SubscriptionPlanController.createSubscriptionPlan(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(createdPlan);
  });

  it('prevents creating duplicate plan names', async () => {
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue({ id: 'plan-existing', name: 'Starter' });

    const req = {
      body: {
        name: 'Starter',
        monthlyPrice: 10,
        annualPrice: 100
      }
    } as Request;
    const res = mockRes();

    await SubscriptionPlanController.createSubscriptionPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'A subscription plan with this name already exists'
      })
    );
  });

  it('prevents deleting plan when assigned to organizations', async () => {
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue({
      id: 'plan-in-use',
      name: 'Starter',
      _count: { organizations: 3 }
    });

    const req = { params: { id: 'plan-in-use' } } as unknown as Request;
    const res = mockRes();

    await SubscriptionPlanController.deleteSubscriptionPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Cannot delete plan currently assigned to 3 organization(s)')
      })
    );
  });

  it('toggles subscription plan active status', async () => {
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue({
      id: 'plan-1',
      isActive: true
    });
    prismaMock.subscriptionPlan.update.mockResolvedValue({
      id: 'plan-1',
      isActive: false
    });

    const req = { params: { id: 'plan-1' } } as unknown as Request;
    const res = mockRes();

    await SubscriptionPlanController.toggleSubscriptionPlanStatus(req, res, next);

    expect(prismaMock.subscriptionPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { isActive: false }
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
