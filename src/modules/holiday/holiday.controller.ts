import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import { HolidayService, HolidayTypeService } from './holiday.service.js';
import type {
  CreateHolidayInput,
  UpdateHolidayInput,
  ListHolidaysQuery,
  CreateHolidayTypeInput,
  UpdateHolidayTypeInput
} from './holiday.schema.js';

const getOrgId = (req: Request): string => {
  const orgId = (req.params.orgId as string | undefined) ?? req.user?.orgId ?? '';
  if (!orgId) {
    throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
  }
  return orgId;
};

export class HolidayController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const query = req.query as unknown as ListHolidaysQuery;
      const holidays = await HolidayService.listHolidays(orgId, query);
      res.status(200).json(holidays);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const { id } = req.params as { id: string };

      // Legacy compatibility: if :id equals orgId, return holiday list
      if (id === orgId) {
        const query = req.query as unknown as ListHolidaysQuery;
        const holidays = await HolidayService.listHolidays(orgId, query);
        res.status(200).json(holidays);
        return;
      }

      try {
        const holiday = await HolidayService.getHolidayById(orgId, id);
        res.status(200).json(holiday);
        return;
      } catch (err) {
        const org = await prisma.organization.findUnique({
          where: { id },
          select: { id: true }
        });
        if (org) {
          const query = req.query as unknown as ListHolidaysQuery;
          const holidays = await HolidayService.listHolidays(id, query);
          res.status(200).json(holidays);
          return;
        }
        throw err;
      }
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const input = req.body as CreateHolidayInput;
      const newHoliday = await HolidayService.createHoliday(orgId, input);
      res.status(201).json(newHoliday);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const { id } = req.params as { id: string };
      const input = req.body as UpdateHolidayInput;
      const updated = await HolidayService.updateHoliday(orgId, id, input);
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const { id } = req.params as { id: string };
      await HolidayService.deleteHoliday(orgId, id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  static async getCalendar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const year = req.query.year ? Number(req.query.year) : undefined;
      const month = req.query.month ? Number(req.query.month) : undefined;
      const calendar = await HolidayService.getCalendar(orgId, year, month);
      res.status(200).json(calendar);
    } catch (error) {
      next(error);
    }
  }

  static async getUpcoming(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const limit = req.query.limit ? Number(req.query.limit) : 5;
      const upcoming = await HolidayService.getUpcoming(orgId, limit);
      res.status(200).json(upcoming);
    } catch (error) {
      next(error);
    }
  }

  static async bulkCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const { holidays } = req.body as { holidays: CreateHolidayInput[] };
      const created = await HolidayService.bulkCreate(orgId, holidays);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  }

  static async toggle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const { id } = req.params as { id: string };
      const { isActive } = req.body as { isActive: boolean };
      const updated = await HolidayService.updateHoliday(orgId, id, { isOptional: !isActive });
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }
}

export class HolidayTypeController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const types = await HolidayTypeService.listTypes(orgId);
      res.status(200).json({
        success: true,
        count: types.length,
        data: types
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const { id } = req.params as { id: string };

      // Legacy compatibility: if :id equals orgId, return all holiday types
      if (id === orgId) {
        const types = await HolidayTypeService.listTypes(orgId);
        res.status(200).json({
          success: true,
          count: types.length,
          data: types
        });
        return;
      }

      try {
        const type = await HolidayTypeService.getTypeById(orgId, id);
        res.status(200).json({
          success: true,
          data: type
        });
        return;
      } catch (err) {
        const org = await prisma.organization.findUnique({
          where: { id },
          select: { id: true }
        });
        if (org) {
          const types = await HolidayTypeService.listTypes(id);
          res.status(200).json({
            success: true,
            count: types.length,
            data: types
          });
          return;
        }
        throw err;
      }
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const input = req.body as CreateHolidayTypeInput;
      const newType = await HolidayTypeService.createType(orgId, input);
      res.status(201).json({
        success: true,
        data: newType
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const { id } = req.params as { id: string };
      const input = req.body as UpdateHolidayTypeInput;
      const updated = await HolidayTypeService.updateType(orgId, id, input);
      res.status(200).json({
        success: true,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const { id } = req.params as { id: string };
      await HolidayTypeService.deleteType(orgId, id);
      res.status(200).json({
        success: true,
        message: 'Holiday type deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}
