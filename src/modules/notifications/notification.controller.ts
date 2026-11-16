import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import type { NotificationType, Prisma } from '@prisma/client';

const strParam = (val: unknown): string | undefined => {
  if (Array.isArray(val)) {
    const first: unknown = val[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
};

type NotificationWithIncludes = Prisma.NotificationGetPayload<{
  include: {
    template: true;
    user: { select: { id: true; firstName: true; lastName: true; email: true; orgId: true } };
  };
}>;

function getMetaString(meta: Prisma.JsonValue | null | undefined, key: string): string | undefined {
  if (meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
    const val = (meta as Record<string, unknown>)[key];
    return typeof val === 'string' ? val : undefined;
  }
  return undefined;
}

const formatNotification = (n: NotificationWithIncludes) => {
  const metaTitle = getMetaString(n.metadata, 'title');
  const metaType = getMetaString(n.metadata, 'type');
  const metaCategory = getMetaString(n.metadata, 'category');
  const metaPriority = getMetaString(n.metadata, 'priority');
  const metaActionUrl = getMetaString(n.metadata, 'actionUrl');
  const metaActionText = getMetaString(n.metadata, 'actionText');

  return {
    id: n.id,
    title: n.template?.subject ?? n.template?.name ?? metaTitle ?? 'Notification',
    message: n.content,
    type: metaType ?? 'INFO',
    category: metaCategory ?? 'GENERAL',
    priority: metaPriority ?? 'MEDIUM',
    recipientId: n.userId,
    organizationId: n.template?.orgId ?? n.user?.orgId,
    isRead: n.isRead,
    readAt: n.readAt,
    actionUrl: metaActionUrl,
    actionText: metaActionText,
    metadata: n.metadata,
    createdAt: n.createdAt,
    updatedAt: n.createdAt,
    recipient: n.user
      ? {
          id: n.user.id,
          firstName: n.user.firstName,
          lastName: n.user.lastName,
          email: n.user.email
        }
      : undefined,
    template: n.template
  };
};

async function getOrCreateDefaultTemplate(orgId: string): Promise<string> {
  const existing = await prisma.notificationTemplate.findFirst({
    where: { orgId }
  });
  if (existing) return existing.id;

  const created = await prisma.notificationTemplate.create({
    data: {
      orgId,
      name: 'System Notification',
      type: 'IN_APP',
      subject: 'System Alert',
      content: 'General notification'
    }
  });
  return created.id;
}

interface PushSubscriptionPayload {
  userId?: string;
  subscription?: {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: Record<string, unknown>;
  };
}

export class NotificationController {
  // GET /api/v2/notification
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('User authentication required', 401, 'UNAUTHORIZED');
      }

      const { unreadOnly, page = '1', limit = '50' } = req.query as Record<string, string | undefined>;

      const where: Prisma.NotificationWhereInput = { userId };
      if (unreadOnly === 'true') {
        where.isRead = false;
      }

      const limitNum = parseInt(limit ?? '50', 10);
      const pageNum = parseInt(page ?? '1', 10);
      const take = Math.min(Number.isNaN(limitNum) ? 50 : limitNum, 100);
      const validPage = Number.isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
      const skip = (validPage - 1) * take;

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: {
            template: true,
            user: { select: { id: true, firstName: true, lastName: true, email: true, orgId: true } }
          }
        }),
        prisma.notification.count({ where })
      ]);

      const formatted = notifications.map(formatNotification);

      res.status(200).json({
        success: true,
        data: formatted,
        pagination: {
          page: validPage,
          limit: take,
          total,
          totalPages: Math.max(1, Math.ceil(total / take))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/notification/stats
  static async stats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = strParam(req.query.userId) ?? req.user?.id;
      if (!userId) {
        throw new AppError('User authentication required', 401, 'UNAUTHORIZED');
      }

      const [total, unread] = await Promise.all([
        prisma.notification.count({ where: { userId } }),
        prisma.notification.count({ where: { userId, isRead: false } })
      ]);

      res.status(200).json({
        success: true,
        data: {
          total,
          unread,
          read: total - unread
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/notification/:id
  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Notification ID is required', 400, 'BAD_REQUEST');
      }

      const notification = await prisma.notification.findUnique({
        where: { id },
        include: {
          template: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true, orgId: true } }
        }
      });

      if (!notification) {
        throw new AppError('Notification not found', 404, 'NOT_FOUND');
      }

      res.status(200).json({
        success: true,
        data: formatNotification(notification)
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/notification/user/:userId
  static async listByUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetUserId = strParam(req.params.userId) ?? req.user?.id;
      if (!targetUserId) {
        throw new AppError('User ID is required', 400, 'BAD_REQUEST');
      }

      const { unreadOnly } = req.query as Record<string, string | undefined>;

      const where: Prisma.NotificationWhereInput = { userId: targetUserId };
      if (unreadOnly === 'true') {
        where.isRead = false;
      }

      const notifications = await prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          template: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true, orgId: true } }
        }
      });

      res.status(200).json({
        success: true,
        data: notifications.map(formatNotification)
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/notification
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      const callerId = req.user?.id;
      if (!orgId || !callerId) {
        throw new AppError('Organization context required', 401, 'ORG_CONTEXT_MISSING');
      }

      const body = req.body as Record<string, unknown>;
      const recipientIds = Array.isArray(body.recipientIds)
        ? (body.recipientIds as unknown[]).filter((x): x is string => typeof x === 'string')
        : undefined;
      const singleUserId = typeof body.userId === 'string' ? body.userId : undefined;
      const targetUsers: string[] = recipientIds ?? (singleUserId ? [singleUserId] : [callerId]);

      const content = typeof body.content === 'string' ? body.content : undefined;
      const message = typeof body.message === 'string' ? body.message : undefined;
      const title = typeof body.title === 'string' ? body.title : undefined;
      const bodyContent = content ?? message ?? title ?? 'Notification alert';

      const templateId = typeof body.templateId === 'string' ? body.templateId : undefined;
      const effectiveTemplateId = templateId ?? (await getOrCreateDefaultTemplate(orgId));

      const inputMeta =
        typeof body.metadata === 'object' && body.metadata !== null && !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : {};

      const mergedMeta: Prisma.InputJsonValue = {
        title: title ?? 'Notification',
        ...inputMeta
      };

      const created = await Promise.all(
        targetUsers.map((uid) =>
          prisma.notification.create({
            data: {
              userId: uid,
              templateId: effectiveTemplateId,
              content: bodyContent,
              metadata: mergedMeta
            },
            include: {
              template: true,
              user: { select: { id: true, firstName: true, lastName: true, email: true, orgId: true } }
            }
          })
        )
      );

      const formatted = created.map(formatNotification);

      res.status(201).json({
        success: true,
        data: formatted.length === 1 ? formatted[0] : formatted
      });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v2/notification/:id/read & PUT /api/v2/notification/:id
  static async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Notification ID is required', 400, 'BAD_REQUEST');
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: {
          isRead: true,
          readAt: new Date()
        },
        include: {
          template: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true, orgId: true } }
        }
      });

      res.status(200).json({
        success: true,
        data: formatNotification(updated)
      });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v2/notification/:id/unread
  static async markUnread(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Notification ID is required', 400, 'BAD_REQUEST');
      }

      const updated = await prisma.notification.update({
        where: { id },
        data: {
          isRead: false,
          readAt: null
        },
        include: {
          template: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true, orgId: true } }
        }
      });

      res.status(200).json({
        success: true,
        data: formatNotification(updated)
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/notification/read & PATCH /api/v2/notification/bulk-mark
  static async bulkMarkRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as Record<string, unknown>;
      const notificationIds = Array.isArray(body.notificationIds)
        ? (body.notificationIds as unknown[]).filter((x): x is string => typeof x === 'string')
        : undefined;
      const isRead = typeof body.isRead === 'boolean' ? body.isRead : true;
      const allUnread = body.allUnread === true;

      const userId = req.user?.id;
      if (!userId) {
        throw new AppError('User authentication required', 401, 'UNAUTHORIZED');
      }

      if (allUnread) {
        const result = await prisma.notification.updateMany({
          where: { userId, isRead: false },
          data: { isRead: true, readAt: new Date() }
        });
        res.status(200).json({ success: true, count: result.count });
        return;
      }

      if (notificationIds && notificationIds.length > 0) {
        const result = await prisma.notification.updateMany({
          where: { userId, id: { in: notificationIds } },
          data: { isRead, readAt: isRead ? new Date() : null }
        });
        res.status(200).json({ success: true, count: result.count });
        return;
      }

      res.status(200).json({ success: true, count: 0 });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v2/notification/user/:userId/mark-all-read
  static async markAllUserRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetUserId = strParam(req.params.userId) ?? req.user?.id;
      if (!targetUserId) {
        throw new AppError('User ID is required', 400, 'BAD_REQUEST');
      }

      const result = await prisma.notification.updateMany({
        where: { userId: targetUserId, isRead: false },
        data: { isRead: true, readAt: new Date() }
      });

      res.status(200).json({ success: true, count: result.count });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/v2/notification/:id
  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Notification ID is required', 400, 'BAD_REQUEST');
      }

      await prisma.notification.delete({ where: { id } });
      res.status(200).json({ success: true, message: 'Notification deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  // Template Endpoints
  // GET /api/v2/notification/templates & /api/v2/notification/template
  static async listTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 401, 'ORG_CONTEXT_MISSING');
      }

      const templates = await prisma.notificationTemplate.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' }
      });

      res.status(200).json({ success: true, data: templates });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/notification/templates
  static async createTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 401, 'ORG_CONTEXT_MISSING');
      }

      const body = req.body as Record<string, unknown>;
      const name = typeof body.name === 'string' ? body.name : '';
      const validTypes: NotificationType[] = ['EMAIL', 'PUSH', 'IN_APP'];
      const type: NotificationType =
        typeof body.type === 'string' && (validTypes as string[]).includes(body.type)
          ? (body.type as NotificationType)
          : 'IN_APP';
      const subject = typeof body.subject === 'string' ? body.subject : undefined;
      const content = typeof body.content === 'string' ? body.content : undefined;
      const variables =
        typeof body.variables === 'object' && body.variables !== null
          ? (body.variables as Prisma.InputJsonValue)
          : {};

      const template = await prisma.notificationTemplate.create({
        data: {
          orgId,
          name,
          type,
          subject: subject ?? name,
          content: content ?? name,
          variables
        }
      });

      res.status(201).json({ success: true, data: template });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/notification/templates/:id
  static async getTemplateById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Template ID is required', 400, 'BAD_REQUEST');
      }

      const template = await prisma.notificationTemplate.findUnique({ where: { id } });
      if (!template) {
        throw new AppError('Template not found', 404, 'NOT_FOUND');
      }
      res.status(200).json({ success: true, data: template });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/v2/notification/templates/:id
  static async deleteTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Template ID is required', 400, 'BAD_REQUEST');
      }

      await prisma.notificationTemplate.delete({ where: { id } });
      res.status(200).json({ success: true, message: 'Template deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/notification/subscription
  static async saveSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as PushSubscriptionPayload | undefined;
      const targetUserId = body?.userId ?? req.user?.id;
      const endpoint = body?.subscription?.endpoint;
      const keys = body?.subscription?.keys;
      const expirationTime = body?.subscription?.expirationTime ?? null;

      if (!targetUserId || !endpoint || !keys) {
        throw new AppError('userId and subscription with endpoint and keys are required', 400, 'BAD_REQUEST');
      }

      const existingUser = await prisma.user.findUnique({
        where: { id: targetUserId }
      });
      if (!existingUser) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }

      const existingSubscription = await prisma.pushSubscription.findUnique({
        where: { endpoint }
      });

      let saved;
      if (existingSubscription) {
        saved = await prisma.pushSubscription.update({
          where: { endpoint },
          data: {
            userId: targetUserId,
            keys: keys as Prisma.InputJsonValue,
            expirationTime
          }
        });
      } else {
        saved = await prisma.pushSubscription.create({
          data: {
            userId: targetUserId,
            endpoint,
            keys: keys as Prisma.InputJsonValue,
            expirationTime
          }
        });
      }

      res.status(201).json({ success: true, data: saved });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/v2/notification/subscription
  static async deleteSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as { endpoint?: string } | undefined;
      const endpoint = body?.endpoint ?? (typeof req.query.endpoint === 'string' ? req.query.endpoint : undefined);
      if (!endpoint) {
        throw new AppError('Subscription endpoint is required', 400, 'BAD_REQUEST');
      }

      await prisma.pushSubscription.deleteMany({
        where: { endpoint }
      });

      res.status(200).json({ success: true, message: 'Subscription removed successfully' });
    } catch (error) {
      next(error);
    }
  }
}
