import type { ActivityAction, ActivityEntity } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../config/logger.js';

export interface LogActivityParams {
  orgId: string;
  actorId: string;
  targetId?: string;
  action: ActivityAction;
  entity: ActivityEntity;
  entityId: string;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        orgId: params.orgId,
        actorId: params.actorId,
        targetId: params.targetId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        description: params.description,
        metadata: (params.metadata ?? {}) as never,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null
      }
    });
  } catch (err) {
    logger.error({ err, params }, 'Failed to record activity log');
  }
}
