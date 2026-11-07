import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import { hashPassword } from '../../util/password.js';

export interface ListEmployeesOptions {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
  managerId?: string;
  roleId?: string;
  status?: 'active' | 'inactive';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateEmployeeInput {
  firstName: string;
  lastName?: string;
  email: string;
  personalEmail?: string | null;
  businessEmail?: string | null;
  jobTitle?: string | null;
  mobileNumber?: string | null;
  emergencyContact?: string | null;
  dateOfBirth?: string | null;
  hiredDate?: string | null;
  address?: string | null;
  adharNumber?: string | null;
  panNumber?: string | null;
  employeeId: string;
  departmentId?: string | null;
  managerId?: string | null;
  roleIds: string[];
  accountHolder?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  bankName?: string | null;
  annualPackage?: number | null;
  monthlySalary?: number | null;
  hraPercentage?: number;
  daPercentage?: number;
  taPercentage?: number;
  pfPercentage?: number;
  taxPercentage?: number;
  insuranceFixed?: number;
}

export interface UpdateEmployeeInput extends Partial<CreateEmployeeInput> {
  status?: 'active' | 'inactive';
  terminationDate?: string | null;
}

export class EmployeeService {
  static async listEmployees(orgId: string, options: ListEmployeesOptions = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = orgId ? { orgId } : {};

    if (options.status) {
      where.status = options.status;
    }

    if (options.departmentId) {
      where.departmentId = options.departmentId;
    }

    if (options.managerId) {
      where.managerId = options.managerId;
    }

    if (options.roleId) {
      where.roles = {
        some: {
          roleId: options.roleId
        }
      };
    }

    if (options.search) {
      const q = options.search.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { businessEmail: { contains: q, mode: 'insensitive' } },
        { personalEmail: { contains: q, mode: 'insensitive' } },
        { employeeId: { contains: q, mode: 'insensitive' } },
        { jobTitle: { contains: q, mode: 'insensitive' } }
      ];
    }

