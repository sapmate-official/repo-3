import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import type {
  CreateOrganizationInput,
  ListOrganizationsQuery,
  UpdateOrganizationInput
} from './organization.schema.js';

const ORG_ADMIN_ROLE = 'Org_Admin';

interface OrganizationCounts {
  users: number;
  departments: number;
  roles: number;
  Organization_admin: number;
}

interface OrganizationRecord {
  id: string;
  name: string;
  industry: string | null;
  logo: string | null;
  address: string | null;
  timezone: string | null;
  subscriptionStart: Date;
  subscriptionEnd: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: OrganizationCounts;
}

interface AdminRecord {
  id: string;
  createdAt: Date;
  admin_user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    status: string;
    department: { id: string; name: string } | null;
    roles: { role: { id: string; name: string } }[];
  };
}

const organizationInclude = {
  _count: {
    select: {
      users: true,
      departments: true,
      roles: true,
      Organization_admin: true
    }
  }
} as const;

const adminInclude = {
  admin_user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      department: { select: { id: true, name: true } },
      roles: { select: { role: { select: { id: true, name: true } } } }
    }
  }
} as const;

const isKnownPrismaError = (
  error: unknown,
  code: string
): error is Prisma.PrismaClientKnownRequestError =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

const toOrganizationDto = (organization: OrganizationRecord) => ({
  id: organization.id,
  name: organization.name,
  industry: organization.industry,
  logo: organization.logo,
  address: organization.address,
  timezone: organization.timezone,
  subscriptionStart: organization.subscriptionStart,
  subscriptionEnd: organization.subscriptionEnd,
  isActive: organization.isActive,
  createdAt: organization.createdAt,
  updatedAt: organization.updatedAt,
  counts: {
    users: organization._count.users,
    departments: organization._count.departments,
    roles: organization._count.roles,
    admins: organization._count.Organization_admin
  }
});

const toAdminDto = (admin: AdminRecord) => ({
  id: admin.id,
  userId: admin.admin_user.id,
  email: admin.admin_user.email,
  firstName: admin.admin_user.firstName,
  lastName: admin.admin_user.lastName,
  status: admin.admin_user.status,
  department: admin.admin_user.department,
  roles: admin.admin_user.roles.map((userRole) => userRole.role.name),
  createdAt: admin.createdAt
});

const organizationNotFound = (): AppError =>
  new AppError('Organization not found.', 404, 'ORGANIZATION_NOT_FOUND');

const settingsValue = (
  value: Record<string, unknown> | null | undefined
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return Prisma.DbNull;
  }
  return value as Prisma.InputJsonValue;
};

const assertOrganizationExists = async (orgId: string): Promise<void> => {
  const organization = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true }
  });

  if (!organization) {
    throw organizationNotFound();
  }
};

