import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const prismaMock = vi.hoisted(() => ({
  user: {
    findMany: vi.fn(),
    findFirst: vi.fn()
  },
  leaveRequest: {
    findMany: vi.fn()
  },
  billingRecord: {
    findMany: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { EventController } from '../../src/modules/events/events.controller.js';

describe('EventController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  it('aggregates events matching frontend SpecialEvent contract', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.leaveRequest.findMany.mockResolvedValue([]);
    prismaMock.billingRecord.findMany.mockResolvedValue([
      {
        id: 'bill-1',
        orgId: 'org-1',
        dueDate: new Date(Date.now() + 86400000 * 3),
        totalAmount: 5000,
        status: 'PENDING'
      }
    ]);

    const req = {
      user: { id: 'admin-1', orgId: 'org-1', roles: ['Org_Admin'] }
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await EventController.getEvents(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            type: 'BILL',
            title: 'Subscription Payment Due',
            priority: 'medium'
          })
        ])
      })
    );
  });
});
