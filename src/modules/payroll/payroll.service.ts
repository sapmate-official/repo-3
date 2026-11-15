import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import type { Prisma } from '@prisma/client';
import { calculateEmployeePayroll, fromPaise, getWorkingDaysInMonth, toPaise } from './payroll-calculator.js';
import { PayrollStateMachine } from './payroll-state-machine.js';
import type { EmployeeSalaryInput, PayRunSummary } from './payroll.types.js';

export class PayrollService {
  // 1. Create a Draft Pay Run
  static async createDraftRun(
    companyId: string,
    year: number,
    month: number,
    makerId: string,
    notes?: string
  ) {
    const existing = await prisma.payrollRun.findUnique({
      where: { companyId_year_month: { companyId, year, month } }
    });

    if (existing) {
      throw new AppError(
        `A payroll run already exists for ${month}/${year} in this organization`,
        400,
        'DUPLICATE_PAYROLL_RUN'
      );
    }

    const run = await prisma.payrollRun.create({
      data: {
        companyId,
        year,
        month,
        status: 'DRAFT',
        makerId,
        notes
      }
    });

    await prisma.payrollAuditLog.create({
      data: {
        runId: run.id,
        actorId: makerId,
        actorRole: 'MAKER',
        action: 'CREATE_RUN',
        newState: 'DRAFT',
        reason: notes ?? 'Draft pay run initialized'
      }
    });

    return run;
  }

