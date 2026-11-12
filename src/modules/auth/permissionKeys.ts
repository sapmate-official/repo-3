export const PERMISSION_KEYS = {
  userRead: 'view_employee_management',
  userWrite: 'create_user',
  roleManage: 'manage_role',
  departmentCreate: 'create_new_department',
  departmentUpdate: 'edit_department',
  departmentDelete: 'delete_department',
  departmentHead: 'change_department_head',
  viewSubordinates: 'view_personal_info_of_subordinates',
  personalSelfUpdate: 'update_personal_info',
  employeeSelfUpdate: 'update_employee_own',
  salarySelfUpdate: 'update_salary_own',
  personalAllUpdate: 'update_personal_info_all_user',
  leaveTypeRead: 'read_leave_type',
  leaveTypeCreate: 'leave_type_create',
  leaveTypeUpdate: 'update_leave_types',
  leaveTypeDelete: 'delete_leave_type',
  leaveRequestCreate: 'leave_request',
  leaveApprove: 'approve_leave',
  leaveReject: 'reject_leave',
  leaveSubordinatesView: 'view_subordinates_leave',
  leaveAllView: 'view_all_user_leave',
  leaveBalanceView: 'view_leave_balance',
  leaveBalanceManage: 'manage_leave_balance'
} as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];
