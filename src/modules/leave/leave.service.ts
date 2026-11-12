import type { LeaveStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import { logger } from '../../config/logger.js';
import { EmailService } from '../../services/email.service.js';
import { parseDateOnly } from '../attendance/attendance.time.js';
import {
  canActOnUserLeave,
  canManageLeaveBalance,
  canViewAllLeave,
  canViewUserBalance,
  canViewUserLeave,
  isOrgAdminUser,
  type LeaveActor
} from './leave.access.js';
import type {
  LeaveBalanceCreateInput,
  LeaveBalanceUpdateInput,
  LeaveRequestCreateInput,
  LeaveRequestUpdateInput,
  LeaveTypeCreateInput,
  LeaveTypeUpdateInput
} from './leave.schema.js';

const requestInclude = {
  user: {
    select: {
      id: true,
      orgId: true,
      managerId: true,
      email: true,
      firstName: true,
      lastName: true,
      manager: {
        select: {
          email: true,
          firstName: true,
          lastName: true
        }
      }
    }
  },
  leaveType: true
} as const;

const balanceInclude = {
  user: {
    select: {
      id: true,
      orgId: true,
      managerId: true,
      email: true,
      firstName: true,
      lastName: true
    }
  },
  leaveType: true
} as const;

const currentYear = (): number => new Date().getUTCFullYear();

const startOfToday = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const calculateDays = (start: Date, end: Date): number =>
  Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: string }).code === 'P2002';

const resolveOrgId = (actor: LeaveActor, requestedOrgId?: string): string => {
  const normalized = requestedOrgId?.trim();
  const usableRequested =
    normalized && normalized !== 'platform-superadmin' ? normalized : undefined;

  if (actor.isSuperAdmin) {
    if (!usableRequested) {
      throw new AppError(
        'Organization context is required for super-admin requests',
        400,
        'ORG_CONTEXT_REQUIRED'
      );
    }
    return usableRequested;
  }

  if (!actor.orgId) {
    throw new AppError('Organization context required', 401, 'ORG_CONTEXT_MISSING');
  }

  if (usableRequested && usableRequested !== actor.orgId) {
    throw new AppError(
      'Access denied. You cannot access data outside your organization.',
      403,
      'TENANT_MISMATCH'
    );
  }

  return actor.orgId;
};

const getOrganizationContext = async (orgId: string) =>
  prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      Organization_admin: {
        select: {
          admin_user: {
            select: {
              email: true
            }
          }
        }
      }
    }
  });

const getTargetUser = async (orgId: string, userId: string) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, orgId },
    select: {
      id: true,
      orgId: true,
      managerId: true,
      email: true,
      firstName: true,
      lastName: true,
      roles: {
        select: {
          role: {
            select: {
              name: true
            }
          }
        }
      }
    }
  });

  if (!user) {
    throw new AppError('User not found in organization', 404, 'USER_NOT_FOUND');
  }

  return user;
};

const getLeaveType = async (orgId: string, leaveTypeId: string) => {
  const leaveType = await prisma.leaveType.findFirst({
    where: { id: leaveTypeId, orgId }
  });

  if (!leaveType) {
    throw new AppError('Leave type not found', 404, 'LEAVE_TYPE_NOT_FOUND');
  }

  return leaveType;
};

const getBalanceForYear = async (userId: string, leaveTypeId: string, year: number) =>
  prisma.leaveBalance.findUnique({
    where: {
      userId_leaveTypeId_year: {
        userId,
        leaveTypeId,
        year
      }
    }
  });

const ensureBalanceForYear = async (
  userId: string,
  leaveTypeId: string,
  year: number,
  annualLimit: number
) =>
  prisma.leaveBalance.upsert({
    where: {
      userId_leaveTypeId_year: {
        userId,
        leaveTypeId,
        year
      }
    },
    create: {
      userId,
      leaveTypeId,
      year,
      remainingDays: annualLimit
    },
    update: {}
  });

const assertNoOverlap = async (
  userId: string,
  startDate: Date,
  endDate: Date,
  excludeRequestId?: string
): Promise<void> => {
  const overlapping = await prisma.leaveRequest.findFirst({
    where: {
      userId,
      ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      status: {
        in: ['PENDING', 'APPROVED']
      },
      startDate: { lte: endDate },
      endDate: { gte: startDate }
    },
    select: { id: true }
  });

  if (overlapping) {
    throw new AppError(
      'Leave request overlaps with an existing pending or approved request',
      400,
      'LEAVE_REQUEST_OVERLAP'
    );
  }
};

