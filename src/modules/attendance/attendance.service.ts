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
import type { AttendanceActor } from './attendance.access.js';
import {
  canViewAllAttendance,
  canViewUserAttendance,
  canVerifyUserAttendance
} from './attendance.access.js';
import {
  getDateKeyInTimeZone,
  getTimeZone,
  isSameDateKey,
  parseDateOnly,
  parseDateTime,
  parseStartAndEndOfDay
} from './attendance.time.js';

export interface DurationInfo {
  hours: number;
  minutes: number;
  totalMinutes: number;
}

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

const determineStatus = (totalMinutes: number): AttendanceStatus => {
  if (totalMinutes >= 8 * 60) {
    return 'PRESENT';
  }
  if (totalMinutes >= 4 * 60) {
    return 'HALF_DAY';
  }
  if (totalMinutes > 0) {
    return 'EARLY_DEPARTURE';
  }
  return 'ABSENT';
};

const getOrganizationTimeZone = async (orgId: string): Promise<string> => {
  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { timezone: true }
  });
  return getTimeZone(organization?.timezone);
};

const recalculateDailyStatus = async (userId: string, date: Date): Promise<AttendanceStatus> => {
  const records = await prisma.attendanceRecord.findMany({
    where: { userId, date }
  });

  const totalMinutes = records.reduce((total, record) => {
    if (!record.checkOutTime) {
      return total;
    }
    return total + calculateDuration(new Date(record.checkInTime), new Date(record.checkOutTime)).totalMinutes;
  }, 0);

  const status = determineStatus(totalMinutes);

  await prisma.attendanceRecord.updateMany({
    where: { userId, date, checkOutTime: { not: null } },
    data: { status }
  });

  return status;
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

    const now = new Date();
    const timeZone = await getOrganizationTimeZone(orgId);
    const attendanceDateKey = getDateKeyInTimeZone(now, timeZone);
    const attendanceDate = parseDateOnly(attendanceDateKey);

    if (user.hiredDate) {
      const hiredDateKey = getDateKeyInTimeZone(new Date(user.hiredDate), timeZone);
      if (attendanceDateKey < hiredDateKey) {
        throw new AppError(
          'Cannot check in for a date prior to employment hired date',
          400,
          'BEFORE_HIRED_DATE'
        );
      }
    }

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
        checkInTime: now,
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

    const now = new Date();
    const timeZone = await getOrganizationTimeZone(orgId);
    const todayKey = getDateKeyInTimeZone(now, timeZone);

    const activeSession = await prisma.attendanceRecord.findFirst({
      where: input.checkInId
        ? { id: input.checkInId, userId, checkOutTime: null }
        : { userId, checkOutTime: null },
      orderBy: { checkInTime: 'desc' }
    });

    if (!activeSession) {
      throw new AppError('No active work session found to check out from.', 400, 'NO_ACTIVE_SESSION');
    }

    if (!isSameDateKey(new Date(activeSession.date), todayKey)) {
      throw new AppError(
        'This session is from a previous day. Use past checkout to regularize it.',
        400,
        'PAST_SESSION_REQUIRES_REGULARIZATION'
      );
    }

    if (now <= new Date(activeSession.checkInTime)) {
      throw new AppError('Check-out time must be after check-in time', 400, 'CHECKOUT_BEFORE_CHECKIN');
    }

    const sessionDuration = calculateDuration(new Date(activeSession.checkInTime), now);

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
    const finalDailyStatus = determineStatus(dailyTotalMinutes);

    const updatedSession = await prisma.attendanceRecord.update({
      where: { id: activeSession.id },
      data: {
        checkOutTime: now,
        checkOutLocation: input.checkOutLocation as unknown as Prisma.InputJsonValue,
        notes: input.notes ?? activeSession.notes,
        status: finalDailyStatus,
        duration: sessionDuration as unknown as Prisma.InputJsonValue,
        ipAddress: ipAddress ?? activeSession.ipAddress,
        deviceInfo: userAgent ?? activeSession.deviceInfo
      }
    });

    const recalculatedStatus = await recalculateDailyStatus(userId, new Date(activeSession.date));

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
      session: { ...updatedSession, status: recalculatedStatus },
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
    const timeZone = await getOrganizationTimeZone(orgId);
    const today = parseDateOnly(getDateKeyInTimeZone(new Date(), timeZone));

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

    if (record.verificationStatus === 'VERIFIED') {
      throw new AppError('Verified attendance records cannot be modified', 409, 'VERIFIED_RECORD_IMMUTABLE');
    }

    if (record.checkOutTime) {
      throw new AppError('This session has already been checked out', 409, 'ALREADY_CHECKED_OUT');
    }

    const checkOutDateTime = parseDateTime(input.checkOutTime, 'checkOutTime');
    const now = new Date();

    if (checkOutDateTime > now) {
      throw new AppError('Check-out time cannot be in the future', 400, 'FUTURE_DATETIME_INVALID');
    }

    if (checkOutDateTime <= new Date(record.checkInTime)) {
      throw new AppError('Check-out time must be after check-in time', 400, 'CHECKOUT_BEFORE_CHECKIN');
    }

    const orgTimeZone = await getOrganizationTimeZone(orgId);
    const timeZone = getTimeZone(input.clientTimezone, orgTimeZone);
    const recordDateKey = new Date(record.date).toISOString().slice(0, 10);
    if (getDateKeyInTimeZone(checkOutDateTime, timeZone) !== recordDateKey) {
      throw new AppError('Check-out time must be on the attendance date', 400, 'CHECKOUT_DATE_MISMATCH');
    }

    const duration = calculateDuration(new Date(record.checkInTime), checkOutDateTime);

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOutTime: checkOutDateTime,
        notes: input.notes ? `${record.notes ?? ''} | Regularized: ${input.notes}`.trim() : record.notes,
        duration: duration as unknown as Prisma.InputJsonValue,
        status: determineStatus(duration.totalMinutes),
        verificationStatus: 'UNVERIFIED'
      }
    });

    const status = await recalculateDailyStatus(userId, new Date(record.date));
    return { ...updated, status };
  }

  static async createPastAttendance(orgId: string, userId: string, input: PastAttendanceInput) {
    const user = await prisma.user.findFirst({
      where: { id: userId, orgId }
    });
    if (!user) {
      throw new AppError('User not found in organization', 404, 'USER_NOT_FOUND');
    }

    const now = new Date();
    const orgTimeZone = await getOrganizationTimeZone(orgId);
    const timeZone = getTimeZone(input.clientTimezone, orgTimeZone);
    const attendanceDate = parseDateOnly(input.date);
    const todayKey = getDateKeyInTimeZone(now, orgTimeZone);

    if (input.date > todayKey) {
      throw new AppError('Cannot add attendance for future dates', 400, 'FUTURE_DATE_INVALID');
    }

    if (user.hiredDate) {
      const hiredDateKey = getDateKeyInTimeZone(new Date(user.hiredDate), orgTimeZone);
      if (input.date < hiredDateKey) {
        throw new AppError(
          'Cannot add attendance for a date prior to employment hired date',
          400,
          'BEFORE_HIRED_DATE'
        );
      }
    }

    const checkIn = parseDateTime(input.checkInTime, 'checkInTime');
    const checkOut = parseDateTime(input.checkOutTime, 'checkOutTime');

    if (checkOut <= checkIn) {
      throw new AppError('Check-out time must be after check-in time', 400, 'CHECKOUT_BEFORE_CHECKIN');
    }

    if (checkOut > now) {
      throw new AppError('Check-out time cannot be in the future', 400, 'FUTURE_DATETIME_INVALID');
    }

    if (
      getDateKeyInTimeZone(checkIn, timeZone) !== input.date ||
      getDateKeyInTimeZone(checkOut, timeZone) !== input.date
    ) {
      throw new AppError('Check-in and check-out times must be on the selected date', 400, 'DATE_MISMATCH');
    }

    const overlapping = await prisma.attendanceRecord.findFirst({
      where: {
        userId,
        date: attendanceDate,
        OR: [
          { checkOutTime: null },
          {
            checkInTime: { lt: checkOut },
            checkOutTime: { gt: checkIn }
          }
        ]
      }
    });

    if (overlapping) {
      throw new AppError(
        'An attendance session already exists for the selected time',
        409,
        'OVERLAPPING_ATTENDANCE'
      );
    }

    const lastSession = await prisma.attendanceRecord.findFirst({
      where: { userId, date: attendanceDate },
      orderBy: { sessionNumber: 'desc' }
    });
    const sessionNumber = (lastSession?.sessionNumber ?? 0) + 1;

    const duration = calculateDuration(checkIn, checkOut);

    const record = await prisma.attendanceRecord.create({
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
        status: determineStatus(duration.totalMinutes),
        verificationStatus: 'UNVERIFIED'
      }
    });

    const status = await recalculateDailyStatus(userId, attendanceDate);
    return { ...record, status };
  }

  static async getUserAttendanceHistory(
    orgId: string,
    actor: AttendanceActor,
    targetUserId: string,
    filters: AttendanceFilterInput
  ) {
    const target = await prisma.user.findFirst({
      where: { id: targetUserId, orgId },
      select: { id: true, managerId: true }
    });

    if (!target) {
      throw new AppError('User not found in organization', 404, 'USER_NOT_FOUND');
    }

    if (!canViewUserAttendance(actor, target)) {
      throw new AppError(
        'Access denied. You can only view your own attendance or your direct reports.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

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
        ...(filters.startDate ? { gte: parseStartAndEndOfDay(filters.startDate, 'startDate').start } : {}),
        ...(filters.endDate ? { lte: parseStartAndEndOfDay(filters.endDate, 'endDate').end } : {})
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
    actor: AttendanceActor,
    managerIdFilter?: string
  ) {
    const timeZone = await getOrganizationTimeZone(orgId);
    const todayKey = getDateKeyInTimeZone(new Date(), timeZone);
    const { start: startOfDay, end: endOfDay } = parseStartAndEndOfDay(todayKey);

    const isElevated = canViewAllAttendance(actor);

    const whereUser: Prisma.UserWhereInput = {
      orgId,
      status: 'active'
    };

    if (!isElevated) {
      whereUser.managerId = actor.id;
    } else if (managerIdFilter && managerIdFilter !== 'all' && managerIdFilter !== actor.id) {
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
    actor: AttendanceActor,
    managerIdParam?: string
  ) {
    const isElevated = canViewAllAttendance(actor);

    const where: Prisma.AttendanceRecordWhereInput = {
      user: { orgId },
      verificationStatus: 'UNVERIFIED'
    };

    if (!isElevated) {
      where.user = { orgId, managerId: actor.id };
    } else if (managerIdParam && managerIdParam !== 'all' && managerIdParam !== actor.id) {
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
    actor: AttendanceActor,
    attendanceId: string,
    verificationStatus: 'VERIFIED' | 'REJECTED',
    remarks?: string
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

    if (!canVerifyUserAttendance(actor, record.user)) {
      throw new AppError(
        'Access denied. You can only verify attendance records for your direct subordinates.',
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    const trimmedRemarks = remarks?.trim();
    const notes = trimmedRemarks
      ? `${record.notes ? `${record.notes} | ` : ''}Verification: ${trimmedRemarks}`
      : record.notes;

    return prisma.attendanceRecord.update({
      where: { id: attendanceId },
      data: {
        verificationStatus,
        notes,
        verifiedAt: new Date(),
        verifiedBy: actor.id
      }
    });
  }

  static async deleteAttendance(orgId: string, id: string, actor: AttendanceActor) {
    const record = await prisma.attendanceRecord.findFirst({
      where: { id },
      include: { user: { select: { orgId: true } } }
    });

    if (record?.user.orgId !== orgId) {
      throw new AppError('Attendance record not found', 404, 'RECORD_NOT_FOUND');
    }

    if (record.verificationStatus === 'VERIFIED') {
      throw new AppError('Verified attendance records cannot be deleted', 409, 'VERIFIED_RECORD_IMMUTABLE');
    }

    if (!canViewAllAttendance(actor) && record.userId !== actor.id) {
      throw new AppError('You can only delete your own attendance requests', 403, 'FORBIDDEN');
    }

    await prisma.attendanceRecord.delete({ where: { id } });
    return { message: 'Attendance record deleted successfully' };
  }
}
