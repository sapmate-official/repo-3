import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import type { BillingStatus, Prisma } from '@prisma/client';
import { billHistoryQuerySchema, payBillSchema } from './billing.schema.js';
import { createInvoicePdfBuffer } from './invoice-pdf.js';

const strParam = (val: unknown): string | undefined => {
  if (Array.isArray(val)) {
    const first: unknown = val[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
};

export class BillingController {
  // GET /api/v2/billing/dashboard
  static async getBillingDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 401, 'ORG_CONTEXT_MISSING');
      }

      const currentYear = new Date().getFullYear();

      // Fetch organization and billing records in parallel
      const [allBills, organization] = await Promise.all([
        prisma.billingRecord.findMany({
          where: { organizationId: orgId },
          orderBy: [{ year: 'desc' }, { month: 'desc' }]
        }),
        prisma.organization.findUnique({
          where: { id: orgId },
          select: {
            name: true,
            subscriptionPlanId: true,
            subscriptionPlan: {
              select: {
                id: true,
                name: true,
                monthlyPrice: true,
                annualPrice: true,
                maxUsers: true,
                features: true
              }
            },
            subscriptionStart: true,
            subscriptionEnd: true,
            _count: {
              select: { users: true }
            }
          }
        })
      ]);

      if (!organization) {
        throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
      }

      const currentYearBills = allBills.filter((bill) => bill.year === currentYear);
      const latestBill = allBills[0] ?? null;

      const totalBilledThisYear = currentYearBills.reduce((sum, bill) => sum + bill.totalAmount, 0);
      const unpaidBills = allBills.filter(
        (bill) => (bill.status as string) === 'UNPAID' || bill.status === 'OVERDUE'
      );
      const totalUnpaid = unpaidBills.reduce((sum, bill) => sum + bill.totalAmount, 0);

      const subscriptionEnd = organization.subscriptionEnd;
      const daysRemaining = subscriptionEnd
        ? Math.ceil((new Date(subscriptionEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

      let subscriptionStatus = 'No End Date';
      if (subscriptionEnd) {
        if (daysRemaining !== null && daysRemaining < 0) {
          subscriptionStatus = 'Expired';
        } else if (daysRemaining !== null && daysRemaining < 7) {
          subscriptionStatus = 'Expiring Soon';
        } else {
          subscriptionStatus = 'Active';
        }
      }

      const responseData = {
        organization: {
          name: organization.name,
          subscriptionPlan: organization.subscriptionPlan?.name ?? 'No Plan',
          activeUsers: organization._count.users,
          subscriptionStart: organization.subscriptionStart,
          subscriptionEnd: organization.subscriptionEnd,
          daysRemaining,
          subscriptionStatus
        },
        billing: {
          latestBill,
          totalBilledThisYear,
          totalUnpaid,
          unpaidCount: unpaidBills.length
        },
        billStatus: {
          unpaid: allBills.filter((b) => (b.status as string) === 'UNPAID').length,
          paid: allBills.filter((b) => b.status === 'PAID').length,
          overdue: allBills.filter((b) => b.status === 'OVERDUE').length,
          total: allBills.length
        },
        recentBills: allBills.slice(0, 3)
      };

      res.status(200).json({
        success: true,
        data: responseData
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/billing/history
  static async getBillHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 401, 'ORG_CONTEXT_MISSING');
      }

      const parsedQuery = billHistoryQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        throw new AppError(parsedQuery.error.issues[0]?.message ?? 'Invalid query parameters', 400, 'VALIDATION_ERROR');
      }

      const { page, limit, status, year, sort } = parsedQuery.data;

      const filter: Prisma.BillingRecordWhereInput = { organizationId: orgId };
      if (status) {
        filter.status = status as BillingStatus;
      }
      if (year) {
        filter.year = year;
      }

      const skip = (page - 1) * limit;

      const [totalBills, bills] = await Promise.all([
        prisma.billingRecord.count({ where: filter }),
        prisma.billingRecord.findMany({
          where: filter,
          orderBy: [
            { year: sort },
            { month: sort }
          ],
          skip,
          take: limit
        })
      ]);

      const billsWithMonthName = bills.map((bill) => ({
        ...bill,
        monthName: new Date(bill.year, bill.month - 1).toLocaleString('default', { month: 'long' })
      }));

      res.status(200).json({
        success: true,
        data: billsWithMonthName,
        pagination: {
          total: totalBills,
          page,
          limit,
          pages: Math.max(1, Math.ceil(totalBills / limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/billing/bill/:id
  static async getBillDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 401, 'ORG_CONTEXT_MISSING');
      }

      const billId = strParam(req.params.id);
      if (!billId) {
        throw new AppError('Bill ID is required', 400, 'BAD_REQUEST');
      }

      const bill = await prisma.billingRecord.findFirst({
        where: {
          id: billId,
          organizationId: orgId
        },
        include: {
          organization: {
            select: {
              name: true,
              logo: true,
              subscriptionPlanId: true,
              subscriptionPlan: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      });

      if (!bill) {
        throw new AppError("Bill not found or you don't have access to this bill", 404, 'NOT_FOUND');
      }

      const { organization, ...billFields } = bill;
      const formattedBill = {
        ...billFields,
        organizationName: organization.name,
        organizationLogo: organization.logo,
        subscriptionPlan: organization.subscriptionPlan?.name ?? 'No Plan',
        monthName: new Date(bill.year, bill.month - 1).toLocaleString('default', { month: 'long' })
      };

      res.status(200).json({
        success: true,
        data: formattedBill
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/billing/bill/:id/pay
  static async markBillAsPaid(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 401, 'ORG_CONTEXT_MISSING');
      }

      const billId = strParam(req.params.id);
      if (!billId) {
        throw new AppError('Bill ID is required', 400, 'BAD_REQUEST');
      }

      const parsedBody = payBillSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError(parsedBody.error.issues[0]?.message ?? 'Payment method is required', 400, 'VALIDATION_ERROR');
      }

      const { paymentMethod, paymentReference } = parsedBody.data;

      const bill = await prisma.billingRecord.findFirst({
        where: {
          id: billId,
          organizationId: orgId
        }
      });

      if (!bill) {
        throw new AppError("Bill not found or you don't have access to this bill", 404, 'NOT_FOUND');
      }

      if (bill.status === 'PAID') {
        throw new AppError('This bill is already paid', 400, 'BILL_ALREADY_PAID');
      }

      const ref = paymentReference ?? `${paymentMethod}-${Date.now()}`;

      const updatedBill = await prisma.billingRecord.update({
        where: { id: billId },
        data: {
          status: 'PAID',
          paidDate: new Date(),
          paymentReference: ref
        }
      });

      res.status(200).json({
        success: true,
        message: 'Bill marked as paid successfully',
        data: updatedBill
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/public/billing/:id
  static async getPublicBill(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const billId = strParam(req.params.id);
      if (!billId) throw new AppError('Bill ID required', 400, 'BAD_REQUEST');

      const bill = await prisma.billingRecord.findUnique({
        where: { id: billId },
        include: {
          organization: {
            select: {
              name: true,
              logo: true,
              subscriptionPlanId: true,
              subscriptionPlan: { select: { name: true } }
            }
          }
        }
      });

      if (!bill) throw new AppError('Bill not found', 404, 'NOT_FOUND');

      const { organization, ...billFields } = bill;
      const formatted = {
        ...billFields,
        organizationName: organization.name,
        organizationLogo: organization.logo,
        subscriptionPlan: organization.subscriptionPlan?.name ?? 'No Plan',
        monthName: new Date(bill.year, bill.month - 1).toLocaleString('default', { month: 'long' })
      };

      res.status(200).json({ success: true, data: formatted, ...formatted });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/public/billing/:id/payment
  static async payPublicBill(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const billId = strParam(req.params.id);
      if (!billId) throw new AppError('Bill ID required', 400, 'BAD_REQUEST');

      const body = req.body as { paymentMethod?: string; paymentReference?: string };
      const paymentMethod = typeof body?.paymentMethod === 'string' ? body.paymentMethod : 'ONLINE';
      const paymentReference =
        typeof body?.paymentReference === 'string'
          ? body.paymentReference
          : `PUB-${paymentMethod}-${Date.now()}`;

      const bill = await prisma.billingRecord.findUnique({ where: { id: billId } });
      if (!bill) throw new AppError('Bill not found', 404, 'NOT_FOUND');
      if (bill.status === 'PAID') throw new AppError('Bill is already paid', 400, 'ALREADY_PAID');

      const updated = await prisma.billingRecord.update({
        where: { id: billId },
        data: {
          status: 'PAID',
          paidDate: new Date(),
          paymentReference
        }
      });

      res.status(200).json({
        success: true,
        message: 'Bill payment recorded successfully',
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/billing/bill/:id/invoice
  static async downloadBillInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const billId = strParam(req.params.id);
      if (!billId) {
        throw new AppError('Bill ID is required', 400, 'BAD_REQUEST');
      }

      const bill = await prisma.billingRecord.findFirst({
        where: { id: billId },
        include: {
          organization: {
            select: {
              name: true,
              address: true,
              subscriptionPlan: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      });

      if (!bill) {
        throw new AppError("Bill not found or you don't have access to this bill", 404, 'NOT_FOUND');
      }

      const monthName = new Date(bill.year, bill.month - 1).toLocaleString('default', { month: 'long' });

      const pdfBuffer = createInvoicePdfBuffer({
        invoiceNumber: bill.id.substring(0, 8),
        orgName: bill.organization.name,
        orgAddress: bill.organization.address,
        monthName,
        year: bill.year,
        issueDate: (bill.billDate instanceof Date ? bill.billDate : new Date()).toISOString().slice(0, 10),
        dueDate: (bill.dueDate instanceof Date ? bill.dueDate : new Date()).toISOString().slice(0, 10),
        status: bill.status,
        paidDate: bill.paidDate instanceof Date ? bill.paidDate.toISOString().slice(0, 10) : null,
        paymentReference: bill.paymentReference,
        planName: bill.organization.subscriptionPlan?.name ?? 'Standard',
        activeUsers: bill.activeUserCount,
        pricePerUser: bill.pricePerUser,
        totalAmount: bill.totalAmount
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${bill.id}.pdf"`);
      res.status(200).send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
}
