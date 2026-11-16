import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn()
  },
  pushSubscription: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { NotificationController } from '../../src/modules/notifications/notification.controller.js';

describe('NotificationController - Push Subscriptions', () => {
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

  describe('saveSubscription', () => {
    it('creates a new push subscription when none exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prismaMock.pushSubscription.findUnique.mockResolvedValue(null);
      const createdSub = {
        id: 'sub-1',
        userId: 'user-1',
        endpoint: 'https://push.example.com/endpoint1',
        keys: { p256dh: 'key1', auth: 'auth1' },
        expirationTime: null
      };
      prismaMock.pushSubscription.create.mockResolvedValue(createdSub);

      const req = {
        body: {
          userId: 'user-1',
          subscription: {
            endpoint: 'https://push.example.com/endpoint1',
            keys: { p256dh: 'key1', auth: 'auth1' }
          }
        }
      } as unknown as Request;
      const res = mockRes();

      await NotificationController.saveSubscription(req, res, next);

      expect(prismaMock.pushSubscription.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          endpoint: 'https://push.example.com/endpoint1',
          keys: { p256dh: 'key1', auth: 'auth1' },
          expirationTime: null
        }
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: createdSub });
    });

    it('updates existing push subscription when endpoint already exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prismaMock.pushSubscription.findUnique.mockResolvedValue({ id: 'sub-1', endpoint: 'https://push.example.com/endpoint1' });
      const updatedSub = {
        id: 'sub-1',
        userId: 'user-1',
        endpoint: 'https://push.example.com/endpoint1',
        keys: { p256dh: 'key2', auth: 'auth2' },
        expirationTime: null
      };
      prismaMock.pushSubscription.update.mockResolvedValue(updatedSub);

      const req = {
        user: { id: 'user-1' },
        body: {
          subscription: {
            endpoint: 'https://push.example.com/endpoint1',
            keys: { p256dh: 'key2', auth: 'auth2' }
          }
        }
      } as unknown as Request;
      const res = mockRes();

      await NotificationController.saveSubscription(req, res, next);

      expect(prismaMock.pushSubscription.update).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com/endpoint1' },
        data: {
          userId: 'user-1',
          keys: { p256dh: 'key2', auth: 'auth2' },
          expirationTime: null
        }
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: updatedSub });
    });

    it('returns error when endpoint is missing', async () => {
      const req = {
        body: {
          userId: 'user-1',
          subscription: { keys: { p256dh: 'key' } }
        }
      } as unknown as Request;
      const res = mockRes();

      await NotificationController.saveSubscription(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('required')
      }));
    });

    it('returns error when user is not found in database', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const req = {
        body: {
          userId: 'non-existent',
          subscription: {
            endpoint: 'https://push.example.com/endpoint1',
            keys: { p256dh: 'key', auth: 'auth' }
          }
        }
      } as unknown as Request;
      const res = mockRes();

      await NotificationController.saveSubscription(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'User not found'
      }));
    });
  });

  describe('deleteSubscription', () => {
    it('deletes push subscription by endpoint from body', async () => {
      prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

      const req = {
        body: { endpoint: 'https://push.example.com/endpoint1' }
      } as unknown as Request;
      const res = mockRes();

      await NotificationController.deleteSubscription(req, res, next);

      expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com/endpoint1' }
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Subscription removed successfully' });
    });

    it('deletes push subscription by endpoint from query param', async () => {
      prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });

      const req = {
        body: {},
        query: { endpoint: 'https://push.example.com/endpoint2' }
      } as unknown as Request;
      const res = mockRes();

      await NotificationController.deleteSubscription(req, res, next);

      expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { endpoint: 'https://push.example.com/endpoint2' }
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('throws error when endpoint is completely missing', async () => {
      const req = {
        body: {},
        query: {}
      } as unknown as Request;
      const res = mockRes();

      await NotificationController.deleteSubscription(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('endpoint is required')
      }));
    });
  });
});
