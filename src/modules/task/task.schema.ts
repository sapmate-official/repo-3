import { z } from 'zod';

export const taskPriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const taskStatusEnum = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'ON_HOLD'
]);
export const groupRoleEnum = z.enum(['ADMIN', 'MEMBER']);
export const assignmentStatusEnum = z.enum([
  'ASSIGNED',
  'ACCEPTED',
  'DECLINED',
  'REJECTED',
  'IN_PROGRESS',
  'COMPLETED'
]);
export const updateTypeEnum = z.enum([
  'STATUS_CHANGE',
  'PROGRESS_UPDATE',
  'COMMENT',
  'ATTACHMENT',
  'COMPLETION',
  'REJECTION'
]);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().trim().optional(),
  priority: taskPriorityEnum.default('MEDIUM'),
  status: taskStatusEnum.default('PENDING'),
  dueDate: z.string().datetime().or(z.string()).optional(),
  groupId: z.string().trim().optional(),
  assignedToIds: z.array(z.string().trim()).optional(),
  assignees: z.array(z.string().trim()).optional(),
  tags: z.array(z.string().trim()).optional(),
  estimatedHours: z.number().nonnegative().optional()
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().nullable().optional(),
  priority: taskPriorityEnum.optional(),
  status: taskStatusEnum.optional(),
  dueDate: z.string().datetime().or(z.string()).nullable().optional(),
  groupId: z.string().trim().nullable().optional(),
  tags: z.array(z.string().trim()).optional(),
  estimatedHours: z.number().nonnegative().nullable().optional()
});

export const assignTaskSchema = z.object({
  userIds: z.array(z.string().trim()).min(1, 'At least one userId is required')
});

export const unassignTaskSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required')
});

export const updateAssignmentStatusSchema = z.object({
  status: assignmentStatusEnum
});

export const createTaskUpdateSchema = z.object({
  message: z.string().trim().min(1, 'Message is required'),
  updateType: updateTypeEnum.default('COMMENT'),
  status: taskStatusEnum.optional(),
  progress: z.number().int().min(0).max(100).optional()
});

export const createTaskGroupSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required').max(255),
  description: z.string().trim().optional(),
  members: z.array(z.string().trim()).optional()
});

export const updateTaskGroupSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().nullable().optional()
});

export const addGroupMembersSchema = z.object({
  userIds: z.array(z.string().trim()).min(1, 'userIds array is required'),
  role: groupRoleEnum.default('MEMBER')
});

export const removeGroupMembersSchema = z.object({
  userIds: z.array(z.string().trim()).min(1, 'userIds array is required')
});

export const updateMemberRoleSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  role: groupRoleEnum
});

export const whatsappNotificationSchema = z.object({
  phoneNumbers: z.array(z.string().trim()).min(1, 'Phone numbers array is required'),
  message: z.string().trim().min(1, 'Message is required'),
  taskId: z.string().optional(),
  taskTitle: z.string().optional()
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;
export type CreateTaskUpdateInput = z.infer<typeof createTaskUpdateSchema>;
export type CreateTaskGroupInput = z.infer<typeof createTaskGroupSchema>;
export type UpdateTaskGroupInput = z.infer<typeof updateTaskGroupSchema>;
export type AddGroupMembersInput = z.infer<typeof addGroupMembersSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type WhatsAppNotificationInput = z.infer<typeof whatsappNotificationSchema>;
