import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const prismaMock = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), findUnique: vi.fn() },
  bankDetails: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { BankController } from '../../src/modules/bank/bank.controller.js';
import { BankService } from '../../src/modules/bank/bank.service.js';

describe('BankController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const mockBank = {
    id: 'bank-1',
    userId: 'user-1',
    accountHolder: 'Alice Sharma',
    accountNumber: '123456789012',
    ifscCode: 'SBIN0001234',
    bankName: 'State Bank of India',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it('getByUserId fetches bank details for user', async () => {
    const req = {
      params: { userId: 'user-1' },
      user: { id: 'user-1', orgId: 'org-a', roles: [], permissions: [], isSuperAdmin: false }
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    vi.spyOn(BankService, 'getBankDetailsByUserId').mockResolvedValue(mockBank);

    await BankController.getByUserId(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockBank);
  });

  it('createOrUpsert creates bank details with status 201', async () => {
    const req = {
      body: {
        userId: 'user-1',
        accountHolder: 'Alice Sharma',
        accountNumber: '123456789012',
        ifscCode: 'SBIN0001234',
        bankName: 'State Bank of India'
      },
      user: { id: 'user-1', orgId: 'org-a', roles: ['Org_Admin'], permissions: [], isSuperAdmin: false }
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    vi.spyOn(BankService, 'upsertBankDetails').mockResolvedValue(mockBank);

    await BankController.createOrUpsert(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(mockBank);
  });

  it('delete removes bank details with status 200', async () => {
    const req = {
      params: { id: 'user-1' },
      body: {},
      user: { id: 'admin-1', orgId: 'org-a', roles: ['Org_Admin'], permissions: [], isSuperAdmin: false }
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    vi.spyOn(BankService, 'deleteBankDetails').mockResolvedValue();

    await BankController.delete(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