const getRequestForActor = async (orgId: string, requestId: string) => {
  const request = await prisma.leaveRequest.findFirst({
    where: {
      id: requestId,
      user: { orgId }
    },
    include: requestInclude
  });

  if (!request) {
    throw new AppError('Leave request not found', 404, 'LEAVE_REQUEST_NOT_FOUND');
  }

  return request;
};

const sendSubmittedEmail = async (orgId: string, request: {
  user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    manager: { email: string } | null;
  };
  leaveType: { name: string };
  startDate: Date;
  endDate: Date;
  numberOfDays: number;
  reason: string | null;
}): Promise<void> => {
  try {
    const organization = await getOrganizationContext(orgId);
    if (!organization) {
      return;
    }

    const recipients = new Set<string>();
    if (request.user.manager?.email) {
      recipients.add(request.user.manager.email);
    }
    for (const orgAdmin of organization.Organization_admin) {
      if (orgAdmin.admin_user?.email) {
        recipients.add(orgAdmin.admin_user.email);
      }
    }

    if (recipients.size === 0) {
      return;
    }

    await EmailService.sendLeaveRequestEmail({
      recipients: Array.from(recipients),
      employeeName: `${request.user.firstName ?? ''} ${request.user.lastName ?? ''}`.trim(),
      employeeEmail: request.user.email,
      leaveType: request.leaveType.name,
      startDate: request.startDate,
      endDate: request.endDate,
      duration: request.numberOfDays,
      reason: request.reason,
      companyName: organization.name
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to send leave request notification email');
  }
};

const sendStatusEmail = async (orgId: string, request: {
  status: LeaveStatus;
  rejectedReason: string | null;
  user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  leaveType: { name: string };
  startDate: Date;
  endDate: Date;
  numberOfDays: number;
}): Promise<void> => {
  try {
    const organization = await getOrganizationContext(orgId);
    if (!organization) {
      return;
    }

    await EmailService.sendLeaveStatusUpdateEmail({
      email: request.user.email,
      name: `${request.user.firstName ?? ''} ${request.user.lastName ?? ''}`.trim(),
      leaveType: request.leaveType.name,
      startDate: request.startDate,
      endDate: request.endDate,
      duration: request.numberOfDays,
      status: request.status,
      rejectedReason: request.rejectedReason,
      companyName: organization.name
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to send leave status notification email');
  }
};

export class LeaveService {
  static async listLeaveTypes(actor: LeaveActor, requestedOrgId?: string) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    return prisma.leaveType.findMany({
      where: { orgId },
      orderBy: { name: 'asc' }
    });
  }

  static async getLeaveType(actor: LeaveActor, requestedOrgId: string | undefined, id: string) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    return getLeaveType(orgId, id);
  }

  static async createLeaveType(actor: LeaveActor, input: LeaveTypeCreateInput) {
    const orgId = resolveOrgId(actor, input.orgId);

    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true }
    });
    if (!organization) {
      throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const leaveType = await tx.leaveType.create({
          data: {
            orgId,
            name: input.name,
            description: input.description ?? null,
            annualLimit: input.annualLimit,
            requiresApproval: input.requiresApproval,
            isPaid: input.isPaid,
            carryForward: input.carryForward,
            maxCarryForward: input.maxCarryForward
          }
        });

        const users = await tx.user.findMany({
          where: { orgId },
          select: { id: true }
        });

        if (users.length > 0) {
          await tx.leaveBalance.createMany({
            data: users.map((user) => ({
              userId: user.id,
              leaveTypeId: leaveType.id,
              remainingDays: leaveType.annualLimit,
              year: currentYear()
            })),
            skipDuplicates: true
          });
        }

        return leaveType;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(
          'A leave type with this name already exists in the organization',
          409,
          'LEAVE_TYPE_ALREADY_EXISTS'
        );
      }
      throw error;
    }
  }

  static async updateLeaveType(
    actor: LeaveActor,
    requestedOrgId: string | undefined,
    id: string,
    input: LeaveTypeUpdateInput
  ) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    const existing = await getLeaveType(orgId, id);

    try {
      return await prisma.$transaction(async (tx) => {
        const updated = await tx.leaveType.update({
          where: { id: existing.id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.annualLimit !== undefined ? { annualLimit: input.annualLimit } : {}),
            ...(input.requiresApproval !== undefined
              ? { requiresApproval: input.requiresApproval }
              : {}),
            ...(input.isPaid !== undefined ? { isPaid: input.isPaid } : {}),
            ...(input.carryForward !== undefined ? { carryForward: input.carryForward } : {}),
            ...(input.maxCarryForward !== undefined
              ? { maxCarryForward: input.maxCarryForward }
              : {})
          }
        });

        if (
          input.annualLimit !== undefined &&
          input.annualLimit !== existing.annualLimit
        ) {
          const delta = input.annualLimit - existing.annualLimit;
          await tx.leaveBalance.updateMany({
            where: {
              leaveTypeId: existing.id,
              year: currentYear()
            },
            data: {
              remainingDays: { increment: delta }
            }
          });
        }

        return updated;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(
          'A leave type with this name already exists in the organization',
          409,
          'LEAVE_TYPE_ALREADY_EXISTS'
        );
      }
      throw error;
    }
  }

  static async deleteLeaveType(actor: LeaveActor, requestedOrgId: string | undefined, id: string) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    const existing = await getLeaveType(orgId, id);

    return prisma.$transaction(async (tx) => {
      await tx.leaveRequest.deleteMany({ where: { leaveTypeId: existing.id } });
      await tx.leaveBalance.deleteMany({ where: { leaveTypeId: existing.id } });
      const deletedLeaveType = await tx.leaveType.delete({ where: { id: existing.id } });

      return {
        message: 'Leave type and all associated data successfully deleted',
        deletedLeaveType
      };
    });
  }

  static async createLeaveRequest(actor: LeaveActor, requestedOrgId: string | undefined, input: LeaveRequestCreateInput) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    const userId = input.userId ?? actor.id;

    if (userId !== actor.id && !canViewAllLeave(actor)) {
      throw new AppError(
        'Access denied. You can only create leave requests for yourself.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    const target = await getTargetUser(orgId, userId);
    const leaveType = await getLeaveType(orgId, input.leaveTypeId);

    const startDate = parseDateOnly(input.startDate, 'startDate');
    const endDate = parseDateOnly(input.endDate, 'endDate');

    if (startDate > endDate) {
      throw new AppError('Start date cannot be after end date', 400, 'INVALID_DATE_RANGE');
    }

    if (startDate < startOfToday()) {
      throw new AppError(
        'Cannot create leave request for past dates',
        400,
        'PAST_LEAVE_DATE'
      );
    }

    const numberOfDays = calculateDays(startDate, endDate);
    await assertNoOverlap(userId, startDate, endDate);

    const year = currentYear();
    const balance = await ensureBalanceForYear(
      userId,
      leaveType.id,
      year,
      leaveType.annualLimit
    );

    if (balance.remainingDays < numberOfDays) {
      throw new AppError(
        `Insufficient leave balance. Available: ${balance.remainingDays} days, Requested: ${numberOfDays} days`,
        400,
        'INSUFFICIENT_LEAVE_BALANCE'
      );
    }

    const autoApprove = !leaveType.requiresApproval || isOrgAdminUser({
      id: target.id,
      roles: target.roles.map((userRole) => userRole.role.name)
    });

    const created = await prisma.$transaction(async (tx) => {
      const leaveRequest = await tx.leaveRequest.create({
        data: {
          userId,
          leaveTypeId: leaveType.id,
          startDate,
          endDate,
          reason: input.reason,
          numberOfDays,
          attachments: input.attachments as never,
          status: autoApprove ? 'APPROVED' : 'PENDING',
          approvedBy: autoApprove ? actor.id : null,
          approvedAt: autoApprove ? new Date() : null
        },
        include: requestInclude
      });

      if (autoApprove) {
        const deducted = await tx.leaveBalance.updateMany({
          where: {
            id: balance.id,
            remainingDays: { gte: numberOfDays }
          },
          data: {
            usedDays: { increment: numberOfDays },
            remainingDays: { decrement: numberOfDays }
          }
        });

        if (deducted.count === 0) {
          throw new AppError(
            'Insufficient leave balance',
            400,
            'INSUFFICIENT_LEAVE_BALANCE'
          );
        }
      }

      return leaveRequest;
    });

    if (autoApprove) {
      await sendStatusEmail(orgId, created);
    } else {
      await sendSubmittedEmail(orgId, created);
    }

    return created;
  }

  static async listOrganizationRequests(actor: LeaveActor, requestedOrgId: string | undefined) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    if (!canViewAllLeave(actor)) {
      throw new AppError(
        'Access denied. Missing required permission for organization leave requests.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    return prisma.leaveRequest.findMany({
      where: { user: { orgId } },
      include: requestInclude,
      orderBy: { createdAt: 'desc' }
    });
  }

  static async getLeaveRequest(actor: LeaveActor, requestedOrgId: string | undefined, id: string) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    const request = await getRequestForActor(orgId, id);

    if (!canViewUserLeave(actor, request.user)) {
      throw new AppError(
        'Access denied. You cannot view this leave request.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    return request;
  }

  static async listUserRequests(actor: LeaveActor, requestedOrgId: string | undefined, userId: string) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    const target = await getTargetUser(orgId, userId);

    if (!canViewUserLeave(actor, target)) {
      throw new AppError(
        'Access denied. You cannot view this user\'s leave requests.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    return prisma.leaveRequest.findMany({
      where: { userId },
      include: requestInclude,
      orderBy: { createdAt: 'desc' }
    });
  }

  static async listManagerRequests(actor: LeaveActor, requestedOrgId: string | undefined, managerId: string) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    await getTargetUser(orgId, managerId);

    if (managerId !== actor.id && !canViewAllLeave(actor)) {
      throw new AppError(
        'Access denied. You cannot view leave requests for another manager.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    const where = canViewAllLeave(actor)
      ? { user: { orgId } }
      : { user: { managerId } };

    return prisma.leaveRequest.findMany({
      where,
      include: requestInclude,
      orderBy: { createdAt: 'desc' }
    });
  }

  static async updateLeaveRequest(
    actor: LeaveActor,
    requestedOrgId: string | undefined,
    id: string,
    input: LeaveRequestUpdateInput
  ) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    const existing = await getRequestForActor(orgId, id);

    if (existing.userId !== actor.id && !canViewAllLeave(actor)) {
      throw new AppError(
        'Access denied. You cannot update this leave request.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    if (existing.status !== 'PENDING') {
      throw new AppError(
        'Only pending leave requests can be updated',
        400,
        'LEAVE_REQUEST_NOT_EDITABLE'
      );
    }

    const startDate = input.startDate
      ? parseDateOnly(input.startDate, 'startDate')
      : existing.startDate;
    const endDate = input.endDate
      ? parseDateOnly(input.endDate, 'endDate')
      : existing.endDate;

    if (startDate > endDate) {
      throw new AppError('Start date cannot be after end date', 400, 'INVALID_DATE_RANGE');
    }

    if (startDate < startOfToday()) {
      throw new AppError(
        'Cannot update leave request to a past date',
        400,
        'PAST_LEAVE_DATE'
      );
    }

    const numberOfDays = calculateDays(startDate, endDate);
    await assertNoOverlap(existing.userId, startDate, endDate, existing.id);

    const leaveType = await getLeaveType(orgId, existing.leaveTypeId);
    const balance = await ensureBalanceForYear(
      existing.userId,
      existing.leaveTypeId,
      currentYear(),
      leaveType.annualLimit
    );

    if (balance.remainingDays < numberOfDays) {
      throw new AppError(
        `Insufficient leave balance. Available: ${balance.remainingDays} days, Requested: ${numberOfDays} days`,
        400,
        'INSUFFICIENT_LEAVE_BALANCE'
      );
    }

    return prisma.leaveRequest.update({
      where: { id: existing.id },
      data: {
        startDate,
        endDate,
        numberOfDays,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        ...(input.attachments !== undefined
          ? { attachments: input.attachments as never }
          : {})
      },
      include: requestInclude
    });
  }

  static async deleteLeaveRequest(
    actor: LeaveActor,
    requestedOrgId: string | undefined,
    id: string
  ) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    const existing = await getRequestForActor(orgId, id);

    if (existing.userId !== actor.id && !canViewAllLeave(actor)) {
      throw new AppError(
        'Access denied. You cannot delete this leave request.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    if (existing.status === 'APPROVED') {
      throw new AppError(
        'Approved leave requests cannot be deleted. Cancel the request instead.',
        400,
        'LEAVE_REQUEST_CANNOT_BE_DELETED'
      );
    }

    await prisma.leaveRequest.delete({ where: { id: existing.id } });
    return { success: true };
  }

  static async approveLeaveRequest(
    actor: LeaveActor,
    requestedOrgId: string | undefined,
    id: string
  ) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    const existing = await getRequestForActor(orgId, id);

    if (!canActOnUserLeave(actor, existing.user)) {
      throw new AppError(
        'Access denied. You cannot approve this leave request.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    if (existing.status !== 'PENDING') {
      throw new AppError(
        `Leave request cannot be approved because it is ${existing.status.toLowerCase()}`,
        400,
        'LEAVE_REQUEST_NOT_PENDING'
      );
    }

    const balance = await getBalanceForYear(
      existing.userId,
      existing.leaveTypeId,
      currentYear()
    );
    if (!balance) {
      throw new AppError('Leave balance not found', 400, 'LEAVE_BALANCE_NOT_FOUND');
    }

    if (balance.remainingDays < existing.numberOfDays) {
      throw new AppError(
        `Insufficient leave balance. Available: ${balance.remainingDays} days, Requested: ${existing.numberOfDays} days`,
        400,
        'INSUFFICIENT_LEAVE_BALANCE'
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const requestUpdate = await tx.leaveRequest.updateMany({
        where: { id: existing.id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          approvedBy: actor.id,
          approvedAt: new Date(),
          rejectedReason: null
        }
      });

      if (requestUpdate.count === 0) {
        throw new AppError(
          'Leave request is no longer pending',
          400,
          'LEAVE_REQUEST_NOT_PENDING'
        );
      }

      const deducted = await tx.leaveBalance.updateMany({
        where: {
          id: balance.id,
          remainingDays: { gte: existing.numberOfDays }
        },
        data: {
          usedDays: { increment: existing.numberOfDays },
          remainingDays: { decrement: existing.numberOfDays }
        }
      });

      if (deducted.count === 0) {
        throw new AppError(
          'Insufficient leave balance',
          400,
          'INSUFFICIENT_LEAVE_BALANCE'
        );
      }

      const [leaveRequest, leaveBalance] = await Promise.all([
        tx.leaveRequest.findUniqueOrThrow({
          where: { id: existing.id },
          include: requestInclude
        }),
        tx.leaveBalance.findUniqueOrThrow({ where: { id: balance.id } })
      ]);

      return { leaveRequest, leaveBalance };
    });

    await sendStatusEmail(orgId, result.leaveRequest);
    return result;
  }

  static async rejectLeaveRequest(
    actor: LeaveActor,
    requestedOrgId: string | undefined,
    id: string,
    rejectedReason: string
  ) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    const existing = await getRequestForActor(orgId, id);

    if (!canActOnUserLeave(actor, existing.user)) {
      throw new AppError(
        'Access denied. You cannot reject this leave request.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    if (existing.status !== 'PENDING') {
      throw new AppError(
        `Leave request cannot be rejected because it is ${existing.status.toLowerCase()}`,
        400,
        'LEAVE_REQUEST_NOT_PENDING'
      );
    }

    const updated = await prisma.leaveRequest.update({
      where: { id: existing.id },
      data: {
        status: 'REJECTED',
        approvedBy: actor.id,
        approvedAt: new Date(),
        rejectedReason
      },
      include: requestInclude
    });

    await sendStatusEmail(orgId, updated);
    return updated;
  }

  static async cancelLeaveRequest(
    actor: LeaveActor,
    requestedOrgId: string | undefined,
    id: string
  ) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    const existing = await getRequestForActor(orgId, id);

    if (existing.userId !== actor.id && !canViewAllLeave(actor)) {
      throw new AppError(
        'Access denied. You cannot cancel this leave request.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    if (existing.status === 'CANCELLED') {
      return existing;
    }

    if (existing.status === 'REJECTED') {
      throw new AppError(
        'Rejected leave requests cannot be cancelled',
        400,
        'LEAVE_REQUEST_NOT_CANCELLABLE'
      );
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id: existing.id },
        data: { status: 'CANCELLED' },
        include: requestInclude
      });

      if (existing.status === 'APPROVED') {
        const balance = await getBalanceForYear(
          existing.userId,
          existing.leaveTypeId,
          currentYear()
        );

        if (balance) {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              usedDays: { decrement: existing.numberOfDays },
              remainingDays: { increment: existing.numberOfDays }
            }
          });
        }
      }

      return updated;
    });
  }

  static async listBalances(actor: LeaveActor, requestedOrgId: string | undefined) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    if (!canManageLeaveBalance(actor)) {
      throw new AppError(
        'Access denied. Missing required permission for leave balances.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    return prisma.leaveBalance.findMany({
      where: { user: { orgId } },
      include: balanceInclude,
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }]
    });
  }

  static async getBalanceById(
    actor: LeaveActor,
    requestedOrgId: string | undefined,
    id: string
  ) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    const balance = await prisma.leaveBalance.findFirst({
      where: { id, user: { orgId } },
      include: balanceInclude
    });

    if (!balance) {
      throw new AppError('Leave balance not found', 404, 'LEAVE_BALANCE_NOT_FOUND');
    }

    if (!canViewUserBalance(actor, balance.user)) {
      throw new AppError(
        'Access denied. You cannot view this leave balance.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    return balance;
  }

  static async listUserBalances(
    actor: LeaveActor,
    requestedOrgId: string | undefined,
    userId: string
  ) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    const target = await getTargetUser(orgId, userId);

    if (!canViewUserBalance(actor, target)) {
      throw new AppError(
        'Access denied. You cannot view this user\'s leave balances.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    return prisma.leaveBalance.findMany({
      where: { userId },
      include: balanceInclude,
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }]
    });
  }

  static async getBalanceForTypeAndUser(
    actor: LeaveActor,
    requestedOrgId: string | undefined,
    leaveTypeId: string,
    userId: string
  ) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    const target = await getTargetUser(orgId, userId);

    if (!canViewUserBalance(actor, target)) {
      throw new AppError(
        'Access denied. You cannot view this leave balance.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    await getLeaveType(orgId, leaveTypeId);

    const balance = await prisma.leaveBalance.findFirst({
      where: { userId, leaveTypeId },
      include: balanceInclude,
      orderBy: { year: 'desc' }
    });

    if (!balance) {
      throw new AppError('Leave balance not found', 404, 'LEAVE_BALANCE_NOT_FOUND');
    }

    return balance;
  }

  static async createBalance(
    actor: LeaveActor,
    requestedOrgId: string | undefined,
    input: LeaveBalanceCreateInput
  ) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    if (!canManageLeaveBalance(actor)) {
      throw new AppError(
        'Access denied. Missing required permission for leave balances.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    await getTargetUser(orgId, input.userId);
    await getLeaveType(orgId, input.leaveTypeId);

    try {
      return await prisma.leaveBalance.create({
        data: {
          userId: input.userId,
          leaveTypeId: input.leaveTypeId,
          usedDays: input.usedDays,
          remainingDays: input.remainingDays,
          carryForward: input.carryForward,
          year: input.year
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(
          'A leave balance already exists for this user, leave type, and year',
          409,
          'LEAVE_BALANCE_ALREADY_EXISTS'
        );
      }
      throw error;
    }
  }

  static async updateBalance(
    actor: LeaveActor,
    requestedOrgId: string | undefined,
    id: string,
    input: LeaveBalanceUpdateInput
  ) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    if (!canManageLeaveBalance(actor)) {
      throw new AppError(
        'Access denied. Missing required permission for leave balances.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    const balance = await prisma.leaveBalance.findFirst({
      where: { id, user: { orgId } },
      select: { id: true }
    });

    if (!balance) {
      throw new AppError('Leave balance not found', 404, 'LEAVE_BALANCE_NOT_FOUND');
    }

    return prisma.leaveBalance.update({
      where: { id: balance.id },
      data: {
        ...(input.usedDays !== undefined ? { usedDays: input.usedDays } : {}),
        ...(input.remainingDays !== undefined
          ? { remainingDays: input.remainingDays }
          : {}),
        ...(input.carryForward !== undefined ? { carryForward: input.carryForward } : {})
      }
    });
  }

  static async deleteBalance(
    actor: LeaveActor,
    requestedOrgId: string | undefined,
    id: string
  ) {
    const orgId = resolveOrgId(actor, requestedOrgId);
    if (!canManageLeaveBalance(actor)) {
      throw new AppError(
        'Access denied. Missing required permission for leave balances.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    const balance = await prisma.leaveBalance.findFirst({
      where: { id, user: { orgId } },
      select: { id: true }
    });

    if (!balance) {
      throw new AppError('Leave balance not found', 404, 'LEAVE_BALANCE_NOT_FOUND');
    }

    await prisma.leaveBalance.delete({ where: { id: balance.id } });
    return { success: true };
  }
}