    const sortField = options.sortBy ?? 'createdAt';
    const sortOrder = options.sortOrder ?? 'desc';

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortOrder },
        include: {
          department: {
            select: {
              id: true,
              name: true,
              code: true
            }
          },
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              businessEmail: true,
              personalEmail: true,
              jobTitle: true,
              employeeId: true
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
          },
          bankDetails: true,
          salaryParameter: true
        }
      })
    ]);

    const sanitized = users.map((u) => {
      const { hashedPassword: _p, refreshToken: _rt, ...safeUser } = u;
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ');
      return {
        ...safeUser,
        name: fullName ? fullName : u.email,
        personalEmail: u.personalEmail ?? u.email,
        businessEmail: u.businessEmail ?? null
      };
    });

    return {
      data: sanitized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  static async getEmployeeById(orgId: string, identifier: string) {
    const where: Prisma.UserWhereInput = {
      OR: [{ id: identifier }, { employeeId: identifier }]
    };
    if (orgId) {
      where.orgId = orgId;
    }

    const employee = await prisma.user.findFirst({
      where,
      include: {
        department: true,
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            businessEmail: true,
            personalEmail: true,
            jobTitle: true,
            employeeId: true
          }
        },
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        },
        bankDetails: true,
        salaryParameter: true,
        leaveBalances: {
          include: {
            leaveType: true
          }
        }
      }
    });

    if (!employee) {
      throw new AppError('Employee not found in your organization.', 404, 'EMPLOYEE_NOT_FOUND');
    }

    const { hashedPassword: _p, refreshToken: _rt, ...safeEmployee } = employee;
    const fullName = [employee.firstName, employee.lastName].filter(Boolean).join(' ');
    return {
      ...safeEmployee,
      name: fullName ? fullName : employee.email,
      personalEmail: employee.personalEmail ?? employee.email,
      businessEmail: employee.businessEmail ?? null
    };
  }

  static async createEmployee(orgId: string, input: CreateEmployeeInput) {
    // 1. Check uniqueness of email and employeeId in organization
    const existing = await prisma.user.findFirst({
      where: {
        orgId,
        OR: [{ email: input.email }, { employeeId: input.employeeId }]
      }
    });

    if (existing) {
      if (existing.email === input.email) {
        throw new AppError('An employee with this email already exists in your organization.', 409, 'EMAIL_EXISTS');
      }
      throw new AppError('An employee with this Employee ID already exists in your organization.', 409, 'EMPLOYEE_ID_EXISTS');
    }

    // 2. Validate department if supplied
    if (input.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: input.departmentId, orgId }
      });
      if (!dept) {
        throw new AppError('Selected department not found in your organization.', 400, 'INVALID_DEPARTMENT');
      }
    }

    // 3. Validate manager if supplied
    if (input.managerId) {
      const mgr = await prisma.user.findFirst({
        where: { id: input.managerId, orgId }
      });
      if (!mgr) {
        throw new AppError('Selected reporting manager not found in your organization.', 400, 'INVALID_MANAGER');
      }
    }

    // 4. Validate roles belong to organization
    const roles = await prisma.role.findMany({
      where: {
        id: { in: input.roleIds },
        orgId
      }
    });
    if (roles.length === 0) {
      throw new AppError('At least one valid organization role is required.', 400, 'INVALID_ROLE');
    }

    // Generate secure temporary random password and verificationToken
    const tempPassword = crypto.randomBytes(8).toString('hex') + 'A1!';
    const hashedPassword = await hashPassword(tempPassword);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const annualPackage = input.annualPackage ?? (input.monthlySalary ? input.monthlySalary * 12 : 0);
    const monthlySalary = input.monthlySalary ?? (input.annualPackage ? Math.round(input.annualPackage / 12) : 0);

    // 5. Atomic transaction
    const newEmployee = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          orgId,
          firstName: input.firstName,
          lastName: input.lastName ?? '',
          email: input.businessEmail ?? input.email,
          personalEmail: input.personalEmail ?? input.email,
          businessEmail: input.businessEmail ?? null,
          jobTitle: input.jobTitle ?? null,
          mobileNumber: input.mobileNumber ?? null,
          emergencyContact: input.emergencyContact ?? null,
          dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          hiredDate: input.hiredDate ? new Date(input.hiredDate) : new Date(),
          address: input.address ?? null,
          adharNumber: input.adharNumber ?? null,
          panNumber: input.panNumber ?? null,
          employeeId: input.employeeId,
          departmentId: input.departmentId ?? null,
          managerId: input.managerId ?? null,
          hashedPassword,
          verificationToken,
          verificationTokenExpiry,
          annualPackage,
          monthlySalary,
          status: 'active',
          roles: {
            create: roles.map((r) => ({
              role: { connect: { id: r.id } }
            }))
          },
          ...(input.accountNumber && input.ifscCode
            ? {
                bankDetails: {
                  create: {
                    accountHolder: input.accountHolder ?? `${input.firstName} ${input.lastName ?? ''}`.trim(),
                    accountNumber: input.accountNumber,
                    ifscCode: input.ifscCode,
                    bankName: input.bankName ?? 'Unknown Bank'
                  }
                }
              }
            : {}),
          ...(annualPackage > 0
            ? {
                salaryParameter: {
                  create: {
                    hraPercentage: input.hraPercentage ?? 40,
                    daPercentage: input.daPercentage ?? 10,
                    taPercentage: input.taPercentage ?? 10,
                    pfPercentage: input.pfPercentage ?? 12,
                    taxPercentage: input.taxPercentage ?? 10,
                    insuranceFixed: input.insuranceFixed ?? 1000
                  }
                }
              }
            : {})
        },
        include: {
          department: true,
          roles: { include: { role: true } },
          bankDetails: true,
          salaryParameter: true
        }
      });

      // Seed leave balances for this employee
      const leaveTypes = await tx.leaveType.findMany({
        where: { orgId }
      });

      if (leaveTypes.length > 0) {
        await tx.leaveBalance.createMany({
          data: leaveTypes.map((lt) => ({
            userId: user.id,
            leaveTypeId: lt.id,
            usedDays: 0,
            remainingDays: lt.annualLimit,
            year: new Date().getFullYear()
          }))
        });
      }

      return user;
    });

    const { hashedPassword: _p, ...safe } = newEmployee;
    return {
      ...safe,
      temporaryPassword: tempPassword,
      verificationToken
    };
  }

  static async updateEmployee(orgId: string, id: string, input: UpdateEmployeeInput) {
    const existing = await this.getEmployeeById(orgId, id);
    const userId = existing.id;

    if (input.email || input.employeeId) {
      const conflict = await prisma.user.findFirst({
        where: {
          orgId,
          id: { not: userId },
          OR: [
            ...(input.email ? [{ email: input.email }] : []),
            ...(input.employeeId ? [{ employeeId: input.employeeId }] : [])
          ]
        }
      });

      if (conflict) {
        throw new AppError('Another employee with this email or Employee ID already exists.', 409, 'EMPLOYEE_CONFLICT');
      }
    }

    if (input.departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: input.departmentId, orgId }
      });
      if (!dept) {
        throw new AppError('Selected department not found in your organization.', 400, 'INVALID_DEPARTMENT');
      }
    }

    if (input.managerId) {
      const manager = await prisma.user.findFirst({
        where: { id: input.managerId, orgId }
      });
      if (!manager) {
        throw new AppError('Selected reporting manager not found in your organization.', 400, 'INVALID_MANAGER');
      }
    }

    const annualPackage = input.annualPackage !== undefined ? input.annualPackage : undefined;
    const monthlySalary = input.monthlySalary !== undefined ? input.monthlySalary : undefined;

    const updated = await prisma.$transaction(async (tx) => {
      // If roleIds supplied, reset roles
      if (input.roleIds && input.roleIds.length > 0) {
        await tx.userRole.deleteMany({
          where: { userId }
        });
        await tx.userRole.createMany({
          data: input.roleIds.map((roleId) => ({
            userId,
            roleId
          }))
        });
      }

      // Upsert bank details if bank info given
      if (input.accountNumber && input.ifscCode) {
        const defaultHolder = `${input.firstName ?? existing.firstName} ${input.lastName ?? existing.lastName}`.trim();
        await tx.bankDetails.upsert({
          where: { userId },
          create: {
            userId,
            accountHolder: input.accountHolder ?? (defaultHolder || 'Account Holder'),
            accountNumber: input.accountNumber,
            ifscCode: input.ifscCode,
            bankName: input.bankName ?? 'Unknown Bank'
          },
          update: {
            ...(input.accountHolder ? { accountHolder: input.accountHolder } : {}),
            accountNumber: input.accountNumber,
            ifscCode: input.ifscCode,
            ...(input.bankName ? { bankName: input.bankName } : {})
          }
        });
      }

      // Upsert salary parameters if provided
      if (annualPackage !== undefined || monthlySalary !== undefined) {
        await tx.salaryParameter.upsert({
          where: { userId },
          create: {
            userId,
            hraPercentage: input.hraPercentage ?? 40,
            daPercentage: input.daPercentage ?? 10,
            taPercentage: input.taPercentage ?? 10,
            pfPercentage: input.pfPercentage ?? 12,
            taxPercentage: input.taxPercentage ?? 10,
            insuranceFixed: input.insuranceFixed ?? 1000
          },
          update: {
            ...(input.hraPercentage !== undefined ? { hraPercentage: input.hraPercentage } : {}),
            ...(input.daPercentage !== undefined ? { daPercentage: input.daPercentage } : {}),
            ...(input.taPercentage !== undefined ? { taPercentage: input.taPercentage } : {}),
            ...(input.pfPercentage !== undefined ? { pfPercentage: input.pfPercentage } : {}),
            ...(input.taxPercentage !== undefined ? { taxPercentage: input.taxPercentage } : {}),
            ...(input.insuranceFixed !== undefined ? { insuranceFixed: input.insuranceFixed } : {})
          }
        });
      }

      return tx.user.update({
        where: { id: userId },
        data: {
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.personalEmail !== undefined ? { personalEmail: input.personalEmail } : {}),
          ...(input.businessEmail !== undefined ? { businessEmail: input.businessEmail } : {}),
          ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
          ...(input.mobileNumber !== undefined ? { mobileNumber: input.mobileNumber } : {}),
          ...(input.emergencyContact !== undefined ? { emergencyContact: input.emergencyContact } : {}),
          ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null } : {}),
          ...(input.hiredDate !== undefined ? { hiredDate: input.hiredDate ? new Date(input.hiredDate) : null } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.adharNumber !== undefined ? { adharNumber: input.adharNumber } : {}),
          ...(input.panNumber !== undefined ? { panNumber: input.panNumber } : {}),
          ...(input.employeeId !== undefined ? { employeeId: input.employeeId } : {}),
          ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
          ...(input.managerId !== undefined ? { managerId: input.managerId } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.terminationDate !== undefined ? { terminationDate: input.terminationDate ? new Date(input.terminationDate) : null } : {}),
          ...(annualPackage !== undefined ? { annualPackage } : {}),
          ...(monthlySalary !== undefined ? { monthlySalary } : {})
        },
        include: {
          department: true,
          roles: { include: { role: true } },
          bankDetails: true,
          salaryParameter: true
        }
      });
    });

    const { hashedPassword: _p, ...safe } = updated;
    return safe;
  }

  static async deleteEmployee(orgId: string, id: string) {
    const employee = await this.getEmployeeById(orgId, id);
    const userId = employee.id;

    // Soft deactivation or hard delete within a safe transaction
    await prisma.$transaction(async (tx) => {
      // Remove dependent sub-tables
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.bankDetails.deleteMany({ where: { userId } });
      await tx.salaryParameter.deleteMany({ where: { userId } });
      await tx.leaveBalance.deleteMany({ where: { userId } });
      await tx.organization_admin.deleteMany({ where: { adminId: userId } });
      await tx.authSession.deleteMany({ where: { userId } });
      await tx.emailOtpVerification.deleteMany({ where: { userId } });

      // Unassign reporting manager relationship from subordinates
      await tx.user.updateMany({
        where: { managerId: userId },
        data: { managerId: null }
      });

      // Delete the user
      await tx.user.delete({
        where: { id: userId }
      });
    });

    return { message: 'Employee deleted successfully', employeeId: employee.employeeId };
  }

  static async listSubordinates(orgId: string, managerId: string) {
    const users = await prisma.user.findMany({
      where: { orgId, managerId },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      include: {
        department: {
          select: { id: true, name: true, code: true }
        },
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            businessEmail: true,
            personalEmail: true,
            jobTitle: true,
            employeeId: true
          }
        },
        roles: {
          include: {
            role: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    return users.map((u) => {
      const { hashedPassword: _p, refreshToken: _rt, ...safeUser } = u;
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ');
      return {
        ...safeUser,
        name: fullName ? fullName : u.email,
        personalEmail: u.personalEmail ?? u.email,
        businessEmail: u.businessEmail ?? null
      };
    });
  }

  static async getEmployeePermissions(orgId: string, id: string) {
    const employee = await this.getEmployeeById(orgId, id);
    const permissions = new Map<string, unknown>();

    const roles = Array.isArray(employee.roles) ? employee.roles : [];
    for (const item of roles) {
      const userRole = item as { role?: { permissions?: { permission?: { id?: string } }[] } };
      for (const rolePermission of userRole.role?.permissions ?? []) {
        if (rolePermission.permission?.id) {
          permissions.set(rolePermission.permission.id, rolePermission.permission);
        }
      }
    }

    return Array.from(permissions.values());
  }

  static async generateEmployeeId(orgId: string) {
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true }
    });

    const orgPrefix = organization?.name
      ? organization.name
          .split(' ')
          .map((w) => w.charAt(0))
          .join('')
          .toUpperCase()
          .slice(0, 4)
      : 'EMP';

    const now = new Date();
    const yearMonth = now.getFullYear().toString().slice(-2) + (now.getMonth() + 1).toString().padStart(2, '0');

    let counter = 1;
    let candidateId = `${orgPrefix}${yearMonth}${counter.toString().padStart(3, '0')}`;

    while (await prisma.user.findFirst({ where: { orgId, employeeId: candidateId } })) {
      counter++;
      candidateId = `${orgPrefix}${yearMonth}${counter.toString().padStart(3, '0')}`;
    }

    return { employeeId: candidateId };
  }

  static async checkEmployeeId(orgId: string, employeeId: string) {
    const existing = await prisma.user.findFirst({
      where: { orgId, employeeId }
    });
    return { available: !existing };
  }
}
