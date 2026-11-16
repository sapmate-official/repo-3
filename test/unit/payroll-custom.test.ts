import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const prismaMock = vi.hoisted(() => ({
  payslipRecord: {
    findUnique: vi.fn()
  },
  salaryRecord: {
    findUnique: vi.fn(),
    upsert: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { PayrollCompatController } from '../../src/modules/payroll/payroll-compat.controller.js';

describe('PayrollCompatController - Custom & Download', () => {
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

  describe('customPayslipPreview', () => {
    it('calculates gross, deductions, and net salary correctly', () => {
      const req = {
        body: {
          userId: 'user-123',
          month: 11,
          year: 2026,
          basicSalary: 5000,
          allowances: { hra: 1000, conveyance: 500 },
          deductions: { pf: 600, tax: 400 }
        }
      } as unknown as Request;
      const res = mockRes();

      PayrollCompatController.customPayslipPreview(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          userId: 'user-123',
          month: 11,
          year: 2026,
          basicSalary: 5000,
          totalAllowances: 1500,
          grossEarnings: 6500,
          totalDeductions: 1000,
          netSalary: 5500
        })
      });
    });
  });

  describe('customPayslipGenerate', () => {
    it('upserts salary record with calculated net pay', async () => {
      const savedRecord = {
        id: 'rec-1',
        userId: 'user-123',
        month: 11,
        year: 2026,
        basicSalary: 4000,
        netSalary: 4500
      };
      prismaMock.salaryRecord.upsert.mockResolvedValue(savedRecord);

      const req = {
        body: {
          userId: 'user-123',
          month: 11,
          year: 2026,
          basicSalary: 4000,
          allowances: { bonus: 1000 },
          deductions: { tax: 500 },
          remarks: 'Performance bonus added'
        }
      } as unknown as Request;
      const res = mockRes();

      await PayrollCompatController.customPayslipGenerate(req, res, next);

      expect(prismaMock.salaryRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({
          userId: 'user-123',
          basicSalary: 4000,
          netSalary: 4500,
          remarks: 'Performance bonus added'
        })
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Custom payslip generated successfully',
        data: savedRecord
      });
    });
  });

  describe('downloadPayslip', () => {
    it('streams generated PDF buffer for modern payslip record', async () => {
      prismaMock.payslipRecord.findUnique.mockResolvedValue({
        id: 'ps-1',
        workingDays: 22,
        presentDays: 20,
        lopDays: 2,
        grossEarnings: 5000,
        totalDeductions: 500,
        netPay: 4500,
        employee: {
          id: 'u-1',
          firstName: 'Souma',
          lastName: 'Ghosh',
          email: 'souma@shapenxt.com'
        },
        run: {
          year: 2026,
          month: 11,
          organization: { name: 'ShapeNXT' }
        },
        lineItems: [
          { componentCode: 'BASIC', category: 'EARNING', finalAmount: 4000 },
          { componentCode: 'HRA', category: 'EARNING', finalAmount: 1000 },
          { componentCode: 'PF', category: 'DEDUCTION', finalAmount: 500 }
        ]
      });

      const req = { params: { salaryRecordId: 'ps-1' } } as unknown as Request;
      const res = mockRes();

      await PayrollCompatController.downloadPayslip(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('attachment'));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('falls back to legacy SalaryRecord when modern payslip is not found', async () => {
      prismaMock.payslipRecord.findUnique.mockResolvedValue(null);
      prismaMock.salaryRecord.findUnique.mockResolvedValue({
        id: 'legacy-rec-1',
        userId: 'u-1',
        month: 10,
        year: 2026,
        basicSalary: 3000,
        netSalary: 3500,
        allowances: { bonus: 800 },
        deductions: { insurance: 300 },
        user: {
          id: 'u-1',
          firstName: 'Souma',
          lastName: 'Ghosh',
          email: 'souma@shapenxt.com',
          organization: { name: 'ShapeNXT' }
        }
      });

      const req = { params: { id: 'legacy-rec-1' } } as unknown as Request;
      const res = mockRes();

      await PayrollCompatController.downloadPayslip(req, res, next);

      expect(prismaMock.salaryRecord.findUnique).toHaveBeenCalledWith({
        where: { id: 'legacy-rec-1' },
        include: expect.any(Object)
      });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('throws 404 when neither modern nor legacy record is found', async () => {
      prismaMock.payslipRecord.findUnique.mockResolvedValue(null);
      prismaMock.salaryRecord.findUnique.mockResolvedValue(null);

      const req = { params: { id: 'non-existent' } } as unknown as Request;
      const res = mockRes();

      await PayrollCompatController.downloadPayslip(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Payslip record not found',
        statusCode: 404
      }));
    });
  });
});
