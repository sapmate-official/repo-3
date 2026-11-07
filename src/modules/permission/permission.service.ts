import prisma from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';

export class PermissionService {
  static async listPermissions() {
    let permissions = await prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { name: 'asc' }]
    });

    if (permissions.length === 0) {
      // Auto-seed standard permissions
      const standardPerms = [
        { name: 'View Personal Info', description: 'View own personal profile and employment details', module: 'Employee', action: 'read', key: 'view_personal_info_to_myself' },
        { name: 'Mark Attendance', description: 'Clock in and clock out for daily work session', module: 'Attendance', action: 'create', key: 'mark_attendance' },
        { name: 'Leave Request', description: 'Submit leave applications to manager', module: 'Leave', action: 'create', key: 'leave_request' },
        { name: 'View Salary Slip', description: 'View and download own monthly payslips', module: 'Payroll', action: 'read', key: 'view_salary_slip_to_myself' },
        { name: 'View Subordinates', description: 'View team members reporting directly', module: 'Manager', action: 'read', key: 'view_subordinates' },
        { name: 'Approve Leave', description: 'Approve or reject leave requests from direct reports', module: 'Leave', action: 'update', key: 'approve_leave' },
        { name: 'Manage Team', description: 'Assign tasks and coordinate department members', module: 'Manager', action: 'update', key: 'manage_team' },
        { name: 'Create User', description: 'Create and register new employees', module: 'Employee', action: 'create', key: 'user_create' },
        { name: 'Read User', description: 'Read details of organization staff', module: 'Employee', action: 'read', key: 'user_read' },
        { name: 'Manage Departments', description: 'Create and modify department structure', module: 'Department', action: 'manage', key: 'department_create' },
        { name: 'Manage Roles', description: 'Configure organization roles and assign access', module: 'Role', action: 'manage', key: 'role_manage' }
      ];

      for (const p of standardPerms) {
        await prisma.permission.create({ data: p });
      }

      permissions = await prisma.permission.findMany({
        orderBy: [{ module: 'asc' }, { name: 'asc' }]
      });
    }

    return permissions;
  }

  static async getById(id: string) {
    const permission = await prisma.permission.findUnique({ where: { id } });
    if (!permission) {
      throw new AppError('Permission not found', 404, 'PERMISSION_NOT_FOUND');
    }
    return permission;
  }

  static async create(data: { name: string; description?: string; module?: string; action: string; key?: string }) {
    return await prisma.permission.create({
      data: {
        name: data.name,
        description: data.description,
        module: data.module,
        action: data.action,
        key: data.key
      }
    });
  }

  static async update(id: string, data: { name?: string; description?: string; module?: string; action?: string; key?: string }) {
    return await prisma.permission.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.module !== undefined ? { module: data.module } : {}),
        ...(data.action ? { action: data.action } : {}),
        ...(data.key !== undefined ? { key: data.key } : {})
      }
    });
  }

  static async delete(id: string) {
    await prisma.rolePermission.deleteMany({ where: { permissionId: id } });
    await prisma.permission.delete({ where: { id } });
    return { success: true };
  }
}
