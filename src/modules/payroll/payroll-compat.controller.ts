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

  // GET /api/v3/payroll/payslip/:month/:year/:userId
  static async getPayslipByParams(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = strParam(req.params.userId) ?? req.user?.id;
      const month = parseInt(strParam(req.params.month) ?? '0', 10);
      const year = parseInt(strParam(req.params.year) ?? '0', 10);

      if (!userId || !month || !year) {
        throw new AppError('Parameters userId, month, and year required', 400, 'BAD_REQUEST');
      }

      const payslip = await prisma.payslipRecord.findFirst({
        where: { employeeId: userId, run: { month, year } },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              department: { select: { name: true } }
            }
          },
          run: {
            include: { organization: true }
          },
          lineItems: true
        }
      });

      if (!payslip) {
        throw new AppError('Payslip not found for this period', 404, 'NOT_FOUND');
      }

      res.status(200).json({ success: true, data: payslip });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v3/payroll/download/:id
  static async downloadPayslip(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const recordId = strParam(req.params.salaryRecordId) ?? strParam(req.params.id);
      if (!recordId) throw new AppError('Record ID required', 400, 'BAD_REQUEST');

      const payslip = await prisma.payslipRecord.findUnique({
        where: { id: recordId },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, email: true } },
          run: { include: { organization: true } },
          lineItems: true
        }
      });

      if (!payslip) {
        throw new AppError('Payslip record not found', 404, 'NOT_FOUND');
      }

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
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v3/payroll/pre-stats/:month/:year/:userId
  static async preStatsSalaryGeneration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = strParam(req.params.userId) ?? req.user?.id;
      const month = parseInt(strParam(req.params.month) ?? '0', 10);
      const year = parseInt(strParam(req.params.year) ?? '0', 10);

      if (!userId || !month || !year) {
        throw new AppError('User ID, month, and year are required', 400, 'BAD_REQUEST');
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { salaryParameter: true, bankDetails: true }
      });

      if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);

      const attendanceCount = await prisma.attendanceRecord.count({
        where: {
          userId,
          date: { gte: startDate, lt: endDate },
          status: { in: ['PRESENT', 'HALF_DAY'] }
        }
      });

      const approvedLeaves = await prisma.leaveRequest.findMany({
        where: {
          userId,
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
}
