import type { Prisma, AttendanceStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import type {
  CheckInInput,
  CheckOutInput,
  PastCheckOutInput,
  PastAttendanceInput,
  AttendanceFilterInput
} from './attendance.schema.js';

export interface DurationInfo {
  hours: number;
  minutes: number;
  totalMinutes: number;
}

export interface AuthenticatedActor {
  id: string;
  orgId?: string;
  isSuperAdmin?: boolean;
  roles?: string[];
  permissions?: string[];
}

const parseStartAndEndOfDay = (dateStr: string) => {
  const d = new Date(dateStr);
  const start = new Date(d);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  return { date: start, start, end };
};

const calculateDuration = (checkInTime: Date, checkOutTime: Date): DurationInfo => {
  const durationMs = Math.max(0, checkOutTime.getTime() - checkInTime.getTime());
  const totalMinutes = Math.floor(durationMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return {
    hours,
    minutes,
    totalMinutes
  };
};

const determineStatus = (totalHours: number): AttendanceStatus => {
  if (totalHours >= 8) {
    return 'PRESENT';
  }
  if (totalHours >= 4) {
    return 'HALF_DAY';
  }
  if (totalHours > 0) {
    return 'EARLY_DEPARTURE';
  }
  return 'ABSENT';
};

const checkIsElevated = (actor: AuthenticatedActor): boolean => {
  if (actor.isSuperAdmin) {
    return true;
  }
  return actor.roles ? actor.roles.some((r) => ['Org_Admin', 'HR Executive', 'SuperAdmin'].includes(r)) : false;
};

export class AttendanceService {
  static async checkIn(
    orgId: string,
    userId: string,
    input: CheckInInput,
    ipAddress?: string,
    userAgent?: string
  ) {
    const user = await prisma.user.findFirst({
      where: { id: userId, orgId }
    });
    if (!user) {
      throw new AppError('User not found in organization', 404, 'USER_NOT_FOUND');
    }

    const { date: attendanceDate } = parseStartAndEndOfDay(input.date);
    const checkInDateTime = new Date(input.checkInTime);
    const now = new Date();

    if (user.hiredDate && attendanceDate < new Date(user.hiredDate)) {
      throw new AppError(
        'Cannot check in for a date prior to employment hired date',
        400,
        'BEFORE_HIRED_DATE'
      );
    }

    // Do not allow check in beyond 1 day in the future
    if (attendanceDate.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
      throw new AppError('Cannot check in for future dates', 400, 'FUTURE_DATE_INVALID');
    }

    // Check for ongoing session without checkout
    const ongoingSession = await prisma.attendanceRecord.findFirst({
      where: {
        userId,
        date: attendanceDate,
        checkOutTime: null
      }
    });

    if (ongoingSession) {
      throw new AppError(
        'You have an active ongoing work session. Please check out first.',
        400,
        'ACTIVE_SESSION_EXISTS'
      );
    }

    // Determine next session number for this day
    const lastSession = await prisma.attendanceRecord.findFirst({
      where: { userId, date: attendanceDate },
      orderBy: { sessionNumber: 'desc' }
    });
    const sessionNumber = (lastSession?.sessionNumber ?? 0) + 1;

    const newRecord = await prisma.attendanceRecord.create({
      data: {
        userId,
        date: attendanceDate,
        sessionNumber,
        checkInTime: checkInDateTime,
        checkInLocation: input.checkInLocation as unknown as Prisma.InputJsonValue,
        notes: input.notes ?? null,
        status: 'PRESENT',
        ipAddress: ipAddress ?? null,
        deviceInfo: userAgent ?? null
      }
    });

    return newRecord;
  }

  static async checkOut(
    orgId: string,
    userId: string,
    input: CheckOutInput,
    ipAddress?: string,
    userAgent?: string
  ) {
    const user = await prisma.user.findFirst({
      where: { id: userId, orgId }
    });
    if (!user) {
      throw new AppError('User not found in organization', 404, 'USER_NOT_FOUND');
    }

    const { date: attendanceDate } = parseStartAndEndOfDay(input.date);
    const checkOutDateTime = new Date(input.checkOutTime);

    // Find active session for today or fallback to latest unclosed session
    let activeSession = await prisma.attendanceRecord.findFirst({
      where: {
        userId,
        date: attendanceDate,
        checkOutTime: null
      }
    });

    activeSession ??= await prisma.attendanceRecord.findFirst({
      where: {
        userId,
        checkOutTime: null
      },
      orderBy: { checkInTime: 'desc' }
    });

    if (!activeSession) {
      throw new AppError('No active work session found to check out from.', 400, 'NO_ACTIVE_SESSION');
    }

    if (checkOutDateTime <= new Date(activeSession.checkInTime)) {
      throw new AppError('Check-out time must be after check-in time', 400, 'CHECKOUT_BEFORE_CHECKIN');
    }

    const sessionDuration = calculateDuration(new Date(activeSession.checkInTime), checkOutDateTime);

    // Fetch all completed sessions for this date to calculate daily total
    const existingSessions = await prisma.attendanceRecord.findMany({
      where: {
        userId,
        date: activeSession.date,
        id: { not: activeSession.id },
        checkOutTime: { not: null }
      }
    });

    const totalMinutesSoFar = existingSessions.reduce((acc, s) => {
      if (s.checkOutTime) {
        const d = calculateDuration(new Date(s.checkInTime), new Date(s.checkOutTime));
        return acc + d.totalMinutes;
      }
      return acc;
    }, 0);

    const dailyTotalMinutes = totalMinutesSoFar + sessionDuration.totalMinutes;
    const dailyTotalHours = Math.floor(dailyTotalMinutes / 60);
    const dailyTotalRemainder = dailyTotalMinutes % 60;
    const finalDailyStatus = determineStatus(dailyTotalHours);

    const updatedSession = await prisma.attendanceRecord.update({
      where: { id: activeSession.id },
      data: {
        checkOutTime: checkOutDateTime,
        checkOutLocation: input.checkOutLocation as unknown as Prisma.InputJsonValue,
        notes: input.notes ?? activeSession.notes,
        status: finalDailyStatus,
        duration: sessionDuration as unknown as Prisma.InputJsonValue,
        ipAddress: ipAddress ?? activeSession.ipAddress,
        deviceInfo: userAgent ?? activeSession.deviceInfo
      }
    });

    let reportCreated = false;
    if (input.reportContent) {
      const content = typeof input.reportContent === 'string'
        ? { text: input.reportContent }
        : input.reportContent;
      await prisma.userDailyReport.create({
        data: {
          attendanceId: updatedSession.id,
          reportContent: content ?? {}
        }
      });
      reportCreated = true;
    }

    return {
      session: updatedSession,
      dailyTotal: {
        hours: dailyTotalHours,
        minutes: dailyTotalRemainder,
        totalMinutes: dailyTotalMinutes
      },
      remainingHours: Math.max(0, 8 - dailyTotalHours),
      reportCreated
    };
  }

  static async getSessionsByDate(orgId: string, userId: string, dateStr: string) {
    const { start, end } = parseStartAndEndOfDay(dateStr);
    return prisma.attendanceRecord.findMany({
      where: {
        userId,
        user: { orgId },
        date: { gte: start, lte: end }
      },
      orderBy: { sessionNumber: 'asc' },
      include: {
        UserDailyReport: true
      }
    });
  }

  static async getPastUncheckedSessions(orgId: string, userId: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    return prisma.attendanceRecord.findMany({
      where: {
        userId,
        user: { orgId },
        checkOutTime: null,
        date: { lt: today }
      },
      orderBy: { date: 'desc' }
    });
  }

  static async postPastCheckOut(orgId: string, userId: string, input: PastCheckOutInput) {
    const record = await prisma.attendanceRecord.findFirst({
      where: {
        id: input.attendanceId,
        userId,
        user: { orgId }
      }
    });

    if (!record) {
      throw new AppError('Attendance record not found', 404, 'RECORD_NOT_FOUND');
    }

    const checkOutDateTime = new Date(input.checkOutTime);
    if (checkOutDateTime <= new Date(record.checkInTime)) {
      throw new AppError('Check-out time must be after check-in time', 400, 'CHECKOUT_BEFORE_CHECKIN');
    }

    const duration = calculateDuration(new Date(record.checkInTime), checkOutDateTime);
    const status = determineStatus(duration.hours);

    return prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOutTime: checkOutDateTime,
        notes: input.notes ? `${record.notes ?? ''} | Regularized: ${input.notes}`.trim() : record.notes,
        duration: duration as unknown as Prisma.InputJsonValue,
        status,
        verificationStatus: 'UNVERIFIED'
      }
    });
  }

  static async createPastAttendance(orgId: string, userId: string, input: PastAttendanceInput) {
    const user = await prisma.user.findFirst({
      where: { id: userId, orgId }
    });
    if (!user) {
      throw new AppError('User not found in organization', 404, 'USER_NOT_FOUND');
    }

    const { date: attendanceDate } = parseStartAndEndOfDay(input.date);
    const checkIn = new Date(input.checkInTime);
    const checkOut = new Date(input.checkOutTime);

    if (checkOut <= checkIn) {
      throw new AppError('Check-out time must be after check-in time', 400, 'CHECKOUT_BEFORE_CHECKIN');
    }

    const lastSession = await prisma.attendanceRecord.findFirst({
      where: { userId, date: attendanceDate },
      orderBy: { sessionNumber: 'desc' }
    });
    const sessionNumber = (lastSession?.sessionNumber ?? 0) + 1;

    const duration = calculateDuration(checkIn, checkOut);
    const status = determineStatus(duration.hours);

    return prisma.attendanceRecord.create({
      data: {
        userId,
        date: attendanceDate,
        sessionNumber,
        checkInTime: checkIn,
        checkOutTime: checkOut,
        checkInLocation: input.checkInLocation as unknown as Prisma.InputJsonValue,
        checkOutLocation: input.checkOutLocation as unknown as Prisma.InputJsonValue,
        notes: input.reason ? `Past entry request: ${input.reason}` : input.notes,
        duration: duration as unknown as Prisma.InputJsonValue,
        status,
        verificationStatus: 'UNVERIFIED'
      }
    });
  }

  static async getUserAttendanceHistory(
    orgId: string,
    targetUserId: string,
    filters: AttendanceFilterInput
  ) {
    const page = filters.page;
    const limit = filters.limit;
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceRecordWhereInput = {
      userId: targetUserId,
      user: { orgId }
    };

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.verificationStatus) {
      where.verificationStatus = filters.verificationStatus;
    }
    if (filters.startDate || filters.endDate) {
      where.date = {
        ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: new Date(filters.endDate) } : {})
      };
    } else if (filters.date) {
      const { start, end } = parseStartAndEndOfDay(filters.date);
      where.date = { gte: start, lte: end };
    }

    const [total, records] = await Promise.all([
      prisma.attendanceRecord.count({ where }),
      prisma.attendanceRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          UserDailyReport: true
        }
      })
    ]);

    return {
      data: records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  static async getLiveAttendance(
    orgId: string,
    actor: AuthenticatedActor,
    managerIdFilter?: string
  ) {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const isElevated = checkIsElevated(actor);

    const whereUser: Prisma.UserWhereInput = {
      orgId,
      status: 'active'
    };

    if (!isElevated) {
      // Regular managers are strictly restricted to their direct subordinates
      whereUser.managerId = actor.id;
    } else if (managerIdFilter) {
      whereUser.managerId = managerIdFilter;
    }

    const users = await prisma.user.findMany({
      where: whereUser,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        department: { select: { name: true } },
        roles: { select: { role: { select: { name: true } } } },
        attendanceRecords: {
          where: {
            date: { gte: startOfDay, lte: endOfDay }
          },
          orderBy: { sessionNumber: 'asc' }
        }
      }
    });

    const formattedUsers = users.map((u) => {
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ');
      return {
        id: u.id,
        name: fullName ? fullName : u.email,
        email: u.email,
        department: u.department?.name ?? 'Unassigned',
        position: u.roles[0]?.role?.name ?? 'Employee'
      };
    });

    const attendanceRecords = users.reduce<Record<string, unknown[]>>((acc, u) => {
      acc[u.id] = u.attendanceRecords;
      return acc;
    }, {});

    return {
      users: formattedUsers,
      attendanceRecords
    };
  }

  static async getVerificationQueue(
    orgId: string,
    actor: AuthenticatedActor,
    managerIdParam?: string
  ) {
    const isElevated = checkIsElevated(actor);

    const where: Prisma.AttendanceRecordWhereInput = {
      user: { orgId },
      verificationStatus: 'UNVERIFIED'
    };

    if (!isElevated) {
      where.user = { orgId, managerId: actor.id };
    } else if (managerIdParam && managerIdParam !== 'all') {
      where.user = { orgId, managerId: managerIdParam };
    }

    const records = await prisma.attendanceRecord.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            department: { select: { name: true } },
            roles: { select: { role: { select: { name: true } } } }
          }
        },
        UserDailyReport: true
      },
      orderBy: { date: 'desc' }
    });

    return records.map((record) => {
      const fullName = [record.user.firstName, record.user.lastName].filter(Boolean).join(' ');
      return {
        ...record,
        user: {
          id: record.user.id,
          name: fullName ? fullName : record.user.email,
          email: record.user.email,
          department: record.user.department?.name ?? 'Unassigned',
          position: record.user.roles[0]?.role?.name ?? 'Employee'
        }
      };
    });
  }

  static async verifyAttendance(
    orgId: string,
    actor: AuthenticatedActor,
    attendanceId: string,
    verificationStatus: 'VERIFIED' | 'REJECTED',
    _remarks?: string
  ) {
    const record = await prisma.attendanceRecord.findFirst({
      where: { id: attendanceId },
      include: {
        user: { select: { orgId: true, managerId: true } }
      }
    });

    if (record?.user.orgId !== orgId) {
      throw new AppError('Attendance record not found in organization', 404, 'RECORD_NOT_FOUND');
    }

    const isElevated = checkIsElevated(actor);

    if (!isElevated && record.user.managerId !== actor.id) {
      throw new AppError(
        'Access denied. You can only verify attendance records for your direct subordinates.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    return prisma.attendanceRecord.update({
      where: { id: attendanceId },
      data: {
        verificationStatus,
        verifiedAt: new Date(),
        verifiedBy: actor.id
      }
    });
  }

  static async deleteAttendance(orgId: string, id: string, actor: AuthenticatedActor) {
    const record = await prisma.attendanceRecord.findFirst({
      where: { id },
      include: { user: { select: { orgId: true } } }
    });

    if (record?.user.orgId !== orgId) {
      throw new AppError('Attendance record not found', 404, 'RECORD_NOT_FOUND');
    }

    const isElevated = checkIsElevated(actor);

    if (!isElevated && record.userId !== actor.id) {
      throw new AppError('You can only delete your own attendance requests', 403, 'FORBIDDEN');
    }

    await prisma.attendanceRecord.delete({ where: { id } });
    return { message: 'Attendance record deleted successfully' };
  }
}
