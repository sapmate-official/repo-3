import { Prisma, type Holiday, type HolidayType } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import { logger } from '../../config/logger.js';
import { EmailService } from '../../services/email.service.js';
import type {
  CreateHolidayInput,
  UpdateHolidayInput,
  ListHolidaysQuery,
  CreateHolidayTypeInput,
  UpdateHolidayTypeInput
} from './holiday.schema.js';

export class HolidayService {
  /**
   * List holidays for an organization with optional filters (year, month, type, isOptional)
   */
  static async listHolidays(orgId: string, filters?: Partial<ListHolidaysQuery>) {
    const where: Prisma.HolidayWhereInput = { orgId };

    if (filters?.year) {
      const year = filters.year;
      if (filters.month) {
        const month = filters.month;
        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
        where.date = { gte: startDate, lte: endDate };
      } else {
        const startDate = new Date(Date.UTC(year, 0, 1));
        const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
        where.date = { gte: startDate, lte: endDate };
      }
    }

    if (filters?.type) {
      where.type = filters.type;
    }

    if (typeof filters?.isOptional === 'boolean') {
      where.isOptional = filters.isOptional;
    }

    const holidays = await prisma.holiday.findMany({
      where,
      include: {
        holidayType: true
      },
      orderBy: {
        date: 'asc'
      }
    });

    return holidays;
  }

  /**
   * Get single holiday by ID with tenant isolation
   */
  static async getHolidayById(orgId: string, id: string) {
    const holiday = await prisma.holiday.findUnique({
      where: { id },
      include: { holidayType: true }
    });

    if (holiday?.orgId !== orgId) {
      throw new AppError('Holiday not found', 404, 'HOLIDAY_NOT_FOUND');
    }

    return holiday;
  }

  /**
   * Create a new holiday with tenant isolation and background employee announcement
   */
  static async createHoliday(orgId: string, input: CreateHolidayInput) {
    // If a type is provided, verify it belongs to this organization
    if (input.type) {
      const holidayType = await prisma.holidayType.findUnique({
        where: { id: input.type }
      });
      if (holidayType?.orgId !== orgId) {
        throw new AppError('Invalid holiday type for this organization', 400, 'INVALID_HOLIDAY_TYPE');
      }
    }

    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true }
    });
    if (!organization) {
      throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    // Normalize date to UTC start of day or ISO date
    const holidayDate = new Date(input.date);

    try {
      const newHoliday = await prisma.holiday.create({
        data: {
          orgId,
          name: input.name,
          date: holidayDate,
          description: input.description ?? null,
          isOptional: input.isOptional ?? false,
          type: input.type ?? null
        },
        include: {
          holidayType: true
        }
      });

      // Dispatch announcement email in background without blocking response
      void this.dispatchHolidayAnnouncement(orgId, organization.name, newHoliday);

      return newHoliday;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('A holiday is already scheduled for this date in your organization', 409, 'HOLIDAY_DATE_CONFLICT');
      }
      throw error;
    }
  }

  /**
   * Update an existing holiday
   */
  static async updateHoliday(orgId: string, id: string, input: UpdateHolidayInput) {
    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (existing?.orgId !== orgId) {
      throw new AppError('Holiday not found', 404, 'HOLIDAY_NOT_FOUND');
    }

    if (input.type) {
      const holidayType = await prisma.holidayType.findUnique({ where: { id: input.type } });
      if (holidayType?.orgId !== orgId) {
        throw new AppError('Invalid holiday type for this organization', 400, 'INVALID_HOLIDAY_TYPE');
      }
    }

    try {
      const updatedHoliday = await prisma.holiday.update({
        where: { id },
        data: {
          name: input.name ?? existing.name,
          date: input.date ? new Date(input.date) : existing.date,
          description: input.description ?? existing.description,
          isOptional: input.isOptional ?? existing.isOptional,
          type: input.type !== undefined ? input.type : existing.type
        },
        include: {
          holidayType: true
        }
      });

      return updatedHoliday;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('A holiday is already scheduled for this date in your organization', 409, 'HOLIDAY_DATE_CONFLICT');
      }
      throw error;
    }
  }

  /**
   * Delete a holiday
   */
  static async deleteHoliday(orgId: string, id: string) {
    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (existing?.orgId !== orgId) {
      throw new AppError('Holiday not found', 404, 'HOLIDAY_NOT_FOUND');
    }

    await prisma.holiday.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Get calendar-formatted holidays
   */
  static async getCalendar(orgId: string, year?: number, month?: number) {
    const targetYear = year ?? new Date().getFullYear();
    const holidays = await this.listHolidays(orgId, { year: targetYear, month });

    return holidays.map((h: Holiday & { holidayType: HolidayType | null }) => {
      const dateObj = new Date(h.date);
      return {
        id: h.id,
        title: h.name,
        date: dateObj.toISOString().split('T')[0],
        day: dateObj.getUTCDate(),
        month: dateObj.getUTCMonth() + 1,
        year: dateObj.getUTCFullYear(),
        description: h.description,
        isOptional: h.isOptional,
        holidayType: h.holidayType?.name ?? null,
        holidayPolicy: h.holidayType?.policy ?? null
      };
    });
  }

  /**
   * Get upcoming holidays
   */
  static async getUpcoming(orgId: string, limit = 5) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const holidays = await prisma.holiday.findMany({
      where: {
        orgId,
        date: { gte: now }
      },
      include: {
        holidayType: true
      },
      orderBy: {
        date: 'asc'
      },
      take: limit
    });

    return holidays;
  }

  /**
   * Bulk create holidays
   */
  static async bulkCreate(orgId: string, holidaysInput: CreateHolidayInput[]) {
    const created: unknown[] = [];

    for (const item of holidaysInput) {
      const createdItem = await this.createHoliday(orgId, item);
      created.push(createdItem);
    }

    return created;
  }

  /**
   * Background announcement dispatch
   */
  private static async dispatchHolidayAnnouncement(
    orgId: string,
    companyName: string,
    holiday: { name: string; date: Date; description: string | null; isOptional: boolean }
  ): Promise<void> {
    try {
      const activeEmployees = await prisma.user.findMany({
        where: {
          orgId,
          status: 'active'
        },
        select: {
          email: true,
          firstName: true,
          lastName: true
        }
      });

      const recipients = (activeEmployees ?? [])
        .filter((u: { email: string; firstName: string | null; lastName: string | null }) => typeof u.email === 'string' && u.email.trim().length > 0)
        .map((u: { email: string; firstName: string | null; lastName: string | null }) => ({
          email: u.email,
          name: [u.firstName, u.lastName].filter(Boolean).join(' ') || undefined
        }));

      if (!recipients.length) return;

      await EmailService.sendHolidayAnnouncementEmail({
        recipients,
        holidayName: holiday.name,
        holidayDate: holiday.date,
        description: holiday.description,
        isOptional: holiday.isOptional,
        companyName
      });
    } catch (err: unknown) {
      logger.error({ err, orgId, holidayName: holiday.name }, '[HolidayService] Background announcement email error');
    }
  }
}

