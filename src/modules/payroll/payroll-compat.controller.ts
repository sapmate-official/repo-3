import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import type { Prisma } from '@prisma/client';
import { createPayslipPdfBuffer } from './payslip-pdf.js';
import { calculateEmployeePayroll, getWorkingDaysInMonth } from './payroll-calculator.js';

const strParam = (val: unknown): string | undefined => {
  if (Array.isArray(val)) {
    const first: unknown = val[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
};

const parseNumber = (val: unknown, fallback = 0): number => {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : fallback;
  }
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

interface FormattedEmployee {
  firstName?: string;
  lastName?: string;
  employeeId?: string;
  department?: string;
  designation?: string;
  bankDetails?: {
    accountNumber: string;
    bankName: string;
    ifscCode: string;
  };
}

interface CustomPayslipPayload {
  userId?: string;
  month?: number | string;
  year?: number | string;
  basicSalary?: number | string;
  allowances?: Record<string, number | string>;
  deductions?: Record<string, number | string>;
  remarks?: string;
}

export class PayrollCompatController {
  // GET & PUT /api/v2/payroll/parameters/:userId
  static async getParameters(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = strParam(req.params.userId) ?? req.user?.id;
      if (!userId) throw new AppError('User ID required', 400, 'BAD_REQUEST');

      let params = await prisma.salaryParameter.findUnique({ where: { userId } });
      params ??= await prisma.salaryParameter.create({
        data: {
          userId,
          hraPercentage: 40,
          daPercentage: 10,
          taPercentage: 10,
          pfPercentage: 12,
          taxPercentage: 10,
          insuranceFixed: 1000
        }
      });

      res.status(200).json({ success: true, data: params });
    } catch (error) {
      next(error);
    }
  }

  static async updateParameters(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = strParam(req.params.userId);
      if (!userId) throw new AppError('User ID required', 400, 'BAD_REQUEST');

      const body = req.body as Record<string, unknown>;
      const hraPercentage = typeof body.hraPercentage === 'number' ? body.hraPercentage : undefined;
      const daPercentage = typeof body.daPercentage === 'number' ? body.daPercentage : undefined;
      const taPercentage = typeof body.taPercentage === 'number' ? body.taPercentage : undefined;
      const pfPercentage = typeof body.pfPercentage === 'number' ? body.pfPercentage : undefined;
      const taxPercentage = typeof body.taxPercentage === 'number' ? body.taxPercentage : undefined;
      const insuranceFixed = typeof body.insuranceFixed === 'number' ? body.insuranceFixed : undefined;
      const additionalAllowances =
        typeof body.additionalAllowances === 'object' && body.additionalAllowances !== null
          ? (body.additionalAllowances as Prisma.InputJsonValue)
          : undefined;
      const additionalDeductions =
        typeof body.additionalDeductions === 'object' && body.additionalDeductions !== null
          ? (body.additionalDeductions as Prisma.InputJsonValue)
          : undefined;

      const updateData: Prisma.SalaryParameterUpdateInput = {};
      if (hraPercentage !== undefined) updateData.hraPercentage = hraPercentage;
      if (daPercentage !== undefined) updateData.daPercentage = daPercentage;
      if (taPercentage !== undefined) updateData.taPercentage = taPercentage;
      if (pfPercentage !== undefined) updateData.pfPercentage = pfPercentage;
      if (taxPercentage !== undefined) updateData.taxPercentage = taxPercentage;
      if (insuranceFixed !== undefined) updateData.insuranceFixed = insuranceFixed;
      if (additionalAllowances !== undefined) updateData.additionalAllowances = additionalAllowances;
      if (additionalDeductions !== undefined) updateData.additionalDeductions = additionalDeductions;

      const updated = await prisma.salaryParameter.upsert({
        where: { userId },
        create: {
          userId,
          hraPercentage: hraPercentage ?? 40,
          daPercentage: daPercentage ?? 10,
          taPercentage: taPercentage ?? 10,
          pfPercentage: pfPercentage ?? 12,
          taxPercentage: taxPercentage ?? 10,
          insuranceFixed: insuranceFixed ?? 1000,
          additionalAllowances,
          additionalDeductions
        },
        update: updateData
      });

      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/salary/user/:userId/monthly/:month/year/:year
  static async checkSalaryExistence(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = strParam(req.params.userId) ?? req.user?.id;
      const month = parseInt(strParam(req.params.month) ?? '0', 10);
      const year = parseInt(strParam(req.params.year) ?? '0', 10);

      if (!userId || !month || !year) {
        throw new AppError('User ID, month, and year are required', 400, 'BAD_REQUEST');
      }

      // Check PayslipRecord first, fallback to legacy SalaryRecord
      const payslip = await prisma.payslipRecord.findFirst({
        where: {
          employeeId: userId,
          run: { month, year }
        },
        include: { run: true }
      });

      if (payslip) {
        res.status(200).json({
          success: true,
          data: {
            id: payslip.id,
            userId,
            month,
            year,
            exists: true,
            status: payslip.run.status,
            generatedAt: payslip.createdAt
          }
        });
        return;
      }

      const legacy = await prisma.salaryRecord.findUnique({
        where: { userId_month_year: { userId, month, year } }
      });

      res.status(200).json({
        success: true,
        data: {
          id: legacy?.id ?? '',
          userId,
          month,
          year,
          exists: Boolean(legacy),
          status: legacy?.status,
          generatedAt: legacy?.createdAt
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v3/payroll/payslip/:month/:year/:userId? & /api/v3/payroll/payslip/:month/:year
  static async getPayslipByParams(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawUserId = strParam(req.params.userId);
      const targetUserId = rawUserId && rawUserId !== 'undefined' ? rawUserId : req.user?.id;
      const month = parseInt(strParam(req.params.month) ?? '0', 10);
      const year = parseInt(strParam(req.params.year) ?? '0', 10);

      if (!targetUserId || !month || !year) {
        throw new AppError('Valid month and year are required', 400, 'BAD_REQUEST');
      }

      // Query modern PayslipRecord first (with graceful fallback to legacy if unmigrated)
      type DetailedPayslip = Prisma.PayslipRecordGetPayload<{
        include: {
          employee: {
            select: {
              id: true;
              firstName: true;
              lastName: true;
              employeeId: true;
              department: { select: { name: true } };
              bankDetails: true;
            };
          };
          run: true;
          lineItems: true;
        };
      }>;

      let payslips: DetailedPayslip[] = [];
      try {
        payslips = await prisma.payslipRecord.findMany({
          where: { employeeId: targetUserId, run: { month, year } },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeId: true,
                department: { select: { name: true } },
                bankDetails: true
              }
            },
            run: true,
            lineItems: true
          }
        });
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code !== 'P2021') {
          throw err;
        }
      }

      if (payslips.length > 0) {
        const formatted = payslips.map((p) => {
          const allowances: Record<string, number> = {};
          const deductions: Record<string, number> = {};
          let basicSalary = 0;

          for (const item of p.lineItems) {
            if (item.componentCode === 'BASIC') {
              basicSalary = item.finalAmount;
            } else if (item.category === 'EARNING') {
              allowances[item.componentCode.toLowerCase()] = item.finalAmount;
            } else if (item.category === 'DEDUCTION') {
              deductions[item.componentCode.toLowerCase()] = item.finalAmount;
            }
          }

          const maskedAccount = p.employee.bankDetails?.accountNumber
            ? `XXXX${p.employee.bankDetails.accountNumber.slice(-4)}`
            : undefined;

          const employeeData: FormattedEmployee = {
            firstName: p.employee.firstName ?? undefined,
            lastName: p.employee.lastName ?? undefined,
            employeeId: p.employee.employeeId ?? undefined,
            department: p.employee.department?.name,
            designation: p.employee.department?.name ?? 'Not Assigned',
            bankDetails: p.employee.bankDetails
              ? {
                  accountNumber: maskedAccount ?? '',
                  bankName: p.employee.bankDetails.bankName,
                  ifscCode: p.employee.bankDetails.ifscCode
                }
              : undefined
          };

          return {
            id: p.id,
            userId: p.employeeId,
            month: p.run.month,
            year: p.run.year,
            basicSalary: basicSalary > 0 ? basicSalary : p.grossEarnings,
            netSalary: p.netPay,
            status: p.run.status,
            processedAt: p.run.disbursedAt?.toISOString() ?? null,
            createdAt: p.createdAt.toISOString(),
            allowances,
            deductions,
            employee: employeeData
          };
        });

        res.status(200).json({
          success: true,
          count: formatted.length,
          data: formatted
        });
        return;
      }

      // Fallback to legacy SalaryRecord
      const legacyRecords = await prisma.salaryRecord.findMany({
        where: { userId: targetUserId, month, year },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
              department: { select: { name: true } },
              bankDetails: true
            }
          }
        }
      });

      if (legacyRecords.length > 0) {
        const formatted = legacyRecords.map((r) => {
          const maskedAccount = r.user.bankDetails?.accountNumber
            ? `XXXX${r.user.bankDetails.accountNumber.slice(-4)}`
            : undefined;

          const employeeData: FormattedEmployee = {
            firstName: r.user.firstName ?? undefined,
            lastName: r.user.lastName ?? undefined,
            employeeId: r.user.employeeId ?? undefined,
            department: r.user.department?.name,
            designation: r.user.department?.name ?? 'Not Assigned',
            bankDetails: r.user.bankDetails
              ? {
                  accountNumber: maskedAccount ?? '',
                  bankName: r.user.bankDetails.bankName,
                  ifscCode: r.user.bankDetails.ifscCode
                }
              : undefined
          };

          return {
            id: r.id,
            userId: r.userId,
            month: r.month,
            year: r.year,
            basicSalary: r.basicSalary,
            netSalary: r.netSalary,
            status: r.status,
            processedAt: r.processedAt?.toISOString() ?? null,
            createdAt: r.createdAt.toISOString(),
            allowances: (r.allowances as Record<string, number>) ?? {},
            deductions: (r.deductions as Record<string, number>) ?? {},
            paymentMode: r.paymentMode ?? undefined,
            paymentRef: r.paymentRef ?? undefined,
            remarks: r.remarks ?? undefined,
            incentive: r.incentive ?? undefined,
            bonus: r.bonus ?? undefined,
            employee: employeeData
          };
        });

        res.status(200).json({
          success: true,
          count: formatted.length,
          data: formatted
        });
        return;
      }

      // No payslips exist for this period -> Return 200 with empty array (do NOT throw 404!)
      res.status(200).json({
        success: true,
        count: 0,
        data: []
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v3/payroll/statistics/:salaryRecordId
  static async getSalaryStatistics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const recordId = strParam(req.params.salaryRecordId);
      if (!recordId) throw new AppError('Salary record ID required', 400, 'BAD_REQUEST');

      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];

      // Check modern PayslipRecord first
      type StatPayslip = Prisma.PayslipRecordGetPayload<{
        include: {
          employee: {
            select: {
              id: true;
              firstName: true;
              lastName: true;
              email: true;
              employeeId: true;
              department: { select: { name: true } };
            };
          };
          run: true;
          lineItems: true;
        };
      }>;

      let p: StatPayslip | null = null;
      try {
        p = await prisma.payslipRecord.findUnique({
          where: { id: recordId },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                employeeId: true,
                department: { select: { name: true } }
              }
            },
            run: true,
            lineItems: true
          }
        });
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code !== 'P2021') throw err;
      }

      if (p) {
        const monthName = monthNames[p.run.month - 1] ?? 'Unknown';
        const allowanceDetails: Record<string, number> = {};
        const deductionDetails: Record<string, number> = {};
        let basicSalary = 0;
        let taxAmount = 0;

        for (const item of p.lineItems) {
          if (item.componentCode === 'BASIC') {
            basicSalary = item.finalAmount;
          } else if (item.componentCode === 'TDS') {
            taxAmount = item.finalAmount;
            deductionDetails[item.componentCode] = item.finalAmount;
          } else if (item.category === 'EARNING') {
            allowanceDetails[item.componentCode] = item.finalAmount;
          } else if (item.category === 'DEDUCTION') {
            deductionDetails[item.componentCode] = item.finalAmount;
          }
        }

        const fullName = `${p.employee.firstName ?? ''} ${p.employee.lastName ?? ''}`.trim() || p.employee.email;

        res.status(200).json({
          success: true,
          data: {
            basicInfo: {
              salaryRecordId: p.id,
              month: p.run.month,
              monthName,
              year: p.run.year,
              employee: {
                id: p.employee.id,
                name: fullName,
                employeeId: p.employee.employeeId ?? '',
                department: p.employee.department?.name ?? 'Unassigned'
              },
              status: p.run.status,
              processedAt: p.run.disbursedAt?.toISOString() ?? null,
              paymentInfo: {
                mode: null,
                reference: null,
                remarks: null
              }
            },
            salaryBreakdown: {
              basicSalary: basicSalary > 0 ? basicSalary : p.grossEarnings,
              totalAllowances: p.grossEarnings - basicSalary,
              allowanceDetails,
              totalDeductions: p.totalDeductions,
              deductionDetails,
              netSalary: p.netPay,
              taxAmount,
              additionalPayments: { incentive: 0, bonus: 0 }
            },
            attendanceAnalysis: {
              totalDaysInMonth: new Date(p.run.year, p.run.month, 0).getDate(),
              workingDays: p.workingDays,
              presentDays: p.presentDays,
              halfDays: 0,
              absentDays: p.lopDays,
              paidLeaveDays: 0,
              unpaidLeaveDays: p.lopDays,
              attendancePercentage: p.workingDays > 0 ? Number(((p.presentDays / p.workingDays) * 100).toFixed(2)) : 0
            },
            comparisons: {
              earningsRatio: (basicSalary > 0 ? basicSalary : p.grossEarnings) > 0
                ? Number(((p.netPay / (basicSalary > 0 ? basicSalary : p.grossEarnings)) * 100).toFixed(2))
                : 100,
              previousMonth: null,
              yearToDateEarnings: p.netPay
            },
            visualData: {
              earningsVsDeductions: {
                earnings: p.grossEarnings,
                deductions: p.totalDeductions
              },
              salaryComponents: {
                basic: basicSalary > 0 ? basicSalary : p.grossEarnings,
                allowances: p.grossEarnings - basicSalary,
                deductions: p.totalDeductions,
                net: p.netPay
              }
            }
          }
        });
        return;
      }

      // Fallback to legacy SalaryRecord
      const legacy = await prisma.salaryRecord.findUnique({
        where: { id: recordId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              employeeId: true,
              department: { select: { name: true } }
            }
          }
        }
      });

      if (!legacy) throw new AppError('Salary record not found', 404, 'NOT_FOUND');

      const monthName = monthNames[legacy.month - 1] ?? 'Unknown';
      const fullName = `${legacy.user.firstName ?? ''} ${legacy.user.lastName ?? ''}`.trim() || legacy.user.email;

      res.status(200).json({
        success: true,
        data: {
          basicInfo: {
            salaryRecordId: legacy.id,
            month: legacy.month,
            monthName,
            year: legacy.year,
            employee: {
              id: legacy.user.id,
              name: fullName,
              employeeId: legacy.user.employeeId ?? '',
              department: legacy.user.department?.name ?? 'Unassigned'
            },
            status: legacy.status,
            processedAt: legacy.processedAt?.toISOString() ?? null,
            paymentInfo: {
              mode: legacy.paymentMode,
              reference: legacy.paymentRef,
              remarks: legacy.remarks
            }
          },
          salaryBreakdown: {
            basicSalary: legacy.basicSalary,
            totalAllowances: 0,
            allowanceDetails: (legacy.allowances as Record<string, number>) ?? {},
            totalDeductions: 0,
            deductionDetails: (legacy.deductions as Record<string, number>) ?? {},
            netSalary: legacy.netSalary,
            taxAmount: legacy.tax,
            additionalPayments: {
              incentive: legacy.incentive ?? 0,
              bonus: legacy.bonus ?? 0
            }
          },
          attendanceAnalysis: {
            totalDaysInMonth: new Date(legacy.year, legacy.month, 0).getDate(),
            workingDays: 22,
            presentDays: 22,
            halfDays: 0,
            absentDays: 0,
            paidLeaveDays: 0,
            unpaidLeaveDays: 0,
            attendancePercentage: 100
          },
          comparisons: {
            earningsRatio: legacy.basicSalary > 0 ? Number(((legacy.netSalary / legacy.basicSalary) * 100).toFixed(2)) : 100,
            previousMonth: null,
            yearToDateEarnings: legacy.netSalary
          },
          visualData: {
            earningsVsDeductions: {
              earnings: legacy.basicSalary,
              deductions: 0
            },
            salaryComponents: {
              basic: legacy.basicSalary,
              allowances: 0,
              deductions: 0,
              net: legacy.netSalary
            }
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v3/payroll/salary-generate/:month/:year/:userId? & /api/v3/payroll/salary-generate/:month/:year
  static async generateSalary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawUserId = strParam(req.params.userId);
      const targetUserId = rawUserId && rawUserId !== 'undefined' ? rawUserId : req.user?.id;
      const month = parseInt(strParam(req.params.month) ?? '0', 10);
      const year = parseInt(strParam(req.params.year) ?? '0', 10);

      if (!targetUserId || !month || !year) {
        throw new AppError('Valid user, month, and year are required', 400, 'BAD_REQUEST');
      }

      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: {
          salaryParameter: true,
          bankDetails: true,
          department: { select: { name: true } }
        }
      });

      if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);

      const attendanceCount = await prisma.attendanceRecord.count({
        where: {
          userId: targetUserId,
          date: { gte: startDate, lt: endDate },
          status: { in: ['PRESENT', 'HALF_DAY'] }
        }
      });

      const approvedLeaves = await prisma.leaveRequest.findMany({
        where: {
          userId: targetUserId,
          status: 'APPROVED',
          startDate: { lt: endDate },
          endDate: { gte: startDate }
        }
      });

      const approvedLeaveDays = approvedLeaves.reduce((acc, l) => {
        const s = Math.max(l.startDate.getTime(), startDate.getTime());
        const e = Math.min(l.endDate.getTime(), endDate.getTime());
        return acc + Math.max(0, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
      }, 0);

      const workingDays = getWorkingDaysInMonth(year, month);

      const calc = calculateEmployeePayroll(
        {
          userId: user.id,
          firstName: user.firstName ?? '',
          lastName: user.lastName ?? '',
          email: user.email,
          monthlySalary: user.monthlySalary ?? 0,
          bankDetails: user.bankDetails,
          salaryParameter: user.salaryParameter,
          attendanceCount,
          approvedLeaveDays
        },
        workingDays
      );

      // Find or create pay run for the organization
      let run = await prisma.payrollRun.findUnique({
        where: { companyId_year_month: { companyId: user.orgId, year, month } }
      });

      run ??= await prisma.payrollRun.create({
        data: {
          companyId: user.orgId,
          year,
          month,
          status: 'PENDING_REVIEW',
          makerId: req.user?.id ?? targetUserId,
          notes: 'Auto-generated via Salary Generator'
        }
      });

      // Upsert PayslipRecord
      const existingPayslip = await prisma.payslipRecord.findUnique({
        where: { runId_employeeId: { runId: run.id, employeeId: targetUserId } }
      });

      let payslip;
      if (existingPayslip) {
        await prisma.payslipLineItem.deleteMany({ where: { payslipId: existingPayslip.id } });
        payslip = await prisma.payslipRecord.update({
          where: { id: existingPayslip.id },
          data: {
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
      } else {
        payslip = await prisma.payslipRecord.create({
          data: {
            runId: run.id,
            employeeId: targetUserId,
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

      // Also upsert legacy SalaryRecord for backward compatibility
      const allowancesObj: Record<string, number> = {};
      const deductionsObj: Record<string, number> = {};
      for (const item of calc.lineItems) {
        if (item.category === 'EARNING' && item.componentCode !== 'BASIC') {
          allowancesObj[item.componentCode.toLowerCase()] = item.finalAmount;
        } else if (item.category === 'DEDUCTION') {
          deductionsObj[item.componentCode.toLowerCase()] = item.finalAmount;
        }
      }

      await prisma.salaryRecord.upsert({
        where: { userId_month_year: { userId: targetUserId, month, year } },
        create: {
          userId: targetUserId,
          month,
          year,
          basicSalary: user.monthlySalary ?? 0,
          netSalary: calc.netPay,
          tax: calc.lineItems.find((i) => i.componentCode === 'TDS')?.finalAmount ?? 0,
          allowances: allowancesObj,
          deductions: deductionsObj,
          status: 'PROCESSED'
        },
        update: {
          basicSalary: user.monthlySalary ?? 0,
          netSalary: calc.netPay,
          tax: calc.lineItems.find((i) => i.componentCode === 'TDS')?.finalAmount ?? 0,
          allowances: allowancesObj,
          deductions: deductionsObj,
          status: 'PROCESSED'
        }
      });

      const maskedAccount = user.bankDetails?.accountNumber
        ? `XXXX${user.bankDetails.accountNumber.slice(-4)}`
        : undefined;

      const employeeData: FormattedEmployee = {
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        employeeId: user.employeeId ?? undefined,
        department: user.department?.name,
        designation: user.department?.name ?? 'Not Assigned',
        bankDetails: user.bankDetails
          ? {
              accountNumber: maskedAccount ?? '',
              bankName: user.bankDetails.bankName,
              ifscCode: user.bankDetails.ifscCode
            }
          : undefined
      };

      const formattedPayslip = {
        id: payslip.id,
        userId: targetUserId,
        month,
        year,
        basicSalary: user.monthlySalary ?? 0,
        netSalary: calc.netPay,
        status: run.status,
        processedAt: new Date().toISOString(),
        createdAt: payslip.createdAt.toISOString(),
        allowances: allowancesObj,
        deductions: deductionsObj,
        employee: employeeData
      };

      res.status(200).json({
        success: true,
        message: 'Salary generated successfully',
        data: formattedPayslip
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v3/payroll/download/:id
  static async downloadPayslip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const recordId = strParam(req.params.salaryRecordId) ?? strParam(req.params.id);
      if (!recordId) throw new AppError('Record ID required', 400, 'BAD_REQUEST');

      type DetailedPayslip = Prisma.PayslipRecordGetPayload<{
        include: {
          employee: { select: { id: true; firstName: true; lastName: true; email: true } };
          run: { include: { organization: true } };
          lineItems: true;
        };
      }>;

      let payslip: DetailedPayslip | null = null;
      try {
        payslip = await prisma.payslipRecord.findUnique({
          where: { id: recordId },
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, email: true } },
            run: { include: { organization: true } },
            lineItems: true
          }
        });
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code !== 'P2021') {
          throw err;
        }
      }

      if (payslip) {
        const monthName = new Date(payslip.run.year, payslip.run.month - 1).toLocaleString('default', {
          month: 'long'
        });

        const fullName = `${payslip.employee.firstName ?? ''} ${payslip.employee.lastName ?? ''}`.trim() || payslip.employee.email;

        const pdfBuffer = createPayslipPdfBuffer({
          payslipId: payslip.id,
          orgName: payslip.run.organization.name,
          employeeName: fullName,
          employeeEmail: payslip.employee.email,
          monthName,
          year: payslip.run.year,
          workingDays: payslip.workingDays,
          presentDays: payslip.presentDays,
          lopDays: payslip.lopDays,
          grossEarnings: payslip.grossEarnings,
          totalDeductions: payslip.totalDeductions,
          netPay: payslip.netPay,
          lineItems: payslip.lineItems.map((item) => ({
            componentCode: item.componentCode,
            category: item.category,
            finalAmount: item.finalAmount
          }))
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="payslip-${payslip.run.year}-${payslip.run.month}.pdf"`);
        res.status(200).send(pdfBuffer);
        return;
      }

      // Fallback to legacy SalaryRecord
      const legacy = await prisma.salaryRecord.findUnique({
        where: { id: recordId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              organization: { select: { name: true } }
            }
          }
        }
      });

      if (!legacy) {
        throw new AppError('Payslip record not found', 404, 'NOT_FOUND');
      }

      const monthName = new Date(legacy.year, legacy.month - 1).toLocaleString('default', {
        month: 'long'
      });

      const fullName = `${legacy.user.firstName ?? ''} ${legacy.user.lastName ?? ''}`.trim() || legacy.user.email;
      const orgName = legacy.user.organization?.name ?? 'ShapeNXT';

      const lineItems: { componentCode: string; category: string; finalAmount: number }[] = [
        { componentCode: 'BASIC', category: 'EARNING', finalAmount: legacy.basicSalary }
      ];

      let grossEarnings = legacy.basicSalary;
      if (legacy.allowances && typeof legacy.allowances === 'object') {
        for (const [code, amount] of Object.entries(legacy.allowances as Record<string, number>)) {
          const num = typeof amount === 'number' ? amount : parseFloat(String(amount) || '0');
          if (num > 0) {
            lineItems.push({ componentCode: code.toUpperCase(), category: 'EARNING', finalAmount: num });
            grossEarnings += num;
          }
        }
      }

      let totalDeductions = 0;
      if (legacy.deductions && typeof legacy.deductions === 'object') {
        for (const [code, amount] of Object.entries(legacy.deductions as Record<string, number>)) {
          const num = typeof amount === 'number' ? amount : parseFloat(String(amount) || '0');
          if (num > 0) {
            lineItems.push({ componentCode: code.toUpperCase(), category: 'DEDUCTION', finalAmount: num });
            totalDeductions += num;
          }
        }
      }

      const pdfBuffer = createPayslipPdfBuffer({
        payslipId: legacy.id,
        orgName,
        employeeName: fullName,
        employeeEmail: legacy.user.email,
        monthName,
        year: legacy.year,
        workingDays: 22,
        presentDays: 22,
        lopDays: 0,
        grossEarnings,
        totalDeductions,
        netPay: legacy.netSalary,
        lineItems
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="payslip-${legacy.year}-${legacy.month}.pdf"`);
      res.status(200).send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v3/payroll/custom/preview
  static customPayslipPreview(req: Request, res: Response, next: NextFunction): void {
    try {
      const body = req.body as CustomPayslipPayload | undefined;
      const targetUserId = body?.userId ?? req.user?.id;
      if (!targetUserId) throw new AppError('User ID is required', 400, 'BAD_REQUEST');

      const numBasic = parseNumber(body?.basicSalary, 0);
      const parsedAllowances: Record<string, number> = {};
      if (body?.allowances && typeof body.allowances === 'object') {
        for (const [k, v] of Object.entries(body.allowances)) {
          const num = parseNumber(v, 0);
          if (num > 0) parsedAllowances[k] = num;
        }
      }

      const parsedDeductions: Record<string, number> = {};
      if (body?.deductions && typeof body.deductions === 'object') {
        for (const [k, v] of Object.entries(body.deductions)) {
          const num = parseNumber(v, 0);
          if (num > 0) parsedDeductions[k] = num;
        }
      }

      const totalAllowances = Object.values(parsedAllowances).reduce((sum, v) => sum + v, 0);
      const totalDeductions = Object.values(parsedDeductions).reduce((sum, v) => sum + v, 0);
      const grossEarnings = numBasic + totalAllowances;
      const netPay = Math.max(0, grossEarnings - totalDeductions);

      const targetMonth = parseNumber(body?.month, new Date().getMonth() + 1);
      const targetYear = parseNumber(body?.year, new Date().getFullYear());

      res.status(200).json({
        success: true,
        data: {
          userId: targetUserId,
          month: targetMonth,
          year: targetYear,
          basicSalary: numBasic,
          grossEarnings,
          totalAllowances,
          totalDeductions,
          netSalary: netPay,
          allowances: parsedAllowances,
          deductions: parsedDeductions
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v3/payroll/custom/generate
  static async customPayslipGenerate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as CustomPayslipPayload | undefined;
      const targetUserId = body?.userId ?? req.user?.id;
      if (!targetUserId) throw new AppError('User ID is required', 400, 'BAD_REQUEST');

      const targetMonth = parseNumber(body?.month, new Date().getMonth() + 1);
      const targetYear = parseNumber(body?.year, new Date().getFullYear());
      const numBasic = parseNumber(body?.basicSalary, 0);

      const parsedAllowances: Record<string, number> = {};
      if (body?.allowances && typeof body.allowances === 'object') {
        for (const [k, v] of Object.entries(body.allowances)) {
          const num = parseNumber(v, 0);
          if (num > 0) parsedAllowances[k] = num;
        }
      }

      const parsedDeductions: Record<string, number> = {};
      if (body?.deductions && typeof body.deductions === 'object') {
        for (const [k, v] of Object.entries(body.deductions)) {
          const num = parseNumber(v, 0);
          if (num > 0) parsedDeductions[k] = num;
        }
      }

      const totalAllowances = Object.values(parsedAllowances).reduce((sum, v) => sum + v, 0);
      const totalDeductions = Object.values(parsedDeductions).reduce((sum, v) => sum + v, 0);
      const grossEarnings = numBasic + totalAllowances;
      const netPay = Math.max(0, grossEarnings - totalDeductions);
      const remarks = body?.remarks ?? 'Custom payslip generated';

      // Upsert into legacy SalaryRecord
      const record = await prisma.salaryRecord.upsert({
        where: {
          userId_month_year: {
            userId: targetUserId,
            month: targetMonth,
            year: targetYear
          }
        },
        create: {
          userId: targetUserId,
          month: targetMonth,
          year: targetYear,
          basicSalary: numBasic,
          netSalary: netPay,
          allowances: parsedAllowances,
          deductions: parsedDeductions,
          remarks,
          status: 'PENDING'
        },
        update: {
          basicSalary: numBasic,
          netSalary: netPay,
          allowances: parsedAllowances,
          deductions: parsedDeductions,
          remarks
        }
      });

      res.status(201).json({
        success: true,
        message: 'Custom payslip generated successfully',
        data: record
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v3/payroll/pre-stats/:month/:year/:userId? & /api/v3/payroll/pre-stats/:month/:year
  static async preStatsSalaryGeneration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawUserId = strParam(req.params.userId);
      const targetUserId = rawUserId && rawUserId !== 'undefined' ? rawUserId : req.user?.id;
      const month = parseInt(strParam(req.params.month) ?? '0', 10);
      const year = parseInt(strParam(req.params.year) ?? '0', 10);

      if (!targetUserId || !month || !year) {
        throw new AppError('User ID, month, and year are required', 400, 'BAD_REQUEST');
      }

      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        include: { salaryParameter: true, bankDetails: true }
      });

      if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);

      const attendanceCount = await prisma.attendanceRecord.count({
        where: {
          userId: targetUserId,
          date: { gte: startDate, lt: endDate },
          status: { in: ['PRESENT', 'HALF_DAY'] }
        }
      });

      const approvedLeaves = await prisma.leaveRequest.findMany({
        where: {
          userId: targetUserId,
          status: 'APPROVED',
          startDate: { lt: endDate },
          endDate: { gte: startDate }
        }
      });

      const approvedLeaveDays = approvedLeaves.reduce((acc, l) => {
        const s = Math.max(l.startDate.getTime(), startDate.getTime());
        const e = Math.min(l.endDate.getTime(), endDate.getTime());
        return acc + Math.max(0, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
      }, 0);

      const workingDays = getWorkingDaysInMonth(year, month);

      const preview = calculateEmployeePayroll(
        {
          userId: user.id,
          firstName: user.firstName ?? '',
          lastName: user.lastName ?? '',
          email: user.email,
          monthlySalary: user.monthlySalary ?? 0,
          bankDetails: user.bankDetails,
          salaryParameter: user.salaryParameter,
          attendanceCount,
          approvedLeaveDays
        },
        workingDays
      );

      res.status(200).json({ success: true, data: preview });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/payroll/user/:userId
  static async getUserPayroll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawUserId = strParam(req.params.userId);
      const targetUserId = rawUserId && rawUserId !== 'undefined' ? rawUserId : req.user?.id;
      if (!targetUserId) {
        throw new AppError('User ID is required', 400, 'BAD_REQUEST');
      }

      type UserPayslip = Prisma.PayslipRecordGetPayload<{ include: { run: true; lineItems: true } }>;
      let payslips: UserPayslip[] = [];
      try {
        payslips = await prisma.payslipRecord.findMany({
          where: { employeeId: targetUserId },
          include: { run: true, lineItems: true },
          orderBy: [{ run: { year: 'desc' } }, { run: { month: 'desc' } }]
        });
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code !== 'P2021') throw err;
      }

      if (payslips.length > 0) {
        const formatted = payslips.map((p) => ({
          id: p.id,
          userId: p.employeeId,
          month: p.run.month,
          year: p.run.year,
          basicSalary: p.grossEarnings,
          netSalary: p.netPay,
          status: p.run.status,
          processedAt: p.run.disbursedAt?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString()
        }));
        res.status(200).json({ success: true, count: formatted.length, data: formatted });
        return;
      }

      const legacy = await prisma.salaryRecord.findMany({
        where: { userId: targetUserId },
        orderBy: [{ year: 'desc' }, { month: 'desc' }]
      });

      res.status(200).json({ success: true, count: legacy.length, data: legacy });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/v2/payroll/:id & /api/v2/salary/:id
  static async deleteRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Record ID required', 400, 'BAD_REQUEST');

      const existingPayslip = await prisma.payslipRecord.findUnique({ where: { id } });
      if (existingPayslip) {
        await prisma.payslipLineItem.deleteMany({ where: { payslipId: id } });
        await prisma.payslipRecord.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Payslip record deleted successfully' });
        return;
      }

      const existingSalary = await prisma.salaryRecord.findUnique({ where: { id } });
      if (existingSalary) {
        await prisma.salaryRecord.delete({ where: { id } });
        res.status(200).json({ success: true, message: 'Salary record deleted successfully' });
        return;
      }

      throw new AppError('Record not found', 404, 'NOT_FOUND');
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/payroll/statistics/:userId
  static async getUserPayrollStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawUserId = strParam(req.params.userId);
      const targetUserId = rawUserId && rawUserId !== 'undefined' ? rawUserId : req.user?.id;
      if (!targetUserId) throw new AppError('User ID required', 400, 'BAD_REQUEST');

      const payslips = await prisma.payslipRecord.findMany({
        where: { employeeId: targetUserId },
        include: { run: true }
      });

      const totalEarned = payslips.reduce((sum, p) => sum + p.netPay, 0);
      const totalAttendance = payslips.reduce((sum, p) => sum + p.presentDays, 0);

      res.status(200).json({
        success: true,
        data: {
          monthlySalaries: payslips.map((p) => ({
            id: p.id,
            month: p.run.month,
            year: p.run.year,
            netSalary: p.netPay,
            status: p.run.status
          })),
          summary: {
            totalEarned,
            totalAttendance,
            totalMonths: payslips.length
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
}
