import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const prismaMock = vi.hoisted(() => ({
  activityLog: {
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn()
  },
  user: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { ActivityLogController } from '../../src/modules/activity-logs/activity-log.controller.js';
import { ActivityService } from '../../src/modules/activity-logs/activity-log.service.js';

describe('ActivityLogController & Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  it('scoping limits regular employee to own activities', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      orgId: 'org-1',
      roles: []
    });
    prismaMock.activityLog.findMany.mockResolvedValue([]);
    prismaMock.activityLog.count.mockResolvedValue(0);

    const result = await ActivityService.list(
      'org-1',
      { id: 'user-1', orgId: 'org-1' },
      { page: 1, limit: 10 }
    );

    expect(result.data).toEqual([]);
    expect(prismaMock.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { orgId: 'org-1' },
            { OR: [{ actorId: 'user-1' }, { targetId: 'user-1' }] }
          ])
        })
      })
    );
  });

  it('Org_Admin can query all organization logs', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      orgId: 'org-1',
      roles: [
        {
          role: {
            name: 'Org_Admin',
            permissions: []
          }
        }
      ]
    });
    prismaMock.activityLog.findMany.mockResolvedValue([]);
    prismaMock.activityLog.count.mockResolvedValue(0);

    const result = await ActivityService.list(
      'org-1',
      { id: 'admin-1', orgId: 'org-1' },
      { page: 1, limit: 10 }
    );

    expect(result.pagination.totalCount).toBe(0);
    expect(prismaMock.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [{ orgId: 'org-1' }]
        })
      })
    );
  });

  it('list controller returns formatted response envelope', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      orgId: 'org-1',
      roles: [
        {
          role: {
            name: 'Org_Admin',
            permissions: []
          }
        }
      ]
    });
    prismaMock.activityLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        orgId: 'org-1',
        actorId: 'user-1',
        action: 'SIGN_IN',
        entity: 'USER',
        entityId: 'user-1',
        targetId: 'user-1',
        description: 'User signed in',
        metadata: {},
        ipAddress: '127.0.0.1',
        userAgent: 'test',
        createdAt: new Date(),
        actor: { firstName: 'Alice', lastName: 'Smith', email: 'alice@test.com', employeeId: 'E1', department: null },
        target: null
      }
    ]);
    prismaMock.activityLog.count.mockResolvedValue(1);

    const req = {
      user: { id: 'admin-1', orgId: 'org-1' },
      query: { page: '1', limit: '10' }
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await ActivityLogController.list(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'log-1',
            actor: expect.objectContaining({ name: 'Alice Smith' })
          })
        ]),
        pagination: expect.objectContaining({ totalCount: 1, page: 1 })
      })
    );
  });
});
