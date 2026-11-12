export const PERMISSION_KEYS = {
  userRead: 'view_employee_management',
  userWrite: 'create_user',
  roleManage: 'manage_role',
  departmentManage: 'create_new_department',
  viewSubordinates: 'view_personal_info_of_subordinates'
} as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];