export class HolidayTypeService {
  /**
   * List all holiday types for an organization
   */
  static async listTypes(orgId: string) {
    const holidayTypes = await prisma.holidayType.findMany({
      where: { orgId },
      include: {
        _count: {
          select: { Holiday: true }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    return holidayTypes;
  }

  /**
   * Get single holiday type by ID
   */
  static async getTypeById(orgId: string, id: string) {
    const holidayType = await prisma.holidayType.findUnique({
      where: { id },
      include: {
        _count: {
          select: { Holiday: true }
        }
      }
    });

    if (holidayType?.orgId !== orgId) {
      throw new AppError('Holiday type not found', 404, 'HOLIDAY_TYPE_NOT_FOUND');
    }

    return holidayType;
  }

  /**
   * Create a new holiday type
   */
  static async createType(orgId: string, input: CreateHolidayTypeInput) {
    try {
      const holidayType = await prisma.holidayType.create({
        data: {
          orgId,
          name: input.name,
          policy: input.policy ?? null
        }
      });

      return holidayType;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('A holiday type with this name already exists in your organization', 409, 'HOLIDAY_TYPE_NAME_CONFLICT');
      }
      throw error;
    }
  }

  /**
   * Update an existing holiday type
   */
  static async updateType(orgId: string, id: string, input: UpdateHolidayTypeInput) {
    const existing = await prisma.holidayType.findUnique({ where: { id } });
    if (existing?.orgId !== orgId) {
      throw new AppError('Holiday type not found', 404, 'HOLIDAY_TYPE_NOT_FOUND');
    }

    try {
      const updatedType = await prisma.holidayType.update({
        where: { id },
        data: {
          name: input.name ?? existing.name,
          policy: input.policy !== undefined ? input.policy : existing.policy
        }
      });

      return updatedType;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('A holiday type with this name already exists in your organization', 409, 'HOLIDAY_TYPE_NAME_CONFLICT');
      }
      throw error;
    }
  }

  /**
   * Delete a holiday type (verifies no holidays are linked)
   */
  static async deleteType(orgId: string, id: string) {
    const existing = await prisma.holidayType.findUnique({
      where: { id },
      include: {
        Holiday: { select: { id: true }, take: 1 }
      }
    });

    if (existing?.orgId !== orgId) {
      throw new AppError('Holiday type not found', 404, 'HOLIDAY_TYPE_NOT_FOUND');
    }

    if (existing.Holiday.length > 0) {
      throw new AppError('Cannot delete holiday type as it is in use by one or more holidays', 400, 'HOLIDAY_TYPE_IN_USE');
    }

    await prisma.holidayType.delete({ where: { id } });
    return { success: true };
  }
}
