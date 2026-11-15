import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const prismaMock = vi.hoisted(() => ({
  notification: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    create: vi.fn()
  },
  notificationTemplate: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { NotificationController } from '../../src/modules/notifications/notification.controller.js';

describe('NotificationController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  it('lists notifications for authenticated user', async () => {
    prismaMock.notification.findMany.mockResolvedValue([
      {
        id: 'notif-1',
        userId: 'user-1',
        content: 'Your leave has been approved',
        isRead: false,
        readAt: null,
        metadata: { type: 'LEAVE', priority: 'HIGH' },
        createdAt: new Date(),
        template: { subject: 'Leave Update', orgId: 'org-1' }
      }
    ]);
    prismaMock.notification.count.mockResolvedValue(1);

    const req = {
      user: { id: 'user-1', orgId: 'org-1' },
      query: { page: '1', limit: '10' }
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await NotificationController.list(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'notif-1',
            message: 'Your leave has been approved',
            isRead: false
          })
        ])
      })
    );
  });

  it('marks a notification as read', async () => {
    prismaMock.notification.findFirst.mockResolvedValue({
      id: 'notif-1',
      userId: 'user-1'
    });
    prismaMock.notification.update.mockResolvedValue({
      id: 'notif-1',
      userId: 'user-1',
      content: 'Hello',
      isRead: true,
      readAt: new Date(),
      metadata: {},
      createdAt: new Date(),
      template: { subject: 'Notice', orgId: 'org-1' }
    });

    const req = {
      user: { id: 'user-1', orgId: 'org-1' },
      params: { id: 'notif-1' }
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await NotificationController.markRead(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: 'notif-1',
          isRead: true
        })
      })
    );
  });
});