export class OrganizationService {
  static async list(input: ListOrganizationsQuery) {
    const where: Prisma.OrganizationWhereInput = {};

    if (input.search) {
      where.OR = [
        { name: { contains: input.search, mode: 'insensitive' } },
        { industry: { contains: input.search, mode: 'insensitive' } }
      ];
    }

    if (input.isActive !== undefined) {
      where.isActive = input.isActive;
    }

    const skip = (input.page - 1) * input.limit;
    const [total, organizations] = await prisma.$transaction([
      prisma.organization.count({ where }),
      prisma.organization.findMany({
        where,
        include: organizationInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: input.limit
      })
    ]);

    return {
      data: organizations.map(toOrganizationDto),
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit)
      }
    };
  }

  static async get(orgId: string) {
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      include: organizationInclude
    });

    if (!organization) {
      throw organizationNotFound();
    }

    return toOrganizationDto(organization);
  }

  static async create(input: CreateOrganizationInput) {
    const organization = await prisma.organization.create({
      data: {
        name: input.name,
        industry: input.industry,
        logo: input.logo,
        address: input.address,
        timezone: input.timezone,
        subscriptionStart: input.subscriptionStart,
        subscriptionEnd: input.subscriptionEnd,
        isActive: input.isActive,
        settings: settingsValue(input.settings),
        subscriptionPlanId: input.subscriptionPlanId
      },
      include: organizationInclude
    });

    return toOrganizationDto(organization);
  }

  static async update(orgId: string, input: UpdateOrganizationInput) {
    try {
      const organization = await prisma.organization.update({
        where: { id: orgId },
        data: {
          name: input.name,
          industry: input.industry,
          logo: input.logo,
          address: input.address,
          timezone: input.timezone,
          subscriptionStart: input.subscriptionStart,
          subscriptionEnd: input.subscriptionEnd,
          isActive: input.isActive,
          settings: settingsValue(input.settings),
          subscriptionPlanId: input.subscriptionPlanId
        },
        include: organizationInclude
      });

      return toOrganizationDto(organization);
    } catch (error) {
      if (isKnownPrismaError(error, 'P2025')) {
        throw organizationNotFound();
      }
      throw error;
    }
  }

  static async remove(orgId: string): Promise<void> {
    try {
      await prisma.organization.delete({ where: { id: orgId } });
    } catch (error) {
      if (isKnownPrismaError(error, 'P2025')) {
        throw organizationNotFound();
      }
      if (isKnownPrismaError(error, 'P2003')) {
        throw new AppError(
          'Organization still has related records. Deactivate it instead of deleting it.',
          409,
          'ORGANIZATION_NOT_EMPTY'
        );
      }
      throw error;
    }
  }

  static async listAdmins(orgId: string) {
    await assertOrganizationExists(orgId);

    const admins = await prisma.organization_admin.findMany({
      where: { orgId },
      include: adminInclude,
      orderBy: { createdAt: 'asc' }
    });

    return admins.map(toAdminDto);
  }

  static async setAdmin(orgId: string, userId: string) {
    return prisma.$transaction(
      async (tx) => {
        const organization = await tx.organization.findUnique({
          where: { id: orgId },
          select: { id: true, isActive: true }
        });

        if (!organization) {
          throw organizationNotFound();
        }
        if (!organization.isActive) {
          throw new AppError('Organization is inactive.', 409, 'ORGANIZATION_INACTIVE');
        }

        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, orgId: true }
        });

        if (!user) {
          throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
        }
        if (user.orgId !== orgId) {
          throw new AppError(
            'User does not belong to this organization.',
            403,
            'USER_ORG_MISMATCH'
          );
        }

        const existingAdmin = await tx.organization_admin.findFirst({
          where: { orgId, adminId: userId }
        });

        const admin =
          existingAdmin ??
          (await tx.organization_admin.create({
            data: { orgId, adminId: userId }
          }));

        const role = await tx.role.upsert({
          where: { orgId_name: { orgId, name: ORG_ADMIN_ROLE } },
          update: {},
          create: {
            orgId,
            name: ORG_ADMIN_ROLE,
            description: 'Organization administrator',
            isDefault: true
          }
        });

        await tx.userRole.upsert({
          where: { userId_roleId: { userId, roleId: role.id } },
          update: {},
          create: { userId, roleId: role.id }
        });

        return { id: admin.id, userId, orgId, roleId: role.id };
      },
      { timeout: 15_000 }
    );
  }

  static async removeAdmin(orgId: string, adminId: string): Promise<void> {
    await prisma.$transaction(
      async (tx) => {
        const admin = await tx.organization_admin.findFirst({
          where: { orgId, adminId }
        });

        if (!admin) {
          throw new AppError('Admin assignment not found.', 404, 'ADMIN_NOT_FOUND');
        }

        await tx.organization_admin.delete({ where: { id: admin.id } });

        const role = await tx.role.findUnique({
          where: { orgId_name: { orgId, name: ORG_ADMIN_ROLE } },
          select: { id: true }
        });

        if (role) {
          await tx.userRole.deleteMany({
            where: { userId: adminId, roleId: role.id }
          });
        }
      },
      { timeout: 15_000 }
    );
  }
}
