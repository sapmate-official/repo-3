import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BankDetails, User } from '@prisma/client';

const prismaMock = vi.hoisted(() => ({
  user: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn()
  },
  bankDetails: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import prisma from '../../src/db/prisma.js';
import { BankService } from '../../src/modules/bank/bank.service.js';
import { PERMISSION_KEYS } from '../../src/modules/auth/permissionKeys.js';
import { AppError } from '../../src/util/errors.js';

describe('BankService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockBank: BankDetails = {
    id: 'bank-1',
    userId: 'user-1',
    accountHolder: 'Employee One',
    accountNumber: '123456789012',
    ifscCode: 'HDFC0000001',
    bankName: 'HDFC Bank',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01')
  };

  const createMockUser = (overrides?: Partial<User>): User => ({
    id: 'user-1',
    orgId: 'org-a',
    firstName: 'Employee',
    lastName: 'One',
    email: 'emp@test.com',
    personalEmail: null,
    businessEmail: null,
    jobTitle: null,
    mobileNumber: null,
    emergencyContact: null,
    dateOfBirth: null,
    hiredDate: null,
    address: null,
    adharNumber: null,
    panNumber: null,
    employeeId: 'EMP001',
    departmentId: null,
    managerId: null,
    status: 'active',
    terminationDate: null,
    hashedPassword: 'hash',
    refreshToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    verificationToken: null,
    verificationTokenExpiry: null,
    ...overrides
  });

  describe('getBankDetailsByUserId', () => {
    it('throws 404 if employee does not exist in the caller organization', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      await expect(
        BankService.getBankDetailsByUserId('org-a', 'user-1', { id: 'user-1' })
      ).rejects.toThrow(AppError);
    });

    it('allows an employee to view their own bank details', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(createMockUser({ id: 'user-1' }));
      vi.mocked(prisma.bankDetails.findUnique).mockResolvedValue(mockBank);

      const result = await BankService.getBankDetailsByUserId('org-a', 'user-1', { id: 'user-1' });
      expect(result).toEqual(mockBank);
      expect(prisma.bankDetails.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });

    it('rejects another employee without permission (403)', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(createMockUser({ id: 'user-2' }));

      await expect(
        BankService.getBankDetailsByUserId('org-a', 'user-2', {
          id: 'user-1',
          permissions: []
        })
      ).rejects.toThrow(AppError);
    });

    it('allows an Org_Admin to view any employee bank details', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(createMockUser({ id: 'user-2' }));
      vi.mocked(prisma.bankDetails.findUnique).mockResolvedValue({ ...mockBank, userId: 'user-2' });

      const result = await BankService.getBankDetailsByUserId('org-a', 'user-2', {
        id: 'admin-1',
        roles: ['Org_Admin']
      });

      expect(result.userId).toBe('user-2');
    });

    it('allows a manager with view_bank_subordinates to view their direct report', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(
        createMockUser({ id: 'user-sub', managerId: 'manager-1' })
      );
      vi.mocked(prisma.bankDetails.findUnique).mockResolvedValue({ ...mockBank, userId: 'user-sub' });

      const result = await BankService.getBankDetailsByUserId('org-a', 'user-sub', {
        id: 'manager-1',
        permissions: [PERMISSION_KEYS.bankViewSubordinates]
      });

      expect(result.userId).toBe('user-sub');
    });

    it('denies a manager with view_bank_subordinates for a non-subordinate', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(
        createMockUser({ id: 'user-other', managerId: 'manager-other' })
      );

      await expect(
        BankService.getBankDetailsByUserId('org-a', 'user-other', {
          id: 'manager-1',
          permissions: [PERMISSION_KEYS.bankViewSubordinates]
        })
      ).rejects.toThrow(AppError);
    });

    it('throws 404 if bank record has not been created yet', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(createMockUser({ id: 'user-1' }));
      vi.mocked(prisma.bankDetails.findUnique).mockResolvedValue(null);

      await expect(
        BankService.getBankDetailsByUserId('org-a', 'user-1', { id: 'user-1' })
      ).rejects.toThrow(AppError);
    });
  });

  describe('getBankDetailsByIdOrUserId', () => {
    it('resolves by user id if user matches', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(createMockUser({ id: 'user-1' }));
      vi.mocked(prisma.bankDetails.findUnique).mockResolvedValue(mockBank);

      const res = await BankService.getBankDetailsByIdOrUserId('org-a', 'user-1', { id: 'user-1' });
      expect(res).toEqual(mockBank);
    });

    it('resolves by bank record id if user id did not match', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.bankDetails.findFirst).mockResolvedValue({
        ...mockBank,
        user: createMockUser({ id: 'user-1', managerId: null })
      } as unknown as BankDetails);

      const res = await BankService.getBankDetailsByIdOrUserId('org-a', 'bank-1', { id: 'user-1' });
      expect(res.id).toBe('bank-1');
    });
  });

  describe('listAllBankDetails', () => {
    it('throws 403 if caller lacks permission', async () => {
      await expect(
        BankService.listAllBankDetails('org-a', { id: 'u-1', permissions: [] })
      ).rejects.toThrow(AppError);
    });

    it('returns bank details for users with bankView permission', async () => {
      vi.mocked(prisma.bankDetails.count).mockResolvedValue(1);
      vi.mocked(prisma.bankDetails.findMany).mockResolvedValue([
        {
          ...mockBank,
          user: {
            id: 'user-1',
            firstName: 'Alice',
            lastName: 'Sharma',
            employeeId: 'EMP001',
            email: 'alice@example.com'
          }
        } as unknown as BankDetails
      ]);

      const result = await BankService.listAllBankDetails('org-a', {
        id: 'u-hr',
        permissions: [PERMISSION_KEYS.bankView]
      });

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.user.firstName).toBe('Alice');
    });
  });

  describe('upsertBankDetails', () => {
    const input = {
      userId: 'user-1',
      accountHolder: 'Alice Sharma',
      accountNumber: '987654321012',
      ifscCode: 'ICIC0000001',
      bankName: 'ICICI Bank'
    };

    it('throws 404 if user not found in organization', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      await expect(
        BankService.upsertBankDetails('org-a', input, { id: 'admin-1', roles: ['Org_Admin'] })
      ).rejects.toThrow(AppError);
    });

    it('throws 403 if unauthorized user attempts to update someone else bank details', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(createMockUser({ id: 'user-1' }));

      await expect(
        BankService.upsertBankDetails('org-a', input, { id: 'user-2', permissions: [] })
      ).rejects.toThrow(AppError);
    });

    it('allows self update when user has update_bank_own permission', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(
        createMockUser({
          id: 'user-1',
          firstName: 'Alice',
          lastName: 'Sharma'
        })
      );
      vi.mocked(prisma.bankDetails.upsert).mockResolvedValue({
        ...mockBank,
        ...input
      });

      const res = await BankService.upsertBankDetails('org-a', input, {
        id: 'user-1',
        permissions: [PERMISSION_KEYS.bankUpdateOwn]
      });

      expect(res.accountNumber).toBe('987654321012');
      expect(prisma.bankDetails.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' }
        })
      );
    });
  });

  describe('deleteBankDetails', () => {
    it('throws 404 if bank record does not exist', async () => {
      vi.mocked(prisma.bankDetails.findFirst).mockResolvedValue(null);

      await expect(
        BankService.deleteBankDetails('org-a', { userId: 'user-1' }, { id: 'admin-1', roles: ['Org_Admin'] })
      ).rejects.toThrow(AppError);
    });

    it('deletes bank details when actor has Org_Admin role', async () => {
      vi.mocked(prisma.bankDetails.findFirst).mockResolvedValue({
        ...mockBank,
        user: createMockUser({ id: 'user-1' })
      } as unknown as BankDetails);
      vi.mocked(prisma.bankDetails.delete).mockResolvedValue(mockBank);

      await BankService.deleteBankDetails(
        'org-a',
        { userId: 'user-1' },
        { id: 'admin-1', roles: ['Org_Admin'] }
      );

      expect(prisma.bankDetails.delete).toHaveBeenCalledWith({ where: { id: 'bank-1' } });
    });
  });
});
