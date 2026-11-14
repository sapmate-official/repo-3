import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../util/errors.js';
import { BankService, type BankActor } from './bank.service.js';
import type {
  CreateBankDetailsInput,
  UpdateBankDetailsInput,
  ListBankDetailsQuery
} from './bank.schema.js';

const getActor = (req: Request): BankActor => {
  if (req.user) {
    return {
      id: req.user.id,
      isSuperAdmin: req.user.isSuperAdmin,
      roles: req.user.roles,
      permissions: req.user.permissions
    };
  }
  if (req.superAdmin) {
    return {
      id: req.superAdmin.id,
      isSuperAdmin: true,
      roles: [],
      permissions: []
    };
  }
  throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
};

const getOrgId = (req: Request): string => {
  const orgId =
    req.user?.orgId ??
    (req.params.orgId as string | undefined) ??
    (req.query.orgId as string | undefined) ??
    '';
  if (!orgId) {
    throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
  }
  return orgId;
};

export class BankController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const actor = getActor(req);
      const query = req.query as unknown as ListBankDetailsQuery;
      const result = await BankService.listAllBankDetails(orgId, actor, query);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async getByUserId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const actor = getActor(req);
      const { userId } = req.params as { userId: string };
      const bank = await BankService.getBankDetailsByUserId(orgId, userId, actor);
      res.status(200).json(bank);
    } catch (error) {
      next(error);
    }
  }

  static async getByIdOrUserId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const actor = getActor(req);
      const { id } = req.params as { id: string };
      const bank = await BankService.getBankDetailsByIdOrUserId(orgId, id, actor);
      res.status(200).json(bank);
    } catch (error) {
      next(error);
    }
  }

  static async createOrUpsert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const actor = getActor(req);
      const input = req.body as CreateBankDetailsInput;
      const bank = await BankService.upsertBankDetails(orgId, input, actor);
      res.status(201).json(bank);
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const actor = getActor(req);
      const paramId = req.params.id as string | undefined;
      const body = req.body as UpdateBankDetailsInput;
      const targetUserId = paramId ?? body.userId ?? actor.id;

      if (!targetUserId) {
        throw new AppError('User ID is required to update bank details', 400, 'BAD_REQUEST');
      }

      // If full bank details provided, perform upsert
      if (body.accountHolder && body.accountNumber && body.ifscCode && body.bankName) {
        const upserted = await BankService.upsertBankDetails(
          orgId,
          {
            userId: targetUserId,
            accountHolder: body.accountHolder,
            accountNumber: body.accountNumber,
            ifscCode: body.ifscCode,
            bankName: body.bankName
          },
          actor
        );
        res.status(200).json(upserted);
        return;
      }

      const updated = await BankService.updateBankDetails(orgId, targetUserId, body, actor);
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = getOrgId(req);
      const actor = getActor(req);
      const paramId = req.params.id as string | undefined;
      const body = (req.body ?? {}) as { id?: string; userId?: string };

      const identifier = {
        id: paramId ?? body.id,
        userId: body.userId
      };

      await BankService.deleteBankDetails(orgId, identifier, actor);
      res.status(200).json({ message: 'Bank details deleted successfully', success: true });
    } catch (error) {
      next(error);
    }
  }
}
