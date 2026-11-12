import type { Request, Response, NextFunction } from 'express';
import { LeaveService } from './leave.service.js';
import { AppError } from '../../util/errors.js';
import type { LeaveActor } from './leave.access.js';
import {
  leaveApproveSchema,
  leaveBalanceCreateSchema,
  leaveBalanceUpdateSchema,
  leaveRejectSchema,
  leaveRequestCreateSchema,
  leaveRequestUpdateSchema,
  leaveTypeCreateSchema,
  leaveTypeUpdateSchema
} from './leave.schema.js';

const strParam = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    const first: unknown = value[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const getActor = (req: Request): LeaveActor => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }
  return req.user;
};

const requestedOrgId = (req: Request): string | undefined =>
  strParam(req.query.orgId) ??
  strParam(req.query.org_id) ??
  strParam(req.headers['x-org-id']) ??
  strParam(req.params.orgId) ??
  strParam(req.params.org_id);

export class LeaveTypeController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId =
        strParam(req.params.org_id) ??
        strParam(req.params.orgId) ??
        requestedOrgId(req);
      const leaveTypes = await LeaveService.listLeaveTypes(actor, orgId);
      res.status(200).json(leaveTypes);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Leave type ID is required', 400, 'LEAVE_TYPE_ID_REQUIRED');
      }

      const leaveType = await LeaveService.getLeaveType(actor, requestedOrgId(req), id);
      res.status(200).json(leaveType);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const input = leaveTypeCreateSchema.parse(req.body);
      const leaveType = await LeaveService.createLeaveType(actor, {
        ...input,
        orgId: input.orgId ?? requestedOrgId(req)
      });
      res.status(201).json(leaveType);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Leave type ID is required', 400, 'LEAVE_TYPE_ID_REQUIRED');
      }

      const input = leaveTypeUpdateSchema.parse(req.body);
      const leaveType = await LeaveService.updateLeaveType(
        actor,
        requestedOrgId(req),
        id,
        input
      );
      res.status(200).json(leaveType);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Leave type ID is required', 400, 'LEAVE_TYPE_ID_REQUIRED');
      }

      const result = await LeaveService.deleteLeaveType(actor, requestedOrgId(req), id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export class LeaveRequestController {
  static async listOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId =
        strParam(req.params.id) ??
        strParam(req.params.orgId) ??
        requestedOrgId(req);
      const requests = await LeaveService.listOrganizationRequests(actor, orgId);
      res.status(200).json(requests);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Leave request ID is required', 400, 'LEAVE_REQUEST_ID_REQUIRED');
      }

      const request = await LeaveService.getLeaveRequest(actor, requestedOrgId(req), id);
      res.status(200).json(request);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const input = leaveRequestCreateSchema.parse(req.body);
      const request = await LeaveService.createLeaveRequest(
        actor,
        requestedOrgId(req),
        input
      );
      res.status(201).json(request);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Leave request ID is required', 400, 'LEAVE_REQUEST_ID_REQUIRED');
      }

      const input = leaveRequestUpdateSchema.parse(req.body);
      const request = await LeaveService.updateLeaveRequest(
        actor,
        requestedOrgId(req),
        id,
        input
      );
      res.status(200).json(request);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Leave request ID is required', 400, 'LEAVE_REQUEST_ID_REQUIRED');
      }

      await LeaveService.deleteLeaveRequest(actor, requestedOrgId(req), id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  static async listByUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const userId = strParam(req.params.id);
      if (!userId) {
        throw new AppError('User ID is required', 400, 'USER_ID_REQUIRED');
      }

      const requests = await LeaveService.listUserRequests(
        actor,
        requestedOrgId(req),
        userId
      );
      res.status(200).json(requests);
    } catch (error) {
      next(error);
    }
  }

  static async listByManager(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const managerId = strParam(req.params.id);
      if (!managerId) {
        throw new AppError('Manager ID is required', 400, 'MANAGER_ID_REQUIRED');
      }

      const requests = await LeaveService.listManagerRequests(
        actor,
        requestedOrgId(req),
        managerId
      );
      res.status(200).json(requests);
    } catch (error) {
      next(error);
    }
  }

  static async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Leave request ID is required', 400, 'LEAVE_REQUEST_ID_REQUIRED');
      }

      leaveApproveSchema.parse(req.body);
      const result = await LeaveService.approveLeaveRequest(
        actor,
        requestedOrgId(req),
        id
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Leave request ID is required', 400, 'LEAVE_REQUEST_ID_REQUIRED');
      }

      const input = leaveRejectSchema.parse(req.body);
      const request = await LeaveService.rejectLeaveRequest(
        actor,
        requestedOrgId(req),
        id,
        input.rejectedReason
      );
      res.status(200).json(request);
    } catch (error) {
      next(error);
    }
  }

  static async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Leave request ID is required', 400, 'LEAVE_REQUEST_ID_REQUIRED');
      }

      const request = await LeaveService.cancelLeaveRequest(
        actor,
        requestedOrgId(req),
        id
      );
      res.status(200).json(request);
    } catch (error) {
      next(error);
    }
  }
}

export class LeaveBalanceController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const balances = await LeaveService.listBalances(actor, requestedOrgId(req));
      res.status(200).json(balances);
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Leave balance ID is required', 400, 'LEAVE_BALANCE_ID_REQUIRED');
      }

      const balance = await LeaveService.getBalanceById(
        actor,
        requestedOrgId(req),
        id
      );
      res.status(200).json(balance);
    } catch (error) {
      next(error);
    }
  }

  static async listByUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const userId = strParam(req.params.userId);
      if (!userId) {
        throw new AppError('User ID is required', 400, 'USER_ID_REQUIRED');
      }

      const balances = await LeaveService.listUserBalances(
        actor,
        requestedOrgId(req),
        userId
      );
      res.status(200).json(balances);
    } catch (error) {
      next(error);
    }
  }

  static async getByTypeAndUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const leaveTypeId = strParam(req.params.leavetypeId) ?? strParam(req.params.leaveTypeId);
      const userId = strParam(req.params.userId);
      if (!leaveTypeId || !userId) {
        throw new AppError(
          'Leave type ID and user ID are required',
          400,
          'LEAVE_BALANCE_IDENTIFIERS_REQUIRED'
        );
      }

      const balance = await LeaveService.getBalanceForTypeAndUser(
        actor,
        requestedOrgId(req),
        leaveTypeId,
        userId
      );
      res.status(200).json(balance);
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const input = leaveBalanceCreateSchema.parse(req.body);
      const balance = await LeaveService.createBalance(
        actor,
        requestedOrgId(req),
        input
      );
      res.status(201).json(balance);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Leave balance ID is required', 400, 'LEAVE_BALANCE_ID_REQUIRED');
      }

      const input = leaveBalanceUpdateSchema.parse(req.body);
      const balance = await LeaveService.updateBalance(
        actor,
        requestedOrgId(req),
        id,
        input
      );
      res.status(200).json(balance);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const id = strParam(req.params.id);
      if (!id) {
        throw new AppError('Leave balance ID is required', 400, 'LEAVE_BALANCE_ID_REQUIRED');
      }

      await LeaveService.deleteBalance(actor, requestedOrgId(req), id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}
