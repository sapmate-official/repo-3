import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import { env } from '../../config/env.js';
import {
  createSuperAdminSession,
  revokeSuperAdminSessions
} from '../auth/authSession.service.js';
import { EmailService } from '../../services/email.service.js';
import type { Prisma, BillingStatus, UserStatus } from '@prisma/client';
import {
  loginSuperAdminSchema,
  createSuperAdminSchema,
  updateSuperAdminSchema,
  generateOrganizationBillSchema,
  sendBillEmailSchema,
  updateBillStatusSchema,
  processPaymentSchema
} from './super-admin.schema.js';

const strParam = (val: unknown): string | undefined => {
  if (Array.isArray(val)) {
    const first: unknown = val[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
};

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/'
};

export class SuperAdminController {
  // ==========================================
  // Auth & Token Endpoints
  // ==========================================

  // POST /api/v2/super-admin/login
  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedBody = loginSuperAdminSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError('Email and password are required', 400, 'VALIDATION_ERROR');
      }

      const { email, password } = parsedBody.data;

      const superAdmin = await prisma.superAdmin.findFirst({
        where: { email }
      });

      if (!superAdmin) {
        throw new AppError('No super admin exists with this Email', 401, 'INVALID_CREDENTIALS');
      }

      const isPasswordValid = await bcrypt.compare(password, superAdmin.hashedPassword);
      if (!isPasswordValid) {
        throw new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
      }

      const session = await createSuperAdminSession(
        { id: superAdmin.id, email: superAdmin.email },
        {
          userAgent: req.header('User-Agent'),
          ipAddress: req.ip
        }
      );

      // Set auth cookies
      res.cookie('accessToken', session.accessToken, cookieOptions);
      res.cookie('superAdminToken', session.accessToken, cookieOptions);
      res.cookie('refreshToken', session.refreshToken, cookieOptions);

      res.status(200).json({
        message: 'Super Admin logged in successfully',
        userData: {
          id: superAdmin.id,
          email: superAdmin.email,
          name: superAdmin.name,
          isSuperAdmin: true
        },
        accessToken: session.accessToken,
        refreshToken: session.refreshToken
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/super-admin/logout
  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const superAdminId = req.superAdmin?.id;
      if (superAdminId) {
        await revokeSuperAdminSessions(superAdminId);
      }

      res.clearCookie('accessToken', cookieOptions);
      res.clearCookie('superAdminToken', cookieOptions);
      res.clearCookie('refreshToken', cookieOptions);

      res.status(200).json({
        message: 'Super Admin logged out successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/super-admin/validate-token
  static validateToken(req: Request, res: Response, next: NextFunction): void {
    try {
      if (!req.superAdmin) {
        throw new AppError('Super admin authentication required', 401, 'UNAUTHORIZED');
      }

      res.status(200).json({
        message: 'Super Admin token validated successfully',
        userData: req.superAdmin
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/super-admin/get-user-info
  static async getUserInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.superAdmin) {
        throw new AppError('Super admin authentication required', 401, 'UNAUTHORIZED');
      }

      const superAdmin = await prisma.superAdmin.findUnique({
        where: { id: req.superAdmin.id },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!superAdmin) {
        throw new AppError('Super admin account not found', 404, 'NOT_FOUND');
      }

      res.status(200).json({
        message: 'Super Admin token validated successfully',
        userData: {
          id: superAdmin.id,
          email: superAdmin.email,
          name: superAdmin.name,
          isSuperAdmin: true
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // Super Admin Account CRUD
  // ==========================================

  // GET /api/v2/super-admin
  static async getSuperAdmins(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const superAdmins = await prisma.superAdmin.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      res.status(200).json(superAdmins);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/super-admin/:id
  static async getSuperAdminById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('ID parameter is required', 400, 'BAD_REQUEST');

      const superAdmin = await prisma.superAdmin.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!superAdmin) {
        throw new AppError('Super admin not found', 404, 'NOT_FOUND');
      }

      res.status(200).json(superAdmin);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/super-admin
  static async createSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedBody = createSuperAdminSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError(
          parsedBody.error.issues.map((i) => i.message).join(', '),
          400,
          'VALIDATION_ERROR'
        );
      }

      const { email, name, password, secretKey } = parsedBody.data;

      // Allow if request is already from authenticated super admin or secretKey matches
      const expectedSecret = process.env.SUPER_ADMIN_SECRET_KEY ?? 'superadmin_master_key_2026';
      if (!req.superAdmin && secretKey !== expectedSecret) {
        throw new AppError('Unauthorized: valid secret key or super-admin token required', 401, 'UNAUTHORIZED');
      }

      const existing = await prisma.superAdmin.findUnique({
        where: { email }
      });

      if (existing) {
        throw new AppError('A super admin with this email already exists', 409, 'CONFLICT');
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const created = await prisma.superAdmin.create({
        data: {
          email,
          name,
          hashedPassword
        },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true
        }
      });

      res.status(201).json({
        message: 'Super admin created successfully',
        superAdmin: created
      });
    } catch (error) {
      next(error);
    }
  }

  // PUT or PATCH /api/v2/super-admin/:id
  static async updateSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('ID parameter is required', 400, 'BAD_REQUEST');

      const parsedBody = updateSuperAdminSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError(
          parsedBody.error.issues.map((i) => i.message).join(', '),
          400,
          'VALIDATION_ERROR'
        );
      }

      const existing = await prisma.superAdmin.findUnique({
        where: { id }
      });

      if (!existing) {
        throw new AppError('Super admin not found', 404, 'NOT_FOUND');
      }

      const updateData: Prisma.SuperAdminUpdateInput = {};
      if (parsedBody.data.name) updateData.name = parsedBody.data.name;
      if (parsedBody.data.email) {
        if (parsedBody.data.email !== existing.email) {
          const duplicate = await prisma.superAdmin.findUnique({
            where: { email: parsedBody.data.email }
          });
          if (duplicate) {
            throw new AppError('Email is already taken', 409, 'CONFLICT');
          }
        }
        updateData.email = parsedBody.data.email;
      }
      if (parsedBody.data.password) {
        updateData.hashedPassword = await bcrypt.hash(parsedBody.data.password, 12);
      }

      const updated = await prisma.superAdmin.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true
        }
      });

      res.status(200).json({
        message: 'Super admin updated successfully',
        superAdmin: updated
      });
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/v2/super-admin/:id
  static async deleteSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('ID parameter is required', 400, 'BAD_REQUEST');

      if (req.superAdmin?.id === id) {
        throw new AppError('Cannot delete your own super admin account', 400, 'BAD_REQUEST');
      }

      const existing = await prisma.superAdmin.findUnique({
        where: { id }
      });

      if (!existing) {
        throw new AppError('Super admin not found', 404, 'NOT_FOUND');
      }

      await prisma.superAdmin.delete({
        where: { id }
      });

      res.status(200).json({ message: 'Super admin deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // Organization Tracking & Metrics
  // ==========================================

  // GET /api/v2/super-admin/organizations/stats
  static async getOrganizationsStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizations = await prisma.organization.findMany({
        select: {
          id: true,
          name: true,
          industry: true,
          subscriptionStart: true,
          subscriptionEnd: true,
          isActive: true,
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
          _count: {
            select: {
              users: true,
              departments: true
            }
          }
        },
        orderBy: {
          subscriptionEnd: 'asc'
        }
      });

      const now = new Date();
      const orgsWithStats = organizations.map((org) => {
        const daysRemaining = org.subscriptionEnd
          ? Math.ceil((new Date(org.subscriptionEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        const subscriptionStatus =
          daysRemaining === null
            ? 'No End Date'
            : daysRemaining < 0
              ? 'Expired'
              : daysRemaining < 7
                ? 'Expiring Soon'
                : 'Active';

        return {
          ...org,
          daysRemaining,
          subscriptionStatus
        };
      });

      res.status(200).json(orgsWithStats);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/super-admin/organization/:id/details
  static async getOrganizationDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Organization ID is required', 400, 'BAD_REQUEST');

      const organization = await prisma.organization.findUnique({
        where: { id },
        include: {
          subscriptionPlan: true,
          _count: {
            select: {
              users: true,
              departments: true,
              roles: true
            }
          },
          departments: {
            select: {
              id: true,
              name: true,
              _count: {
                select: {
                  users: true
                }
              }
            }
          },
          roles: {
            select: {
              id: true,
              name: true,
              isDefault: true,
              _count: {
                select: {
                  users: true
                }
              }
            }
          }
        }
      });

      if (!organization) {
        throw new AppError('Organization not found', 404, 'NOT_FOUND');
      }

      const subscriptionEnd = organization.subscriptionEnd;
      const daysRemaining = subscriptionEnd
        ? Math.ceil((new Date(subscriptionEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

      const subscriptionStatus =
        daysRemaining === null
          ? 'No End Date'
          : daysRemaining < 0
            ? 'Expired'
            : daysRemaining < 7
              ? 'Expiring Soon'
              : 'Active';

      res.status(200).json({
        ...organization,
        subscriptionMetrics: {
          daysRemaining,
          subscriptionStatus
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/super-admin/organization/:id/users
  static async getOrganizationUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Organization ID is required', 400, 'BAD_REQUEST');

      const status = strParam(req.query.status);
      const role = strParam(req.query.role);
      const page = Math.max(1, parseInt(strParam(req.query.page) ?? '1', 10) || 1);
      const limit = Math.max(1, Math.min(200, parseInt(strParam(req.query.limit) ?? '100', 10) || 100));
      const skip = (page - 1) * limit;

      const filter: Prisma.UserWhereInput = { orgId: id };
      if (status) filter.status = status as UserStatus;

      const [totalUsers, users] = await Promise.all([
        prisma.user.count({ where: filter }),
        prisma.user.findMany({
          where: filter,
          skip,
          take: limit,
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            employeeId: true,
            department: {
              select: {
                id: true,
                name: true
              }
            },
            roles: {
              include: {
                role: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        })
      ]);

      let filteredUsers = users;
      if (role) {
        filteredUsers = users.filter((u) =>
          u.roles.some((r) => r.role.id === role || r.role.name === role)
        );
      }

      res.status(200).json({
        users: filteredUsers,
        pagination: {
          total: totalUsers,
          page,
          limit,
          pages: Math.ceil(totalUsers / limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/super-admin/organization/:id/admins
  static async getOrganizationAdmins(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Organization ID is required', 400, 'BAD_REQUEST');

      const usersWithRoles = await prisma.user.findMany({
        where: {
          orgId: id,
          status: 'active',
          roles: {
            some: {
              role: {
                name: { in: ['Org_Admin', 'Admin'] }
              }
            }
          }
        },
        include: {
          roles: {
            include: {
              role: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      const admins = usersWithRoles.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName ?? '',
        lastName: u.lastName ?? '',
        employeeId: u.employeeId,
        roles: u.roles.map((r) => ({
          id: r.role.id,
          name: r.role.name
        }))
      }));

      res.status(200).json(admins);
    } catch (error) {
      next(error);
    }
  }

  // ==========================================
  // Platform-wide Billing Operations
  // ==========================================

  // GET /api/v2/super-admin/organization/:id/bills
  static async getOrganizationBills(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Organization ID is required', 400, 'BAD_REQUEST');

      const org = await prisma.organization.findUnique({
        where: { id },
        select: { name: true }
      });
      if (!org) throw new AppError('Organization not found', 404, 'NOT_FOUND');

      const status = strParam(req.query.status) as BillingStatus | undefined;
      const year = req.query.year ? parseInt(strParam(req.query.year) ?? '', 10) : undefined;
      const page = Math.max(1, parseInt(strParam(req.query.page) ?? '1', 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(strParam(req.query.limit) ?? '10', 10) || 10));
      const skip = (page - 1) * limit;

      const filter: Prisma.BillingRecordWhereInput = { organizationId: id };
      if (status) filter.status = status;
      if (year && !isNaN(year)) filter.year = year;

      const [totalBills, bills] = await Promise.all([
        prisma.billingRecord.count({ where: filter }),
        prisma.billingRecord.findMany({
          where: filter,
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
          skip,
          take: limit
        })
      ]);

      res.status(200).json({
        bills,
        pagination: {
          total: totalBills,
          page,
          limit,
          pages: Math.ceil(totalBills / limit)
        },
        organizationName: org.name
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/super-admin/organization/:id/bill
  static async generateOrganizationBill(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Organization ID is required', 400, 'BAD_REQUEST');

      const parsedBody = generateOrganizationBillSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError('Month (1-12) and Year are required', 400, 'VALIDATION_ERROR');
      }

      const { month, year } = parsedBody.data;

      const org = await prisma.organization.findUnique({
        where: { id },
        include: {
          subscriptionPlan: true,
          _count: {
            select: {
              users: { where: { status: 'active' } }
            }
          }
        }
      });

      if (!org) throw new AppError('Organization not found', 404, 'NOT_FOUND');

      const activeUserCount = org._count.users;
      const pricePerUser = org.subscriptionPlan?.monthlyPrice ?? 5.0;
      const totalAmount = Math.max(0, activeUserCount * pricePerUser);

      const billDate = new Date();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 15);

      const bill = await prisma.billingRecord.upsert({
        where: {
          organizationId_month_year: {
            organizationId: id,
            month,
            year
          }
        },
        update: {
          activeUserCount,
          pricePerUser,
          totalAmount,
          updatedAt: new Date()
        },
        create: {
          organizationId: id,
          month,
          year,
          activeUserCount,
          pricePerUser,
          totalAmount,
          status: 'UNPAID',
          billDate,
          dueDate
        }
      });

      res.status(200).json({
        message: 'Bill generated successfully',
        bill: {
          ...bill,
          organizationName: org.name,
          subscriptionPlan: org.subscriptionPlan?.name ?? 'Standard'
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/super-admin/organization/:id/send-bill
  static async sendBillEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Organization ID is required', 400, 'BAD_REQUEST');

      const parsedBody = sendBillEmailSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError('Either billId or both month and year are required', 400, 'VALIDATION_ERROR');
      }

      const { billId, month, year } = parsedBody.data;
      if (!billId && (!month || !year)) {
        throw new AppError('Either billId or both month and year are required', 400, 'BAD_REQUEST');
      }

      const org = await prisma.organization.findUnique({
        where: { id },
        include: { subscriptionPlan: true }
      });
      if (!org) throw new AppError('Organization not found', 404, 'NOT_FOUND');

      const bill = billId
        ? await prisma.billingRecord.findUnique({ where: { id: billId } })
        : (month !== undefined && year !== undefined
          ? await prisma.billingRecord.findUnique({
              where: {
                organizationId_month_year: {
                  organizationId: id,
                  month,
                  year
                }
              }
            })
          : null);

      if (!bill) {
        throw new AppError('Bill not found for this organization and billing period', 404, 'NOT_FOUND');
      }

      const admins = await prisma.user.findMany({
        where: {
          orgId: id,
          status: 'active',
          roles: {
            some: {
              role: {
                name: { in: ['Org_Admin', 'Admin'] }
              }
            }
          }
        },
        select: { email: true }
      });

      if (admins.length === 0) {
        throw new AppError('No admin users found for this organization to receive the bill email', 404, 'NOT_FOUND');
      }

      const adminEmails = admins.map((a) => a.email);
      let sentCount = 0;

      for (const email of adminEmails) {
        const sent = await EmailService.sendBillingInvoiceEmail({
          to: email,
          orgName: org.name,
          month: bill.month,
          year: bill.year,
          totalAmount: bill.totalAmount,
          activeUserCount: bill.activeUserCount,
          pricePerUser: bill.pricePerUser,
          dueDate: bill.dueDate,
          subscriptionPlan: org.subscriptionPlan?.name ?? 'Standard'
        });
        if (sent) sentCount++;
      }

      res.status(200).json({
        message: `${sentCount} out of ${adminEmails.length} emails dispatched`,
        recipients: adminEmails,
        bill
      });
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/super-admin/organizations/send-bills
  static async sendBillsToAllOrganizations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedBody = generateOrganizationBillSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError('Month and year are required', 400, 'VALIDATION_ERROR');
      }

      const { month, year } = parsedBody.data;

      const activeOrgs = await prisma.organization.findMany({
        where: { isActive: true },
        include: {
          subscriptionPlan: true,
          _count: {
            select: {
              users: { where: { status: 'active' } }
            }
          }
        }
      });

      const results = [];
      const billDate = new Date();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 15);

      for (const org of activeOrgs) {
        const activeUserCount = org._count.users;
        const pricePerUser = org.subscriptionPlan?.monthlyPrice ?? 5.0;
        const totalAmount = Math.max(0, activeUserCount * pricePerUser);

        const bill = await prisma.billingRecord.upsert({
          where: {
            organizationId_month_year: {
              organizationId: org.id,
              month,
              year
            }
          },
          update: {
            activeUserCount,
            pricePerUser,
            totalAmount,
            updatedAt: new Date()
          },
          create: {
            organizationId: org.id,
            month,
            year,
            activeUserCount,
            pricePerUser,
            totalAmount,
            status: 'UNPAID',
            billDate,
            dueDate
          }
        });

        const admins = await prisma.user.findMany({
          where: {
            orgId: org.id,
            status: 'active',
            roles: {
              some: {
                role: {
                  name: { in: ['Org_Admin', 'Admin'] }
                }
              }
            }
          },
          select: { email: true }
        });

        let emailsSent = 0;
        for (const admin of admins) {
          const sent = await EmailService.sendBillingInvoiceEmail({
            to: admin.email,
            orgName: org.name,
            month,
            year,
            totalAmount: bill.totalAmount,
            activeUserCount: bill.activeUserCount,
            pricePerUser: bill.pricePerUser,
            dueDate: bill.dueDate,
            subscriptionPlan: org.subscriptionPlan?.name ?? 'Standard'
          });
          if (sent) emailsSent++;
        }

        results.push({
          organizationId: org.id,
          organizationName: org.name,
          activeUserCount,
          totalAmount,
          emailsSent
        });
      }

      res.status(200).json({
        message: `Processed billing for ${activeOrgs.length} organization(s)`,
        results
      });
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/v2/super-admin/bill/:id/status
  static async updateBillStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Bill ID is required', 400, 'BAD_REQUEST');

      const parsedBody = updateBillStatusSchema.safeParse(req.body);
      if (!parsedBody.success) {
        throw new AppError(
          parsedBody.error.issues.map((i) => i.message).join(', '),
          400,
          'VALIDATION_ERROR'
        );
      }

      const { status, paymentReference, notes } = parsedBody.data;

      const existingBill = await prisma.billingRecord.findUnique({
        where: { id }
      });
      if (!existingBill) throw new AppError('Bill not found', 404, 'NOT_FOUND');

      const updateData: Prisma.BillingRecordUpdateInput = {
        status
      };
      if (status === 'PAID') {
        updateData.paidDate = new Date();
      }
      if (paymentReference) updateData.paymentReference = paymentReference;
      if (notes) updateData.notes = notes;

      const updatedBill = await prisma.billingRecord.update({
        where: { id },
        data: updateData
      });

      res.status(200).json({
        message: 'Bill status updated successfully',
        bill: updatedBill
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/super-admin/billing/statistics
  static async getBillingStatistics(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;

      const [thisMonthBills, unpaidBills, paidBills, overdueBills, pendingBills] = await Promise.all([
        prisma.billingRecord.findMany({
          where: { month: currentMonth, year: currentYear }
        }),
        prisma.billingRecord.count({ where: { status: 'UNPAID' } }),
        prisma.billingRecord.count({ where: { status: 'PAID' } }),
        prisma.billingRecord.count({ where: { status: 'OVERDUE' } }),
        prisma.billingRecord.findMany({
          where: { status: 'UNPAID' },
          select: {
            organizationId: true,
            organization: { select: { name: true } },
            totalAmount: true,
            dueDate: true
          },
          orderBy: { dueDate: 'asc' },
          take: 5
        })
      ]);

      const totalBilledThisMonth = thisMonthBills.reduce((sum, b) => sum + b.totalAmount, 0);
      const totalPaidThisMonth = thisMonthBills
        .filter((b) => b.status === 'PAID')
        .reduce((sum, b) => sum + b.totalAmount, 0);

      res.status(200).json({
        billing: {
          totalBilledThisMonth,
          totalPaidThisMonth,
          collectionRate: totalBilledThisMonth > 0 ? (totalPaidThisMonth / totalBilledThisMonth) * 100 : 0
        },
        billStatus: {
          unpaid: unpaidBills,
          paid: paidBills,
          overdue: overdueBills,
          total: unpaidBills + paidBills + overdueBills
        },
        pendingBills: pendingBills.map((b) => ({
          organizationId: b.organizationId,
          organizationName: b.organization?.name ?? 'Unknown Organization',
          amount: b.totalAmount,
          dueDate: b.dueDate
        }))
      });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/super-admin/bill/:id
  static async getBillById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Bill ID is required', 400, 'BAD_REQUEST');

      const bill = await prisma.billingRecord.findUnique({
        where: { id },
        include: {
          organization: {
            select: {
              name: true,
              logo: true,
              subscriptionPlanId: true,
              subscriptionPlan: { select: { name: true, monthlyPrice: true } }
            }
          }
        }
      });

      if (!bill) throw new AppError('Bill not found', 404, 'NOT_FOUND');

      res.status(200).json(bill);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/super-admin/bill/:id/payment
  static async processBillPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Bill ID is required', 400, 'BAD_REQUEST');

      const parsedBody = processPaymentSchema.safeParse(req.body);
      const paymentReference = parsedBody.success ? parsedBody.data.paymentReference : undefined;
      const notes = parsedBody.success ? parsedBody.data.notes : undefined;

      const existingBill = await prisma.billingRecord.findUnique({
        where: { id }
      });
      if (!existingBill) throw new AppError('Bill not found', 404, 'NOT_FOUND');

      const updatedBill = await prisma.billingRecord.update({
        where: { id },
        data: {
          status: 'PAID',
          paidDate: new Date(),
          paymentReference: paymentReference ?? `MANUAL-${Date.now()}`,
          notes: notes ?? 'Payment recorded by SuperAdmin'
        }
      });

      res.status(200).json({
        message: 'Payment processed successfully',
        bill: updatedBill
      });
    } catch (error) {
      next(error);
    }
  }
}
