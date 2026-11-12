import prisma from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';

export interface CreatePermissionInput {
  name: string;
  description?: string;
  module?: string;
  action: string;
  key?: string;
}

export interface UpdatePermissionInput {
  name?: string;
  description?: string;
  module?: string;
  action?: string;
  key?: string;
}

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
        { name: 'View Subordinates', description: 'View team members reporting directly', module: 'user', action: 'view_subordinates', key: 'view_personal_info_of_subordinates' },
        { name: 'Approve Leave', description: 'Approve or reject leave requests from direct reports', module: 'Leave', action: 'update', key: 'approve_leave' },
        { name: 'Create User', description: 'Create and register new employees', module: 'user', action: 'create', key: 'create_user' },
        { name: 'View Employee Management', description: 'Read details of organization staff', module: 'user', action: 'view', key: 'view_employee_management' },
        { name: 'Create Department', description: 'Create new departments', module: 'Department', action: 'create', key: 'create_new_department' },
        { name: 'Edit Department', description: 'Edit department details', module: 'Department', action: 'edit', key: 'edit_department' },
        { name: 'Delete Department', description: 'Delete departments', module: 'Department', action: 'delete', key: 'delete_department' },
        { name: 'Change Department Head', description: 'Assign or change a department head', module: 'Department', action: 'edit', key: 'change_department_head' },
        { name: 'Update Own Personal Info', description: 'Update own personal details', module: 'user', action: 'update', key: 'update_personal_info' },
        { name: 'Update Own Employee Info', description: 'Update own employment details', module: 'user', action: 'update', key: 'update_employee_own' },
        { name: 'Update Own Salary Info', description: 'Update own salary details', module: 'user', action: 'update', key: 'update_salary_own' },
        { name: 'Update All User Personal Info', description: 'Update personal details for all users', module: 'user', action: 'update', key: 'update_personal_info_all_user' },
        { name: 'Update Subordinate Personal Info', description: 'Update personal details for subordinates', module: 'user', action: 'update', key: 'update_personal_info_subordinates' },
        { name: 'Update All User Employee Info', description: 'Update employment details for all users', module: 'user', action: 'update', key: 'update_employee_info_all_user' },
        { name: 'Update All User Salary Info', description: 'Update salary details for all users', module: 'user', action: 'update', key: 'update_salary_all_user' },
        { name: 'Update Subordinate Salary Info', description: 'Update salary details for subordinates', module: 'user', action: 'update', key: 'update_salary_subordinates' },
        { name: 'Manage Roles', description: 'Configure organization roles and assign access', module: 'user', action: 'manage_roles', key: 'manage_role' }
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
