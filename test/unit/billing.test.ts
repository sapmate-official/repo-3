import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const prismaMock = vi.hoisted(() => ({
  billingRecord: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    update: vi.fn()
  },
  organization: {
    findUnique: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { BillingController } from '../../src/modules/billing/billing.controller.js';

describe('BillingController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.setHeader = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    return res;
  };

  const next: NextFunction = vi.fn();

  it('retrieves billing dashboard matching frontend contract', async () => {
    const mockBills = [
      {
        id: 'bill-1',
        organizationId: 'org-1',
        month: 11,
        year: new Date().getFullYear(),
        totalAmount: 1200,
        status: 'PAID'
      },
      {
        id: 'bill-2',
        organizationId: 'org-1',
        month: 10,
        year: new Date().getFullYear(),
        totalAmount: 600,
        status: 'UNPAID'
      }
    ];

    const mockOrg = {
      name: 'Acme Corp',
      subscriptionPlanId: 'plan-1',
      subscriptionPlan: {
        id: 'plan-1',
        name: 'Enterprise',
        monthlyPrice: 1200,
        annualPrice: 12000,
        maxUsers: 100,
        features: []
      },
      subscriptionStart: new Date('2026-01-01'),
      subscriptionEnd: new Date('2026-12-31'),
      _count: { users: 25 }
    };

    prismaMock.billingRecord.findMany.mockResolvedValue(mockBills);
    prismaMock.organization.findUnique.mockResolvedValue(mockOrg);

    const req = {
      user: { id: 'user-1', orgId: 'org-1' }
    } as unknown as Request;

    const res = mockRes();
    await BillingController.getBillingDashboard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          organization: expect.objectContaining({
            name: 'Acme Corp',
            subscriptionPlan: 'Enterprise'
          }),
          billing: expect.objectContaining({
            totalBilledThisYear: 1800,
            totalUnpaid: 600
          }),
          billStatus: expect.objectContaining({
            paid: 1,
            unpaid: 1
          })
        })
      })
    );
  });

  it('retrieves bill history with pagination and formatted monthName', async () => {
    const mockBills = [
      {
        id: 'bill-1',
        organizationId: 'org-1',
        month: 5,
        year: 2026,
        totalAmount: 1200,
        status: 'PAID'
      }
    ];

    prismaMock.billingRecord.count.mockResolvedValue(1);
    prismaMock.billingRecord.findMany.mockResolvedValue(mockBills);

    const req = {
      user: { id: 'user-1', orgId: 'org-1' },
      query: { page: '1', limit: '10' }
    } as unknown as Request;

    const res = mockRes();
    await BillingController.getBillHistory(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'bill-1',
            monthName: 'May'
          })
        ]),
        pagination: expect.objectContaining({
          total: 1,
          page: 1,
          limit: 10
        })
      })
    );
  });

  it('retrieves bill details by ID', async () => {
    const mockBill = {
      id: 'bill-1',
      organizationId: 'org-1',
      month: 6,
      year: 2026,
      totalAmount: 1500,
      status: 'PAID',
      organization: {
        name: 'Acme Corp',
        logo: null,
        subscriptionPlanId: 'plan-1',
        subscriptionPlan: { name: 'Growth' }
      }
    };

    prismaMock.billingRecord.findFirst.mockResolvedValue(mockBill);

    const req = {
      user: { id: 'user-1', orgId: 'org-1' },
      params: { id: 'bill-1' }
    } as unknown as Request;

    const res = mockRes();
    await BillingController.getBillDetails(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          organizationName: 'Acme Corp',
          subscriptionPlan: 'Growth',
          monthName: 'June'
        })
      })
    );
  });

  it('marks bill as paid successfully', async () => {
    const existingBill = {
      id: 'bill-1',
      organizationId: 'org-1',
      status: 'UNPAID',
      totalAmount: 500
    };

    const updatedBill = {
      ...existingBill,
      status: 'PAID',
      paidDate: new Date(),
      paymentReference: 'UPI-123456'
    };

    prismaMock.billingRecord.findFirst.mockResolvedValue(existingBill);
    prismaMock.billingRecord.update.mockResolvedValue(updatedBill);

    const req = {
      user: { id: 'user-1', orgId: 'org-1' },
      params: { id: 'bill-1' },
      body: { paymentMethod: 'UPI', paymentReference: 'UPI-123456' }
    } as unknown as Request;

    const res = mockRes();
    await BillingController.markBillAsPaid(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Bill marked as paid successfully',
        data: expect.objectContaining({
          status: 'PAID'
        })
      })
    );
  });

  it('downloads invoice as a valid PDF attachment', async () => {
    const mockBill = {
      id: 'bill-12345678',
      organizationId: 'org-1',
      month: 7,
      year: 2026,
      activeUserCount: 15,
      pricePerUser: 20,
      totalAmount: 300,
      status: 'PAID',
      billDate: new Date('2026-07-01'),
      dueDate: new Date('2026-07-15'),
      paidDate: new Date('2026-07-05'),
      paymentReference: 'CC-9988',
      organization: {
        name: 'Acme Corp',
        address: '123 Enterprise Blvd',
        subscriptionPlan: { name: 'Pro' }
      }
    };

    prismaMock.billingRecord.findFirst.mockResolvedValue(mockBill);

    const req = {
      params: { id: 'bill-12345678' }
    } as unknown as Request;

    const res = mockRes();
    await BillingController.downloadBillInvoice(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="invoice-bill-12345678.pdf"'
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const sendCalls = (res.send as ReturnType<typeof vi.fn>).mock.calls;
    const buffer = sendCalls[0]?.[0] as Buffer;
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString('utf-8')).toContain('%PDF-1.4');
  });
});
