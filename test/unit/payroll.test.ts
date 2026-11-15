import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const prismaMock = vi.hoisted(() => ({
  payrollRun: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  payslipRecord: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn()
  },
  payslipLineItem: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn()
  },
  payrollAuditLog: {
    create: vi.fn()
  },
  disbursementBatch: {
    create: vi.fn()
  },
  organizationSettings: {
    findFirst: vi.fn()
  },
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn()
  },
  attendanceRecord: {
    count: vi.fn()
  },
  leaveRequest: {
    findMany: vi.fn()
  },
  salaryParameter: {
    findUnique: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn()
  },
  salaryRecord: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { calculateEmployeePayroll, getWorkingDaysInMonth } from '../../src/modules/payroll/payroll-calculator.js';
import { PayrollStateMachine } from '../../src/modules/payroll/payroll-state-machine.js';
import { PayrollService } from '../../src/modules/payroll/payroll.service.js';
import { PayrollController } from '../../src/modules/payroll/payroll.controller.js';
import { PayrollCompatController } from '../../src/modules/payroll/payroll-compat.controller.js';

describe('Payroll Engine Architecture', () => {
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

  describe('1. Pure Precision Calculator & Working Days', () => {
    it('calculates working days in a month excluding weekends', () => {
      // November 2026 has 30 days, starts on Sunday
      const workingDays = getWorkingDaysInMonth(2026, 11, [0, 6]);
      expect(workingDays).toBe(21);
    });

    it('computes exact salary without floating point drift', () => {
      const calc = calculateEmployeePayroll(
        {
          userId: 'emp-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          monthlySalary: 50000,
          salaryParameter: {
            hraPercentage: 40,
            daPercentage: 10,
            taPercentage: 10,
            pfPercentage: 12,
            taxPercentage: 10,
            insuranceFixed: 1000,
            additionalAllowances: {},
            additionalDeductions: {}
          },
          attendanceCount: 20,
          approvedLeaveDays: 1
        },
        21
      );

      // Basic: 50000, HRA (40%): 20000, DA (10%): 5000, TA (10%): 5000 -> Gross: 80000
      expect(calc.grossEarnings).toBe(80000);
      // PF (12%): 6000, Tax (10%): 5000, Insurance: 1000, LOP (0 days): 0 -> Total Deductions: 12000
      expect(calc.totalDeductions).toBe(12000);
      // Net Pay: 80000 - 12000 = 68000
      expect(calc.netPay).toBe(68000);
      expect(calc.lopDays).toBe(0);
      expect(calc.hasAnomaly).toBe(true); // missing bank details
    });

    it('calculates loss of pay (LOP) correctly for unexcused absences', () => {
      const calc = calculateEmployeePayroll(
        {
          userId: 'emp-2',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          monthlySalary: 42000,
          salaryParameter: {
            hraPercentage: 40,
            daPercentage: 10,
            taPercentage: 10,
            pfPercentage: 12,
            taxPercentage: 10,
            insuranceFixed: 1000,
            additionalAllowances: {},
            additionalDeductions: {}
          },
          attendanceCount: 16,
          approvedLeaveDays: 2
        },
        21
      );

      // 21 working days - (16 present + 2 leave) = 3 LOP days
      expect(calc.lopDays).toBe(3);
      // Basic / 21 * 3 = 42000 / 21 * 3 = 6000 LOP deduction
      const lopItem = calc.lineItems.find((i) => i.componentCode === 'LOP_DEDUCTION');
      expect(lopItem?.finalAmount).toBe(6000);
    });
  });

  describe('2. State Machine & Maker-Checker Segregation of Duties', () => {
    it('permits valid state transitions', () => {
      expect(() => { PayrollStateMachine.assertTransition('DRAFT', 'COMPUTING'); }).not.toThrow();
      expect(() => { PayrollStateMachine.assertTransition('COMPUTING', 'PENDING_REVIEW'); }).not.toThrow();
      expect(() => { PayrollStateMachine.assertTransition('PENDING_REVIEW', 'PENDING_APPROVAL'); }).not.toThrow();
      expect(() => { PayrollStateMachine.assertTransition('PENDING_APPROVAL', 'APPROVED'); }).not.toThrow();
      expect(() => { PayrollStateMachine.assertTransition('APPROVED', 'DISBURSED'); }).not.toThrow();
    });

    it('rejects invalid state transitions', () => {
      expect(() => { PayrollStateMachine.assertTransition('DRAFT', 'APPROVED'); }).toThrow(
        /Invalid payroll state transition/
      );
      expect(() => { PayrollStateMachine.assertTransition('DRAFT', 'DISBURSED'); }).toThrow(
        /Invalid payroll state transition/
      );
    });

    it('enforces terminal immutability once DISBURSED', () => {
      expect(() => { PayrollStateMachine.assertTransition('DISBURSED', 'DRAFT'); }).toThrow(
        /Payroll run is disbursed and immutable/
      );
      expect(() => { PayrollStateMachine.assertNotImmutable('DISBURSED'); }).toThrow(
        /Payroll run is disbursed and immutable/
      );
    });

    it('strictly enforces Maker-Checker separation of duties', () => {
      // Maker cannot approve own run
      expect(() => { PayrollStateMachine.assertMakerChecker('maker-id-1', 'maker-id-1'); }).toThrow(
        /Segregation of Duties violation/
      );
      // Independent checker can approve
      expect(() => { PayrollStateMachine.assertMakerChecker('maker-id-1', 'checker-id-2'); }).not.toThrow();
    });
  });

  describe('3. Pay Run Lifecycle Domain Operations', () => {
    it('creates draft run and logs audit record', async () => {
      prismaMock.payrollRun.findUnique.mockResolvedValue(null);
      prismaMock.payrollRun.create.mockResolvedValue({
        id: 'run-1',
        companyId: 'org-1',
        year: 2026,
        month: 11,
        status: 'DRAFT',
        makerId: 'maker-1'
      });

      const run = await PayrollService.createDraftRun('org-1', 2026, 11, 'maker-1', 'November run');

      expect(run.id).toBe('run-1');
      expect(prismaMock.payrollAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            runId: 'run-1',
            action: 'CREATE_RUN',
            newState: 'DRAFT'
          })
        })
      );
    });

    it('approves run when checker is different from maker', async () => {
      prismaMock.payrollRun.findUnique.mockResolvedValue({
        id: 'run-1',
        makerId: 'maker-1',
        status: 'PENDING_APPROVAL'
      });
      prismaMock.payrollRun.update.mockResolvedValue({
        id: 'run-1',
        status: 'APPROVED',
        checkerId: 'checker-2'
      });

      const approved = await PayrollService.approveRun('run-1', 'checker-2');
      expect(approved.status).toBe('APPROVED');
      expect(prismaMock.payrollAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'APPROVE_RUN',
            newState: 'APPROVED'
          })
        })
      );
    });

    it('blocks self-approval with MAKER_CHECKER_VIOLATION', async () => {
      prismaMock.payrollRun.findUnique.mockResolvedValue({
        id: 'run-1',
        makerId: 'maker-1',
        status: 'PENDING_APPROVAL'
      });

      await expect(PayrollService.approveRun('run-1', 'maker-1')).rejects.toThrow(
        /Segregation of Duties violation/
      );
    });

    it('disburses run, creates batch with cryptographic checksum and locks run', async () => {
      prismaMock.payrollRun.findUnique.mockResolvedValue({
        id: 'run-1',
        status: 'APPROVED',
        payslips: [
          { id: 'p-1', netPay: 60000 },
          { id: 'p-2', netPay: 40000 }
        ]
      });
      prismaMock.disbursementBatch.create.mockResolvedValue({ id: 'batch-1' });
      prismaMock.payrollRun.update.mockResolvedValue({ id: 'run-1', status: 'DISBURSED' });

      const disbursed = await PayrollService.disburseRun('run-1', 'checker-2', 'CHECKER', 'UTR-12345');
      expect(disbursed.status).toBe('DISBURSED');
      expect(prismaMock.disbursementBatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            runId: 'run-1',
            totalAmount: 100000,
            utr: 'UTR-12345'
          })
        })
      );
    });
  });

  describe('4. Controllers & Compatibility Adapter', () => {
    it('creates draft run via API controller', async () => {
      prismaMock.payrollRun.findUnique.mockResolvedValue(null);
      prismaMock.payrollRun.create.mockResolvedValue({
        id: 'run-1',
        companyId: 'org-1',
        year: 2026,
        month: 11,
        status: 'DRAFT'
      });

      const req = {
        user: { id: 'maker-1', orgId: 'org-1' },
        body: { year: 2026, month: 11 }
      } as unknown as Request;

      const res = mockRes();
      await PayrollController.createDraftRun(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 'run-1' })
        })
      );
    });

    it('serves legacy salary existence check', async () => {
      prismaMock.payslipRecord.findFirst.mockResolvedValue({
        id: 'payslip-1',
        createdAt: new Date(),
        run: { status: 'DISBURSED' }
      });

      const req = {
        params: { userId: 'user-1', month: '11', year: '2026' },
        user: { id: 'user-1', orgId: 'org-1' }
      } as unknown as Request;

      const res = mockRes();
      await PayrollCompatController.checkSalaryExistence(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: 'payslip-1',
            exists: true,
            status: 'DISBURSED'
          })
        })
      );
    });

    it('returns empty array when no payslips exist and userId is "undefined"', async () => {
      prismaMock.payslipRecord.findMany.mockResolvedValue([]);
      prismaMock.salaryRecord.findMany.mockResolvedValue([]);

      const req = {
        params: { userId: 'undefined', month: '11', year: '2026' },
        user: { id: 'user-1', orgId: 'org-1' }
      } as unknown as Request;

      const res = mockRes();
      await PayrollCompatController.getPayslipByParams(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 0,
        data: []
      });
    });

    it('returns formatted payslips when payslips exist', async () => {
      prismaMock.payslipRecord.findMany.mockResolvedValue([
        {
          id: 'payslip-1',
          employeeId: 'user-1',
          grossEarnings: 50000,
          netPay: 45000,
          totalDeductions: 5000,
          createdAt: new Date('2026-11-15T00:00:00.000Z'),
          employee: {
            id: 'user-1',
            firstName: 'Jane',
            lastName: 'Doe',
            employeeId: 'EMP001',
            department: { name: 'Engineering' },
            bankDetails: {
              accountNumber: '1234567890',
              bankName: 'HDFC',
              ifscCode: 'HDFC0001'
            }
          },
          run: {
            month: 11,
            year: 2026,
            status: 'DISBURSED',
            disbursedAt: new Date('2026-11-15T12:00:00.000Z')
          },
          lineItems: [
            { componentCode: 'BASIC', category: 'EARNING', finalAmount: 30000 },
            { componentCode: 'HRA', category: 'EARNING', finalAmount: 20000 },
            { componentCode: 'TDS', category: 'DEDUCTION', finalAmount: 5000 }
          ]
        }
      ]);

      const req = {
        params: { userId: 'undefined', month: '11', year: '2026' },
        user: { id: 'user-1', orgId: 'org-1' }
      } as unknown as Request;

      const res = mockRes();
      await PayrollCompatController.getPayslipByParams(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          count: 1,
          data: expect.arrayContaining([
            expect.objectContaining({
              id: 'payslip-1',
              userId: 'user-1',
              basicSalary: 30000,
              netSalary: 45000,
              employee: expect.objectContaining({
                firstName: 'Jane',
                department: 'Engineering'
              })
            })
          ])
        })
      );
    });

    it('generates salary and returns formatted payslip for legacy frontend', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        orgId: 'org-1',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        monthlySalary: 60000,
        department: { name: 'Engineering' },
        salaryParameter: {
          hraPercentage: 40,
          daPercentage: 10,
          taPercentage: 10,
          pfPercentage: 12,
          tdsPercentage: 10
        },
        bankDetails: {
          accountNumber: '1234567890',
          bankName: 'HDFC',
          ifscCode: 'HDFC0001'
        }
      });
      prismaMock.attendanceRecord.count.mockResolvedValue(21);
      prismaMock.leaveRequest.findMany.mockResolvedValue([]);
      prismaMock.payrollRun.findUnique.mockResolvedValue(null);
      prismaMock.payrollRun.create.mockResolvedValue({
        id: 'run-gen-1',
        companyId: 'org-1',
        year: 2026,
        month: 11,
        status: 'PENDING_REVIEW'
      });
      prismaMock.payslipRecord.findUnique.mockResolvedValue(null);
      prismaMock.payslipRecord.create.mockResolvedValue({
        id: 'payslip-gen-1',
        createdAt: new Date('2026-11-15T00:00:00.000Z')
      });
      prismaMock.salaryRecord.upsert.mockResolvedValue({ id: 'sal-1' });

      const req = {
        params: { userId: 'undefined', month: '11', year: '2026' },
        user: { id: 'user-1', orgId: 'org-1' }
      } as unknown as Request;

      const res = mockRes();
      await PayrollCompatController.generateSalary(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Salary generated successfully',
          data: expect.objectContaining({
            id: 'payslip-gen-1',
            userId: 'user-1',
            month: 11,
            year: 2026,
            basicSalary: 60000
          })
        })
      );
    });
  });
});
