import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import type { ActivityLogQueryInput } from './activity-log.schema.js';

interface RequestingUser {
  id: string;
  orgId?: string;
  isSuperAdmin?: boolean;
}

const resolveName = (firstName?: string | null, lastName?: string | null, fallback = ''): string => {
  const full = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return full.length > 0 ? full : fallback;
};

// Check if user has permission or Org_Admin role
async function checkUserActivityScope(userId: string, _orgId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      orgId: true,
      roles: {
        select: {
          role: {
            select: {
              name: true,
              permissions: {
                select: {
                  permission: {
                    select: { key: true }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const permissions = new Set<string>();
  let isOrgAdmin = false;

  for (const userRole of user.roles) {
    if (userRole.role.name === 'Org_Admin' || userRole.role.name === 'Admin') {
      isOrgAdmin = true;
    }
    for (const p of userRole.role.permissions) {
      if (p.permission?.key) {
        permissions.add(p.permission.key);
      }
    }
  }

  const canViewAll = isOrgAdmin || permissions.has('view_all_activities');
  const canViewSubordinates = isOrgAdmin || permissions.has('view_subordinate_activities');

  return { canViewAll, canViewSubordinates };
}

export const ActivityService = {
  async list(orgId: string, currentUser: RequestingUser, query: ActivityLogQueryInput) {
    const {
      page,
      limit,
      userId,
      actorId,
      targetUserId,
      targetId,
      entity,
      action,
      startDate,
      endDate
    } = query;

    const { canViewAll, canViewSubordinates } = currentUser.isSuperAdmin
      ? { canViewAll: true, canViewSubordinates: true }
      : await checkUserActivityScope(currentUser.id, orgId);

    const andConditions: Record<string, unknown>[] = [{ orgId }];

    // Apply role-based visibility scoping within organization
    if (!canViewAll) {
      if (canViewSubordinates) {
        const subordinates = await prisma.user.findMany({
          where: { managerId: currentUser.id, orgId },
          select: { id: true }
        });
        const allowedIds = [currentUser.id, ...subordinates.map((s) => s.id)];
        andConditions.push({
          OR: [{ actorId: { in: allowedIds } }, { targetId: { in: allowedIds } }]
        });
      } else {
        andConditions.push({
          OR: [{ actorId: currentUser.id }, { targetId: currentUser.id }]
        });
      }
    }

    // Additional query filters
    const filterActor = actorId ?? userId;
    if (filterActor) {
      andConditions.push({ actorId: filterActor });
    }

    const filterTarget = targetId ?? targetUserId;
    if (filterTarget) {
      andConditions.push({ targetId: filterTarget });
    }

    if (action) {
      andConditions.push({ action });
    }

    if (entity) {
      andConditions.push({ entity });
    }

    if (startDate || endDate) {
      const dateCond: Record<string, unknown> = {};
      if (startDate) {
        const parsedStart = new Date(startDate);
        if (!isNaN(parsedStart.getTime())) dateCond.gte = parsedStart;
      }
      if (endDate) {
        const parsedEnd = new Date(endDate);
        if (!isNaN(parsedEnd.getTime())) dateCond.lte = parsedEnd;
      }
      if (Object.keys(dateCond).length > 0) {
        andConditions.push({ createdAt: dateCond });
      }
    }

    const where = { AND: andConditions };
    const skip = (page - 1) * limit;

    const [logs, totalCount] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          actor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              employeeId: true,
              department: { select: { name: true } }
            }
          },
          target: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              employeeId: true,
              department: { select: { name: true } }
            }
          }
        }
      }),
      prisma.activityLog.count({ where })
    ]);

    const formattedLogs = logs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      description: log.description,
      metadata: log.metadata,
      createdAt: log.createdAt,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      actor: log.actor
        ? {
            id: log.actor.id,
            name: resolveName(log.actor.firstName, log.actor.lastName, log.actor.email),
            email: log.actor.email,
            employeeId: log.actor.employeeId,
            department: log.actor.department?.name
          }
        : null,
      target: log.target
        ? {
            id: log.target.id,
            name: resolveName(log.target.firstName, log.target.lastName, log.target.email),
            email: log.target.email,
            employeeId: log.target.employeeId,
            department: log.target.department?.name
          }
        : null
    }));

    return {
      data: formattedLogs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1
      }
    };
  },

  async getStats(orgId: string, currentUser: RequestingUser, period: '7d' | '30d' | '90d' = '7d') {
    const { canViewAll, canViewSubordinates } = currentUser.isSuperAdmin
      ? { canViewAll: true, canViewSubordinates: true }
      : await checkUserActivityScope(currentUser.id, orgId);

    const now = new Date();
    const days = period === '90d' ? 90 : period === '30d' ? 30 : 7;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const andConditions: Record<string, unknown>[] = [
      { orgId },
      { createdAt: { gte: startDate } }
    ];

    if (!canViewAll) {
      if (canViewSubordinates) {
        const subordinates = await prisma.user.findMany({
          where: { managerId: currentUser.id, orgId },
          select: { id: true }
        });
        const allowedIds = [currentUser.id, ...subordinates.map((s) => s.id)];
        andConditions.push({
          OR: [{ actorId: { in: allowedIds } }, { targetId: { in: allowedIds } }]
        });
      } else {
        andConditions.push({
          OR: [{ actorId: currentUser.id }, { targetId: currentUser.id }]
        });
      }
    }

    const where = { AND: andConditions };

    const [totalActivities, actionGroups, entityGroups, actorGroups] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.groupBy({
        by: ['action'],
        where,
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } }
      }),
      prisma.activityLog.groupBy({
        by: ['entity'],
        where,
        _count: { entity: true },
        orderBy: { _count: { entity: 'desc' } }
      }),
      prisma.activityLog.groupBy({
        by: ['actorId'],
        where,
        _count: { actorId: true },
        orderBy: { _count: { actorId: 'desc' } },
        take: 10
      })
    ]);

    // Fetch details for top active actors
    const topActorIds = actorGroups.map((g) => g.actorId);
    const topUsers = await prisma.user.findMany({
      where: { id: { in: topActorIds }, orgId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        employeeId: true
      }
    });

    const userStats = actorGroups.map((group) => {
      const u = topUsers.find((user) => user.id === group.actorId);
      return {
        userId: group.actorId,
        name: resolveName(u?.firstName, u?.lastName, u?.email ?? 'Unknown'),
        email: u?.email ?? '',
        employeeId: u?.employeeId ?? '',
        activityCount: group._count.actorId
      };
    });

    return {
      totalActivities,
      period,
      actionStats: actionGroups.map((g) => ({ action: g.action, count: g._count.action })),
      entityStats: entityGroups.map((g) => ({ entity: g.entity, count: g._count.entity })),
      dailyStats: [],
      userStats
    };
  },

  async getRecentByUser(orgId: string, currentUser: RequestingUser, targetUserId: string, limit = 20) {
    // 1. Verify target user exists and belongs to the caller's organization
    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, orgId },
      select: { id: true, managerId: true }
    });

    if (!targetUser) {
      throw new AppError('User not found or not in your organization', 404, 'USER_NOT_FOUND');
    }

    // 2. Check authorization: Own activities, Manager of subordinate, or Org_Admin
    const isSelf = targetUserId === currentUser.id;
    if (!isSelf && !currentUser.isSuperAdmin) {
      const { canViewAll } = await checkUserActivityScope(currentUser.id, orgId);
      const isManager = targetUser.managerId === currentUser.id;

      if (!canViewAll && !isManager) {
        throw new AppError(
          'Access denied. You can only view activities of yourself or your subordinates.',
          403,
          'FORBIDDEN'
        );
      }
    }

    const activities = await prisma.activityLog.findMany({
      where: {
        orgId,
        OR: [{ actorId: targetUserId }, { targetId: targetUserId }]
      },
      include: {
        actor: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        target: {
          select: { id: true, firstName: true, lastName: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    // Return the full shape the frontend EmployeeRevisionHistoryCard expects:
    // actorId, targetId, metadata (with diff), actor.{id,firstName,lastName,email}
    return activities.map((a) => ({
      id: a.id,
      orgId: a.orgId,
      actorId: a.actorId,
      targetId: a.targetId,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId,
      description: a.description,
      metadata: a.metadata,          // ← includes diff, isSelfEdit, updatedFieldCount
      createdAt: a.createdAt,
      actor: {
        id: a.actor.id,
        firstName: a.actor.firstName,
        lastName: a.actor.lastName,
        email: a.actor.email,
      },
      target: a.target
        ? {
            id: a.target.id,
            firstName: a.target.firstName,
            lastName: a.target.lastName,
            email: a.target.email,
          }
        : null
    }));
  }
};
