import type { BankDetails, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import { PERMISSION_KEYS } from '../auth/permissionKeys.js';
import type {
  CreateBankDetailsInput,
  UpdateBankDetailsInput,
  ListBankDetailsQuery
} from './bank.schema.js';

export interface BankActor {
  id: string;
  isSuperAdmin?: boolean;
  roles?: string[];
  permissions?: string[];
}

export class BankService {
  /**
   * Evaluates if the actor is permitted to read the target user's bank details.
   */
  private static canViewBankDetails(actor: BankActor, targetUserId: string, targetManagerId: string | null): boolean {
    if (actor.isSuperAdmin || (actor.roles?.includes('Org_Admin') ?? false)) {
      return true;
    }
    // Users can always view their own bank details
    if (actor.id === targetUserId) {
      return true;
    }
    const hasPerm = (p: string) => actor.permissions?.includes(p) ?? false;
    // View all users permission
    if (
      hasPerm(PERMISSION_KEYS.bankView) ||
      hasPerm(PERMISSION_KEYS.userRead) ||
      hasPerm('view_bank_all_user')
    ) {
      return true;
    }
    // View subordinates permission
    if (
      targetManagerId === actor.id &&
      (hasPerm(PERMISSION_KEYS.bankViewSubordinates) || hasPerm('view_bank_subordinates'))
    ) {
      return true;
    }
    return false;
  }

  /**
   * Evaluates if the actor is permitted to update/create the target user's bank details.
   */
  private static canManageBankDetails(actor: BankActor, targetUserId: string): boolean {
    if (actor.isSuperAdmin || (actor.roles?.includes('Org_Admin') ?? false)) {
      return true;
    }
    const hasPerm = (p: string) => actor.permissions?.includes(p) ?? false;
    // Organization managers or HR with bank/employee manage permissions
    if (
      hasPerm(PERMISSION_KEYS.bankManage) ||
      hasPerm(PERMISSION_KEYS.bankUpdateAll) ||
      hasPerm(PERMISSION_KEYS.userWrite) ||
      hasPerm('manage_bank') ||
      hasPerm('update_bank_all_user')
    ) {
      return true;
    }
    // User updating own bank details with update_bank_own permission
    if (
      actor.id === targetUserId &&
      (hasPerm(PERMISSION_KEYS.bankUpdateOwn) || hasPerm('update_bank_own'))
    ) {
      return true;
    }
    return false;
  }

  /**
   * Get bank details for a user within an organization.
   */
  static async getBankDetailsByUserId(
    orgId: string,
    targetUserId: string,
    actor: BankActor
  ): Promise<BankDetails> {
    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, orgId },
      select: { id: true, managerId: true }
    });

    if (!targetUser) {
      throw new AppError('Employee not found in your organization', 404, 'USER_NOT_FOUND');
    }

    if (!this.canViewBankDetails(actor, targetUserId, targetUser.managerId)) {
      throw new AppError("You do not have permission to view this user's bank details", 403, 'FORBIDDEN');
    }

    const bank = await prisma.bankDetails.findUnique({
      where: { userId: targetUserId }
    });

    if (!bank) {
      throw new AppError('Bank details not found for this user', 404, 'BANK_NOT_FOUND');
    }

    return bank;
  }

  /**
   * Get bank details by either bank id or userId (for flexible legacy compatibility).
   */
  static async getBankDetailsByIdOrUserId(
    orgId: string,
    idOrUserId: string,
    actor: BankActor
  ): Promise<BankDetails> {
    // 1. First check if idOrUserId matches a user in this organization
    const targetUser = await prisma.user.findFirst({
      where: { id: idOrUserId, orgId },
      select: { id: true, managerId: true }
    });

    if (targetUser) {
      return this.getBankDetailsByUserId(orgId, targetUser.id, actor);
    }

    // 2. Otherwise check if it matches a BankDetails record ID for this organization
    const bank = await prisma.bankDetails.findFirst({
      where: {
        id: idOrUserId,
        user: { orgId }
      },
      include: {
        user: {
          select: { id: true, managerId: true }
        }
      }
    });

    if (!bank) {
      throw new AppError('Bank details not found', 404, 'BANK_NOT_FOUND');
    }

    if (!this.canViewBankDetails(actor, bank.userId, bank.user.managerId)) {
      throw new AppError("You do not have permission to view this user's bank details", 403, 'FORBIDDEN');
    }

    const { user: _u, ...safeBank } = bank;
    return safeBank;
  }

  /**
   * List all bank details in an organization (for HR, Payroll, Admins).
   */
  static async listAllBankDetails(
    orgId: string,
    actor: BankActor,
    query?: ListBankDetailsQuery
  ): Promise<{ data: (BankDetails & { user: { id: string; firstName: string | null; lastName: string | null; employeeId: string | null; email: string } })[]; total: number }> {
    const hasPerm = (p: string) => actor.permissions?.includes(p) ?? false;
    const hasPermission =
      Boolean(actor.isSuperAdmin) ||
      (actor.roles?.includes('Org_Admin') ?? false) ||
      hasPerm(PERMISSION_KEYS.bankView) ||
      hasPerm(PERMISSION_KEYS.userRead) ||
      hasPerm('view_bank_all_user');

    if (!hasPermission) {
      throw new AppError('You do not have permission to view all bank details', 403, 'FORBIDDEN');
    }

    const page = query?.page ?? 1;
    const limit = query?.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.BankDetailsWhereInput = {
      user: {
        orgId,
        ...(query?.search
          ? {
              OR: [
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
                { employeeId: { contains: query.search, mode: 'insensitive' } }
              ]
            }
          : {})
      }
    };

    const [total, banks] = await Promise.all([
      prisma.bankDetails.count({ where }),
      prisma.bankDetails.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
              email: true
            }
          }
        }
      })
    ]);

    return { data: banks, total };
  }

  /**
   * Create or update (upsert) bank details for an employee.
   */
  static async upsertBankDetails(
    orgId: string,
    input: CreateBankDetailsInput,
    actor: BankActor
  ): Promise<BankDetails> {
    const targetUser = await prisma.user.findFirst({
      where: { id: input.userId, orgId },
      select: { id: true, firstName: true, lastName: true }
    });

    if (!targetUser) {
      throw new AppError('Employee not found in your organization', 404, 'USER_NOT_FOUND');
    }

    if (!this.canManageBankDetails(actor, input.userId)) {
      throw new AppError("You do not have permission to update this user's bank details", 403, 'FORBIDDEN');
    }

    const accountHolder = input.accountHolder.trim() || `${targetUser.firstName} ${targetUser.lastName ?? ''}`.trim();

    return prisma.bankDetails.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        accountHolder,
        accountNumber: input.accountNumber.trim(),
        ifscCode: input.ifscCode.trim().toUpperCase(),
        bankName: input.bankName.trim()
      },
      update: {
        accountHolder,
        accountNumber: input.accountNumber.trim(),
        ifscCode: input.ifscCode.trim().toUpperCase(),
        bankName: input.bankName.trim()
      }
    });
  }

  /**
   * Partial update of existing bank details.
   */
  static async updateBankDetails(
    orgId: string,
    targetUserId: string,
    input: UpdateBankDetailsInput,
    actor: BankActor
  ): Promise<BankDetails> {
    const targetUser = await prisma.user.findFirst({
      where: { id: targetUserId, orgId },
      select: { id: true }
    });

    if (!targetUser) {
      throw new AppError('Employee not found in your organization', 404, 'USER_NOT_FOUND');
    }

    if (!this.canManageBankDetails(actor, targetUserId)) {
      throw new AppError("You do not have permission to update this user's bank details", 403, 'FORBIDDEN');
    }

    const existing = await prisma.bankDetails.findUnique({
      where: { userId: targetUserId }
    });

    if (!existing) {
      throw new AppError('Bank details not found for this user', 404, 'BANK_NOT_FOUND');
    }

    return prisma.bankDetails.update({
      where: { userId: targetUserId },
      data: {
        ...(input.accountHolder !== undefined ? { accountHolder: input.accountHolder.trim() } : {}),
        ...(input.accountNumber !== undefined ? { accountNumber: input.accountNumber.trim() } : {}),
        ...(input.ifscCode !== undefined ? { ifscCode: input.ifscCode.trim().toUpperCase() } : {}),
        ...(input.bankName !== undefined ? { bankName: input.bankName.trim() } : {})
      }
    });
  }

  /**
   * Delete bank details for a user within an organization.
   */
  static async deleteBankDetails(
    orgId: string,
    identifier: { id?: string; userId?: string },
    actor: BankActor
  ): Promise<void> {
    const targetUserId = identifier.userId;
    const recordId = identifier.id;

    if (!targetUserId && !recordId) {
      throw new AppError('User ID or Bank Record ID is required', 400, 'BAD_REQUEST');
    }

    const bank = await prisma.bankDetails.findFirst({
      where: {
        ...(targetUserId ? { userId: targetUserId } : { id: recordId }),
        user: { orgId }
      },
      include: {
        user: { select: { id: true } }
      }
    });

    if (!bank) {
      throw new AppError('Bank details not found', 404, 'BANK_NOT_FOUND');
    }

    const hasPerm = (p: string) => actor.permissions?.includes(p) ?? false;
    const hasPermission =
      Boolean(actor.isSuperAdmin) ||
      (actor.roles?.includes('Org_Admin') ?? false) ||
      hasPerm(PERMISSION_KEYS.bankManage) ||
      hasPerm(PERMISSION_KEYS.userWrite) ||
      hasPerm('manage_bank');

    if (!hasPermission) {
      throw new AppError('You do not have permission to delete bank details', 403, 'FORBIDDEN');
    }

    await prisma.bankDetails.delete({
      where: { id: bank.id }
    });
  }
}
