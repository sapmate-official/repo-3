import type { NextFunction, Request, Response } from 'express';
import axios from 'axios';
import { AppError } from '../../util/errors.js';
import { logger } from '../../config/logger.js';
import { TaskService, TaskGroupService, type TaskActor } from './task.service.js';
import {
  addGroupMembersSchema,
  assignTaskSchema,
  createTaskGroupSchema,
  createTaskSchema,
  createTaskUpdateSchema,
  unassignTaskSchema,
  updateAssignmentStatusSchema,
  updateMemberRoleSchema,
  updateTaskGroupSchema,
  updateTaskSchema,
  whatsappNotificationSchema
} from './task.schema.js';

const strParam = (val: unknown): string | undefined => {
  if (Array.isArray(val)) {
    const first: unknown = val[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
};

const getActor = (req: Request): TaskActor => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }
  return req.user;
};

const getOrgId = (req: Request): string => {
  const actor = getActor(req);
  const orgId =
    actor.orgId ??
    strParam(req.query.orgId) ??
    strParam(req.headers['x-org-id']);

  if (!orgId) {
    throw new AppError('Organization context required', 400, 'ORG_REQUIRED');
  }
  return orgId;
};

export class TaskController {
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const input = createTaskSchema.parse(req.body);

      const task = await TaskService.createTask(actor, orgId, input);
      res.status(201).json({
        success: true,
        message: 'Task created successfully',
        data: task
      });
    } catch (error) {
      next(error);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);

      const page = typeof req.query.page === 'string' ? parseInt(req.query.page, 10) : undefined;
      const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
      const status = strParam(req.query.status);
      const priority = strParam(req.query.priority);
      const assignedTo = strParam(req.query.assignedTo);
      const groupId = strParam(req.query.groupId);

      const result = await TaskService.listTasks(actor, orgId, {
        page,
        limit,
        status,
        priority,
        assignedTo,
        groupId
      });

      res.status(200).json({
        success: true,
        data: result.tasks,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Task ID is required', 400, 'TASK_ID_REQUIRED');

      const task = await TaskService.getTaskById(actor, orgId, id);
      res.status(200).json({
        success: true,
        data: task
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Task ID is required', 400, 'TASK_ID_REQUIRED');

      const input = updateTaskSchema.parse(req.body);
      const updated = await TaskService.updateTask(actor, orgId, id, input);

      res.status(200).json({
        success: true,
        message: 'Task updated successfully',
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  static async patch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Task ID is required', 400, 'TASK_ID_REQUIRED');

      const input = updateTaskSchema.parse(req.body);
      const updated = await TaskService.updateTask(actor, orgId, id, input);

      res.status(200).json({
        success: true,
        message: 'Task updated successfully',
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Task ID is required', 400, 'TASK_ID_REQUIRED');

      const result = await TaskService.deleteTask(actor, orgId, id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async listByUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const userId = strParam(req.params.userId) ?? strParam(req.params.id) ?? actor.id;

      const tasks = await TaskService.listUserTasks(actor, orgId, userId);
      res.status(200).json({
        success: true,
        data: tasks
      });
    } catch (error) {
      next(error);
    }
  }

  static async listByManager(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const managerId = strParam(req.params.managerId) ?? strParam(req.params.id) ?? actor.id;

      const tasks = await TaskService.listManagerTasks(actor, orgId, managerId);
      res.status(200).json({
        success: true,
        data: tasks
      });
    } catch (error) {
      next(error);
    }
  }

  static async listByGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const groupId = strParam(req.params.groupId) ?? strParam(req.params.id);
      if (!groupId) throw new AppError('Group ID is required', 400, 'GROUP_ID_REQUIRED');

      const tasks = await TaskService.listGroupTasks(actor, orgId, groupId);
      res.status(200).json({
        success: true,
        data: tasks
      });
    } catch (error) {
      next(error);
    }
  }

  static async addUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const taskId = strParam(req.params.taskId) ?? strParam(req.params.id);
      if (!taskId) throw new AppError('Task ID is required', 400, 'TASK_ID_REQUIRED');

      const input = createTaskUpdateSchema.parse(req.body);
      const update = await TaskService.addTaskUpdate(actor, orgId, taskId, input);

      res.status(201).json({
        success: true,
        message: 'Task update added successfully',
        data: update
      });
    } catch (error) {
      next(error);
    }
  }

  static async listUpdates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const taskId = strParam(req.params.taskId) ?? strParam(req.params.id);
      if (!taskId) throw new AppError('Task ID is required', 400, 'TASK_ID_REQUIRED');

      const updates = await TaskService.listTaskUpdates(actor, orgId, taskId);
      res.status(200).json({
        success: true,
        data: updates
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const taskId = strParam(req.params.taskId);
      const updateId = strParam(req.params.updateId);
      if (!taskId || !updateId) {
        throw new AppError('Task ID and Update ID are required', 400, 'IDENTIFIERS_REQUIRED');
      }

      const result = await TaskService.deleteTaskUpdate(actor, orgId, taskId, updateId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async assign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const taskId = strParam(req.params.taskId) ?? strParam(req.params.id);
      if (!taskId) throw new AppError('Task ID is required', 400, 'TASK_ID_REQUIRED');

      const input = assignTaskSchema.parse(req.body);
      const assignments = await TaskService.assignTask(actor, orgId, taskId, input);

      res.status(201).json({
        success: true,
        message: 'Task assigned successfully',
        data: assignments
      });
    } catch (error) {
      next(error);
    }
  }

  static async unassign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const taskId = strParam(req.params.taskId) ?? strParam(req.params.id);
      if (!taskId) throw new AppError('Task ID is required', 400, 'TASK_ID_REQUIRED');

      const input = unassignTaskSchema.parse(req.body);
      const result = await TaskService.unassignTask(actor, orgId, taskId, input.userId);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async listAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const taskId = strParam(req.params.taskId) ?? strParam(req.params.id);
      if (!taskId) throw new AppError('Task ID is required', 400, 'TASK_ID_REQUIRED');

      const assignments = await TaskService.listAssignments(actor, orgId, taskId);
      res.status(200).json({
        success: true,
        data: assignments
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateAssignmentStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const assignmentId = strParam(req.params.assignmentId) ?? strParam(req.params.id);
      if (!assignmentId) throw new AppError('Assignment ID is required', 400, 'ASSIGNMENT_ID_REQUIRED');

      const input = updateAssignmentStatusSchema.parse(req.body);
      const updated = await TaskService.updateAssignmentStatus(actor, orgId, assignmentId, input.status);

      res.status(200).json({
        success: true,
        message: 'Assignment status updated',
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }
}

export class TaskGroupController {
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const input = createTaskGroupSchema.parse(req.body);

      const group = await TaskGroupService.createGroup(actor, orgId, input);
      res.status(201).json({
        success: true,
        message: 'Task group created successfully',
        data: group
      });
    } catch (error) {
      next(error);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);

      const groups = await TaskGroupService.listGroups(actor, orgId);
      res.status(200).json({
        success: true,
        data: groups
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Group ID is required', 400, 'GROUP_ID_REQUIRED');

      const group = await TaskGroupService.getGroupById(actor, orgId, id);
      res.status(200).json({
        success: true,
        data: group
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Group ID is required', 400, 'GROUP_ID_REQUIRED');

      const input = updateTaskGroupSchema.parse(req.body);
      const updated = await TaskGroupService.updateGroup(actor, orgId, id, input);

      res.status(200).json({
        success: true,
        message: 'Task group updated successfully',
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Group ID is required', 400, 'GROUP_ID_REQUIRED');

      const result = await TaskGroupService.deleteGroup(actor, orgId, id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  static async addMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Group ID is required', 400, 'GROUP_ID_REQUIRED');

      const input = addGroupMembersSchema.parse(req.body);
      const result = await TaskGroupService.addMembers(actor, orgId, id, input);

      res.status(200).json({
        success: true,
        message: 'Members added to task group successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  static async removeMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Group ID is required', 400, 'GROUP_ID_REQUIRED');

      const { userIds } = req.body as { userIds?: string[] };
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        throw new AppError('userIds array is required', 400, 'USER_IDS_REQUIRED');
      }

      const result = await TaskGroupService.removeMembers(actor, orgId, id, userIds);
      res.status(200).json({
        success: true,
        message: 'Members removed from task group successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = getActor(req);
      const orgId = getOrgId(req);
      const id = strParam(req.params.id);
      if (!id) throw new AppError('Group ID is required', 400, 'GROUP_ID_REQUIRED');

      const input = updateMemberRoleSchema.parse(req.body);
      const result = await TaskGroupService.updateMemberRole(actor, orgId, id, input);

      res.status(200).json({
        success: true,
        message: 'Member role updated successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

export class WhatsAppController {
  static async sendNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      getActor(req);
      const input = whatsappNotificationSchema.parse(req.body);

      const whatsappApiUrl = process.env.WHATSAPP_API_URL;
      const whatsappApiKey = process.env.WHATSAPP_API_KEY;

      if (!whatsappApiUrl || !whatsappApiKey) {
        // Return success with warning when WhatsApp credentials are not configured in environment
        res.status(200).json({
          success: true,
          message: 'WhatsApp notification skipped: service not configured in environment'
        });
        return;
      }

      const taskMessage = input.taskTitle
        ? `📋 *Task Assignment: ${input.taskTitle}*\n\n${input.message}\n\n*Task ID:* ${input.taskId ?? 'N/A'}`
        : input.message;

      for (const phone of input.phoneNumbers) {
        try {
          await axios.post(
            whatsappApiUrl,
            { phone, message: taskMessage, apikey: whatsappApiKey },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${whatsappApiKey}`
              },
              timeout: 10000
            }
          );
        } catch (postErr) {
          logger.warn({ postErr, phone }, 'Failed to dispatch individual WhatsApp notification');
        }
      }

      res.status(200).json({
        success: true,
        message: 'WhatsApp notification processed'
      });
    } catch (error) {
      next(error);
    }
  }
}
