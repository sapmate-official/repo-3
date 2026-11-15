import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../util/errors.js';
import { prisma } from '../../db/prisma.js';
import { PayrollService } from './payroll.service.js';
import {
  createRunSchema,
  disburseRunSchema,
  payrollQuerySchema,
  rejectRunSchema,
  runOverrideSchema
} from './payroll.schema.js';
import { createPayslipPdfBuffer } from './payslip-pdf.js';

const strParam = (val: unknown): string | undefined => {
  if (Array.isArray(val)) {
    const first: unknown = val[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
};

export class PayrollController {
  // POST /api/v3/payroll/runs
  static async createDraftRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user?.orgId;
      const makerId = req.user?.id;
      if (!companyId || !makerId) {
        throw new AppError('Organization context and authentication required', 401, 'UNAUTHORIZED');
      }

      const parsed = createRunSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid run parameters', 400, 'VALIDATION_ERROR');
      }

      const { month, year, notes } = parsed.data;
      const run = await PayrollService.createDraftRun(companyId, year, month, makerId, notes);

      res.status(201).json({ success: true, data: run });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v3/payroll/runs/:id/compute
  static async computePayRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = strParam(req.params.id);
      const actorId = req.user?.id;
      if (!runId || !actorId) {
        throw new AppError('Run ID and user authentication required', 400, 'BAD_REQUEST');
      }

      const computedRun = await PayrollService.computePayRun(runId, actorId);
      res.status(200).json({ success: true, data: computedRun });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v3/payroll/runs/:id/override
  static async applyOverride(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actorId = req.user?.id;
      if (!actorId) throw new AppError('User authentication required', 401, 'UNAUTHORIZED');

      const parsed = runOverrideSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid override data', 400, 'VALIDATION_ERROR');
      }

      const { lineItemId, finalAmount, reason } = parsed.data;
      const updated = await PayrollService.applyOverride(lineItemId, finalAmount, reason, actorId);

      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v3/payroll/runs/:id/submit
  static async submitForApproval(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = strParam(req.params.id);
      const actorId = req.user?.id;
      if (!runId || !actorId) throw new AppError('Run ID and authentication required', 400, 'BAD_REQUEST');

      const updated = await PayrollService.submitForApproval(runId, actorId);
      res.status(200).json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v3/payroll/runs/:id/approve
  static async approveRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = strParam(req.params.id);
      const checkerId = req.user?.id;
      if (!runId || !checkerId) throw new AppError('Run ID and authentication required', 400, 'BAD_REQUEST');

      const approved = await PayrollService.approveRun(runId, checkerId);
      res.status(200).json({ success: true, data: approved });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v3/payroll/runs/:id/reject
  static async rejectRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = strParam(req.params.id);
      const actorId = req.user?.id;
      if (!runId || !actorId) throw new AppError('Run ID and authentication required', 400, 'BAD_REQUEST');

      const parsed = rejectRunSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(parsed.error.issues[0]?.message ?? 'Rejection reason is required', 400, 'VALIDATION_ERROR');
      }

      const rejected = await PayrollService.rejectRun(runId, actorId, parsed.data.reason);
      res.status(200).json({ success: true, data: rejected });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v3/payroll/runs/:id/disburse
  static async disburseRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = strParam(req.params.id);
      const actorId = req.user?.id;
      if (!runId || !actorId) throw new AppError('Run ID and authentication required', 400, 'BAD_REQUEST');

      const parsed = disburseRunSchema.safeParse(req.body);
      const { utr, notes } = parsed.success ? parsed.data : { utr: undefined, notes: undefined };

      const disbursed = await PayrollService.disburseRun(runId, actorId, 'CHECKER', utr, notes);
      res.status(200).json({ success: true, data: disbursed });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v3/payroll/runs/:id
  static async getRunDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const runId = strParam(req.params.id);
      const companyId = req.user?.orgId;
      if (!runId || !companyId) throw new AppError('Run ID and organization context required', 400, 'BAD_REQUEST');

      const details = await PayrollService.getRunDetails(runId, companyId);
      res.status(200).json({ success: true, data: details });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v3/payroll/runs
  static async listRuns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const companyId = req.user?.orgId;
      if (!companyId) throw new AppError('Organization context required', 401, 'ORG_CONTEXT_MISSING');

      const parsed = payrollQuerySchema.safeParse(req.query);
      const { page, limit, status, year } = parsed.success
        ? parsed.data
        : { page: 1, limit: 20, status: undefined, year: undefined };

      const result = await PayrollService.listRuns(companyId, page, limit, status, year);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v3/payroll/payslips/:id/pdf
  static async downloadPayslipPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payslipId = strParam(req.params.id);
      if (!payslipId) throw new AppError('Payslip ID is required', 400, 'BAD_REQUEST');

      const payslip = await PayrollService.getPayslipById(payslipId);

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
      res.setHeader('Content-Disposition', `attachment; filename="payslip-${payslip.run.year}-${payslip.run.month}-${payslip.employee.id}.pdf"`);
      res.status(200).send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v3/payroll/my-payslips (Employee Self-Service)
  static async getMyPayslips(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const employeeId = req.user?.id;
      if (!employeeId) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

      const payslips = await prisma.payslipRecord.findMany({
        where: {
          employeeId,
          run: { status: 'DISBURSED' } // ESS only exposes disbursed, immutable payslips
        },
        include: {
          run: {
            select: { year: true, month: true, status: true, disbursedAt: true }
          },
          lineItems: true
        },
        orderBy: [{ run: { year: 'desc' } }, { run: { month: 'desc' } }]
      });

      res.status(200).json({ success: true, data: payslips });
    } catch (error) {
      next(error);
    }
  }
}