  // 2. Compute Pay Run (Chunked batch execution & snapshotting)
  static async computePayRun(runId: string, actorId: string, actorRole = 'MAKER') {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId }
    });

    if (!run) {
      throw new AppError('Payroll run not found', 404, 'NOT_FOUND');
    }

    PayrollStateMachine.assertTransition(run.status, 'COMPUTING');

    await prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'COMPUTING' }
    });

    try {
      const companyId = run.companyId;
      const year = run.year;
      const month = run.month;

      // Determine date ranges for the target month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);

      // Fetch company working days setting if any
      const settingsRecord = await prisma.organizationSettings.findFirst({
        where: { orgId: companyId }
      });
      const settings = (settingsRecord?.settings as { weekoff?: number[] }) ?? {};
      const weekoffDays = Array.isArray(settings.weekoff) ? settings.weekoff : [0, 6];
      const workingDays = getWorkingDaysInMonth(year, month, weekoffDays);

      // Fetch active employees in company
      const employees = await prisma.user.findMany({
        where: { orgId: companyId, status: 'active' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          monthlySalary: true,
          salaryParameter: true,
          bankDetails: {
            select: {
              accountNumber: true,
              ifscCode: true,
              bankName: true
            }
          }
        }
      });

      // Clear any prior draft computations for this run
      await prisma.payslipRecord.deleteMany({
        where: { runId }
      });

      let totalGrossPaise = 0;
      let totalDeductionsPaise = 0;
      let totalNetPaise = 0;

      for (const emp of employees) {
        // Query attendance records for user in this month
        const attendanceCount = await prisma.attendanceRecord.count({
          where: {
            userId: emp.id,
            date: { gte: startDate, lt: endDate },
            status: { in: ['PRESENT', 'HALF_DAY'] }
          }
        });

        // Query approved leaves
        const approvedLeaves = await prisma.leaveRequest.findMany({
          where: {
            userId: emp.id,
            status: 'APPROVED',
            startDate: { lt: endDate },
            endDate: { gte: startDate }
          }
        });

        const approvedLeaveDays = approvedLeaves.reduce((acc, l) => {
          const s = Math.max(l.startDate.getTime(), startDate.getTime());
          const e = Math.min(l.endDate.getTime(), endDate.getTime());
          const days = Math.max(0, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
          return acc + days;
        }, 0);

        const input: EmployeeSalaryInput = {
          userId: emp.id,
          firstName: emp.firstName ?? '',
          lastName: emp.lastName ?? '',
          email: emp.email,
          monthlySalary: emp.monthlySalary ?? 0,
          bankDetails: emp.bankDetails,
          salaryParameter: emp.salaryParameter,
          attendanceCount,
          approvedLeaveDays
        };

        const calc = calculateEmployeePayroll(input, workingDays);

        totalGrossPaise += toPaise(calc.grossEarnings);
        totalDeductionsPaise += toPaise(calc.totalDeductions);
        totalNetPaise += toPaise(calc.netPay);

        // Persist PayslipRecord with line items
        await prisma.payslipRecord.create({
          data: {
            runId,
            employeeId: emp.id,
            compensationSnapshot: calc.compensationSnapshot as Prisma.InputJsonValue,
            attendanceSnapshot: calc.attendanceSnapshot as Prisma.InputJsonValue,
            workingDays: calc.workingDays,
            presentDays: calc.presentDays,
            lopDays: calc.lopDays,
            grossEarnings: calc.grossEarnings,
            totalDeductions: calc.totalDeductions,
            netPay: calc.netPay,
            hasAnomaly: calc.hasAnomaly,
            anomalyReason: calc.anomalyReason,
            lineItems: {
              create: calc.lineItems.map((item) => ({
                componentCode: item.componentCode,
                category: item.category,
                systemAmount: item.systemAmount,
                finalAmount: item.finalAmount
              }))
            }
          }
        });
      }

      // Transition to PENDING_REVIEW
      const updatedRun = await prisma.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'PENDING_REVIEW',
          totalGross: fromPaise(totalGrossPaise),
          totalDeductions: fromPaise(totalDeductionsPaise),
          totalNetPay: fromPaise(totalNetPaise)
        }
      });

      await prisma.payrollAuditLog.create({
        data: {
          runId,
          actorId,
          actorRole,
          action: 'COMPUTE_RUN',
          previousState: 'COMPUTING',
          newState: 'PENDING_REVIEW',
          reason: `Computed payroll for ${employees.length} employees`
        }
      });

      return updatedRun;
    } catch (error) {
      await prisma.payrollRun.update({
        where: { id: runId },
        data: { status: 'FAILED' }
      });

      await prisma.payrollAuditLog.create({
        data: {
          runId,
          actorId,
          actorRole,
          action: 'COMPUTE_FAILED',
          previousState: 'COMPUTING',
          newState: 'FAILED',
          reason: error instanceof Error ? error.message : 'Unknown calculation error'
        }
      });

      throw error;
    }
  }

  // 3. Apply Line Item Override (during PENDING_REVIEW)
  static async applyOverride(
    lineItemId: string,
    finalAmount: number,
    reason: string,
    actorId: string,
    actorRole = 'MAKER'
  ) {
    const item = await prisma.payslipLineItem.findUnique({
      where: { id: lineItemId },
      include: {
        payslip: {
          include: { run: true }
        }
      }
    });

    if (!item) {
      throw new AppError('Payslip line item not found', 404, 'NOT_FOUND');
    }

    if (item.payslip.run.status !== 'PENDING_REVIEW') {
      throw new AppError(
        'Manual overrides can only be applied while the run is in PENDING_REVIEW',
        400,
        'INVALID_STATE_FOR_OVERRIDE'
      );
    }

    const previousAmount = item.finalAmount;

    const updatedItem = await prisma.payslipLineItem.update({
      where: { id: lineItemId },
      data: {
        finalAmount,
        isOverridden: true,
        overrideReason: reason
      }
    });

    // Recompute payslip totals
    const allItems = await prisma.payslipLineItem.findMany({
      where: { payslipId: item.payslipId }
    });

    const grossEarnings = allItems
      .filter((i) => i.category === 'EARNING')
      .reduce((sum, i) => sum + i.finalAmount, 0);

    const totalDeductions = allItems
      .filter((i) => i.category === 'DEDUCTION')
      .reduce((sum, i) => sum + i.finalAmount, 0);

    const netPay = Math.max(0, grossEarnings - totalDeductions);

    await prisma.payslipRecord.update({
      where: { id: item.payslipId },
      data: { grossEarnings, totalDeductions, netPay }
    });

    // Recompute run totals
    const allPayslips = await prisma.payslipRecord.findMany({
      where: { runId: item.payslip.runId }
    });

    const runGross = allPayslips.reduce((sum, p) => sum + p.grossEarnings, 0);
    const runDeductions = allPayslips.reduce((sum, p) => sum + p.totalDeductions, 0);
    const runNet = allPayslips.reduce((sum, p) => sum + p.netPay, 0);

    await prisma.payrollRun.update({
      where: { id: item.payslip.runId },
      data: {
        totalGross: runGross,
        totalDeductions: runDeductions,
        totalNetPay: runNet
      }
    });

    await prisma.payrollAuditLog.create({
      data: {
        runId: item.payslip.runId,
        payslipId: item.payslipId,
        actorId,
        actorRole,
        action: 'APPLY_OVERRIDE',
        payloadDiff: {
          componentCode: item.componentCode,
          previousAmount,
          finalAmount
        },
        reason
      }
    });

    return updatedItem;
  }

  // 4. Submit for Approval (PENDING_REVIEW -> PENDING_APPROVAL)
  static async submitForApproval(runId: string, actorId: string, actorRole = 'MAKER') {
    const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new AppError('Payroll run not found', 404, 'NOT_FOUND');

    PayrollStateMachine.assertTransition(run.status, 'PENDING_APPROVAL');

    const updated = await prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'PENDING_APPROVAL' }
    });

    await prisma.payrollAuditLog.create({
      data: {
        runId,
        actorId,
        actorRole,
        action: 'SUBMIT_FOR_APPROVAL',
        previousState: 'PENDING_REVIEW',
        newState: 'PENDING_APPROVAL',
        reason: 'Maker submitted run for independent checker review'
      }
    });

    return updated;
  }

  // 5. Approve Run (Enforcing Maker-Checker Segregation of Duties)
  static async approveRun(runId: string, checkerId: string, actorRole = 'CHECKER') {
    const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new AppError('Payroll run not found', 404, 'NOT_FOUND');

    PayrollStateMachine.assertTransition(run.status, 'APPROVED');
    PayrollStateMachine.assertMakerChecker(run.makerId, checkerId);

    const updated = await prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'APPROVED',
        checkerId,
        approvedAt: new Date()
      }
    });

    await prisma.payrollAuditLog.create({
      data: {
        runId,
        actorId: checkerId,
        actorRole,
        action: 'APPROVE_RUN',
        previousState: 'PENDING_APPROVAL',
        newState: 'APPROVED',
        reason: 'Checker approved payroll totals and tax/statutory calculations'
      }
    });

    return updated;
  }

  // 6. Reject Run (PENDING_APPROVAL -> PENDING_REVIEW)
  static async rejectRun(runId: string, actorId: string, reason: string, actorRole = 'CHECKER') {
    const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new AppError('Payroll run not found', 404, 'NOT_FOUND');

    PayrollStateMachine.assertTransition(run.status, 'PENDING_REVIEW');

    const updated = await prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'PENDING_REVIEW' }
    });

    await prisma.payrollAuditLog.create({
      data: {
        runId,
        actorId,
        actorRole,
        action: 'REJECT_RUN',
        previousState: 'PENDING_APPROVAL',
        newState: 'PENDING_REVIEW',
        reason
      }
    });

    return updated;
  }

  // 7. Disburse Run (Terminal & Checksum Gate)
  static async disburseRun(
    runId: string,
    actorId: string,
    actorRole = 'CHECKER',
    utr?: string,
    notes?: string
  ) {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        payslips: true
      }
    });

    if (!run) throw new AppError('Payroll run not found', 404, 'NOT_FOUND');

    PayrollStateMachine.assertTransition(run.status, 'DISBURSED');

    const sumNetPay = run.payslips.reduce((sum, p) => sum + p.netPay, 0);

    // Compute cryptographic checksum of total disbursement
    const checksum = crypto
      .createHash('sha256')
      .update(`${runId}:${sumNetPay.toFixed(2)}:${run.payslips.length}`)
      .digest('hex');

    // Create disbursement batch
    await prisma.disbursementBatch.create({
      data: {
        runId,
        totalAmount: sumNetPay,
        checksum,
        utr,
        status: 'SETTLED',
        disbursedAt: new Date()
      }
    });

    const updated = await prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: 'DISBURSED',
        disbursedAt: new Date(),
        notes: notes ?? run.notes
      }
    });

    await prisma.payrollAuditLog.create({
      data: {
        runId,
        actorId,
        actorRole,
        action: 'DISBURSE_RUN',
        previousState: 'APPROVED',
        newState: 'DISBURSED',
        reason: `Disbursed total of $${sumNetPay.toFixed(2)} (Checksum: ${checksum.slice(0, 8)})`
      }
    });

    return updated;
  }

  // 8. Query Pay Run Details
  static async getRunDetails(runId: string, companyId: string) {
    const run = await prisma.payrollRun.findFirst({
      where: { id: runId, companyId },
      include: {
        maker: { select: { id: true, firstName: true, lastName: true, email: true } },
        checker: { select: { id: true, firstName: true, lastName: true, email: true } },
        payslips: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, email: true } },
            lineItems: true
          }
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50
        },
        disbursementBatch: true
      }
    });

    if (!run) throw new AppError('Payroll run not found', 404, 'NOT_FOUND');

    const summary: PayRunSummary = {
      runId: run.id,
      companyId: run.companyId,
      year: run.year,
      month: run.month,
      status: run.status,
      makerId: run.makerId,
      checkerId: run.checkerId,
      totalGross: run.totalGross,
      totalDeductions: run.totalDeductions,
      totalNetPay: run.totalNetPay,
      totalEmployees: run.payslips.length,
      anomalyCount: run.payslips.filter((p) => p.hasAnomaly).length,
      lockedAt: run.lockedAt,
      approvedAt: run.approvedAt,
      disbursedAt: run.disbursedAt
    };

    return {
      run,
      summary
    };
  }

  // 9. List Pay Runs with Pagination
  static async listRuns(companyId: string, page = 1, limit = 20, status?: string, year?: number) {
    const where: Prisma.PayrollRunWhereInput = { companyId };
    if (status) where.status = status as Prisma.EnumPayrollRunStatusFilter['equals'];
    if (year) where.year = year;

    const skip = (page - 1) * limit;

    const [total, runs] = await Promise.all([
      prisma.payrollRun.count({ where }),
      prisma.payrollRun.findMany({
        where,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        skip,
        take: limit,
        include: {
          maker: { select: { firstName: true, lastName: true, email: true } },
          checker: { select: { firstName: true, lastName: true, email: true } },
          _count: { select: { payslips: true } }
        }
      })
    ]);

    return {
      runs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  // 10. Query Single Payslip by ID
  static async getPayslipById(payslipId: string) {
    const payslip = await prisma.payslipRecord.findUnique({
      where: { id: payslipId },
      include: {
        run: {
          include: {
            organization: { select: { name: true, address: true, logo: true } }
          }
        },
        employee: { select: { id: true, firstName: true, lastName: true, email: true } },
        lineItems: true
      }
    });

    if (!payslip) throw new AppError('Payslip not found', 404, 'NOT_FOUND');
    return payslip;
  }
}
