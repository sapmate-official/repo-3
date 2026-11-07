import type { Request, Response, NextFunction } from 'express';
import { AttendanceService } from './attendance.service.js';
import {
  checkInSchema,
  checkOutSchema,
  pastCheckOutSchema,
  pastAttendanceSchema,
  verifyAttendanceSchema,
  attendanceFilterSchema
} from './attendance.schema.js';
import { AppError } from '../../util/errors.js';

const strParam = (val: unknown): string | undefined => {
  if (Array.isArray(val)) {
    const first: unknown = val[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
};

export class AttendanceController {
  // POST /api/v2/attendance/check-in OR /api/v1/attendance/check-in
  static async checkIn(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      const userId = req.user?.id;
      if (!orgId || !userId) {
        throw new AppError('Authentication and organization context required', 401, 'UNAUTHORIZED');
      }

      const input = checkInSchema.parse(req.body);
      const ipAddress = strParam(req.headers['x-forwarded-for']) ?? req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await AttendanceService.checkIn(orgId, userId, input, ipAddress, userAgent);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/attendance/check-out OR /api/v1/attendance/check-out
  static async checkOut(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      const userId = req.user?.id;
      if (!orgId || !userId) {
        throw new AppError('Authentication and organization context required', 401, 'UNAUTHORIZED');
      }

      const input = checkOutSchema.parse(req.body);
      const ipAddress = strParam(req.headers['x-forwarded-for']) ?? req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await AttendanceService.checkOut(orgId, userId, input, ipAddress, userAgent);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/attendance/session/:date OR GET /api/v1/attendance/session
  static async getSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      const userId = req.user?.id;
      if (!orgId || !userId) {
        throw new AppError('Authentication and organization context required', 401, 'UNAUTHORIZED');
      }

      const dateStr = strParam(req.params.date) ?? strParam(req.query.date) ?? new Date().toISOString().slice(0, 10);
      const sessions = await AttendanceService.getSessionsByDate(orgId, userId, dateStr);
      res.status(200).json(sessions);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/attendance/check-out/past
  static async getPastUnchecked(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      const userId = req.user?.id;
      if (!orgId || !userId) {
        throw new AppError('Authentication and organization context required', 401, 'UNAUTHORIZED');
      }

      const sessions = await AttendanceService.getPastUncheckedSessions(orgId, userId);
      res.status(200).json(sessions);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/attendance/check-out/past
  static async postPastCheckOut(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      const userId = req.user?.id;
      if (!orgId || !userId) {
        throw new AppError('Authentication and organization context required', 401, 'UNAUTHORIZED');
      }

      const input = pastCheckOutSchema.parse(req.body);
      const updated = await AttendanceService.postPastCheckOut(orgId, userId, input);
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/attendance/past-attendance
  static async createPastAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      const userId = req.user?.id;
      if (!orgId || !userId) {
        throw new AppError('Authentication and organization context required', 401, 'UNAUTHORIZED');
      }

      const input = pastAttendanceSchema.parse(req.body);
      const record = await AttendanceService.createPastAttendance(orgId, userId, input);
      res.status(201).json(record);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/attendance/history OR GET /api/v2/attendance/user/:id OR GET /api/v2/attendance/employees
  static async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const targetUserId = strParam(req.params.id) ?? strParam(req.query.userId) ?? req.user?.id;
      if (!targetUserId) {
        throw new AppError('Target user ID required', 400, 'USER_ID_REQUIRED');
      }

      const filters = attendanceFilterSchema.parse(req.query);
      const result = await AttendanceService.getUserAttendanceHistory(orgId, targetUserId, filters);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/attendance/live OR /live/all OR /manager/live/:managerId
  static async getLive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      const user = req.user;
      if (!orgId || !user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const managerIdFilter = strParam(req.params.managerId);
      const result = await AttendanceService.getLiveAttendance(orgId, user, managerIdFilter);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/attendance/verification OR /manager/verification/:managerId OR /admin/verification/:userId
  static async getVerificationQueue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      const user = req.user;
      if (!orgId || !user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const managerIdParam = strParam(req.params.managerId) ?? strParam(req.params.userId);
      const records = await AttendanceService.getVerificationQueue(orgId, user, managerIdParam);
      res.status(200).json(records);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v2/attendance/:id/verify OR POST /manager/verification OR POST /admin/verification
  static async verifyAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      const user = req.user;
      if (!orgId || !user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const parsed = verifyAttendanceSchema.parse(req.body);
      const attendanceId = strParam(req.params.id) ?? parsed.attendanceId;
      if (!attendanceId) {
        throw new AppError('Attendance ID is required', 400, 'ATTENDANCE_ID_REQUIRED');
      }

      const status = parsed.verificationStatus ?? (parsed.action?.toLowerCase() === 'reject' ? 'REJECTED' : 'VERIFIED');
      const updated = await AttendanceService.verifyAttendance(
        orgId,
        user,
        attendanceId,
        status === 'REJECTED' ? 'REJECTED' : 'VERIFIED',
        parsed.remarks
      );
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/v2/attendance/:id
  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      const user = req.user;
      if (!orgId || !user) {
        throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Attendance record ID is required', 400, 'ID_REQUIRED');
      }

      const result = await AttendanceService.deleteAttendance(orgId, id, user);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}
