import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';

export interface DepartmentCreateInput {
  name: string;
  description?: string;
  code?: string;
  headId?: string | null;
  parentId?: string | null;
  location?: string | null;
  budget?: number | null;
  status?: boolean;
}

export interface DepartmentUpdateInput extends Partial<DepartmentCreateInput> {}

export class DepartmentService {
  static async listDepartments(orgId: string) {
    return prisma.department.findMany({
      where: { orgId },
      include: {
        departmentHead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            businessEmail: true,
            jobTitle: true,
            employeeId: true
          }
        },
        parentDepartment: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        subDepartments: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true
          }
        },
        _count: {
          select: {
            users: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });
  }

  static async getDepartmentById(orgId: string, departmentId: string) {
    const department = await prisma.department.findFirst({
      where: { id: departmentId, orgId },
      include: {
        departmentHead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            businessEmail: true,
            jobTitle: true,
            employeeId: true
          }
        },
        parentDepartment: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        subDepartments: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true
          }
        },
        users: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            businessEmail: true,
            jobTitle: true,
            employeeId: true,
            status: true
          }
        }
      }
    });

    if (!department) {
      throw new AppError('Department not found in your organization.', 404, 'DEPARTMENT_NOT_FOUND');
    }

    return department;
  }

  static async createDepartment(orgId: string, data: DepartmentCreateInput) {
    // Check if name or code already exists in this org
    const existing = await prisma.department.findFirst({
      where: {
        orgId,
        OR: [
          { name: { equals: data.name, mode: 'insensitive' as const } },
          ...(data.code ? [{ code: { equals: data.code, mode: 'insensitive' as const } }] : [])
        ]
      }
    });

    if (existing) {
      throw new AppError('A department with this name or code already exists in your organization.', 409, 'DEPARTMENT_EXISTS');
    }

    // Validate headId belongs to the same org if provided
    if (data.headId) {
      const headUser = await prisma.user.findFirst({
        where: { id: data.headId, orgId }
      });
      if (!headUser) {
        throw new AppError('Assigned department head not found in your organization.', 400, 'INVALID_DEPARTMENT_HEAD');
      }
    }

    // Validate parentId belongs to the same org if provided
    if (data.parentId) {
      const parentDept = await prisma.department.findFirst({
        where: { id: data.parentId, orgId }
      });
      if (!parentDept) {
        throw new AppError('Parent department not found in your organization.', 400, 'INVALID_PARENT_DEPARTMENT');
      }
    }

    return prisma.department.create({
      data: {
        orgId,
        name: data.name,
        description: data.description,
        code: data.code,
        headId: data.headId || null,
        parentId: data.parentId || null,
        location: data.location || null,
        budget: data.budget ?? null,
        status: data.status ?? true
      },
      include: {
        departmentHead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            businessEmail: true
          }
        }
      }
    });
  }

  static async updateDepartment(orgId: string, departmentId: string, data: DepartmentUpdateInput) {
    await this.getDepartmentById(orgId, departmentId);

    if (data.name || data.code) {
      const conflict = await prisma.department.findFirst({
        where: {
          orgId,
          id: { not: departmentId },
          OR: [
            ...(data.name ? [{ name: { equals: data.name, mode: 'insensitive' as const } }] : []),
            ...(data.code ? [{ code: { equals: data.code, mode: 'insensitive' as const } }] : [])
          ]
        }
      });
      if (conflict) {
        throw new AppError('Another department with this name or code already exists.', 409, 'DEPARTMENT_EXISTS');
      }
    }

    return prisma.department.update({
      where: { id: departmentId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.headId !== undefined ? { headId: data.headId } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
        ...(data.budget !== undefined ? { budget: data.budget } : {}),
        ...(data.status !== undefined ? { status: data.status } : {})
      },
      include: {
        departmentHead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            businessEmail: true
          }
        }
      }
    });
  }

  static async deleteDepartment(orgId: string, departmentId: string) {
    await this.getDepartmentById(orgId, departmentId);

    // Check if any employees belong to this department
    const userCount = await prisma.user.count({
      where: { departmentId, orgId }
    });

    if (userCount > 0) {
      throw new AppError(
        `Cannot delete department because it has ${userCount} active employee(s) assigned. Reassign them first.`,
        400,
        'DEPARTMENT_NOT_EMPTY'
      );
    }

    await prisma.department.delete({
      where: { id: departmentId }
    });

    return { message: 'Department deleted successfully' };
  }
}
