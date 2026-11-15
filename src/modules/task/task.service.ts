import {
  ActivityAction,
  ActivityEntity,
  type AssignmentStatus,
  type Prisma,
  type TaskPriority,
  type TaskStatus
} from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';
import { logActivity } from '../../util/activityLogger.js';
import type {
  AddGroupMembersInput,
  AssignTaskInput,
  CreateTaskGroupInput,
  CreateTaskInput,
  CreateTaskUpdateInput,
  UpdateMemberRoleInput,
  UpdateTaskGroupInput,
  UpdateTaskInput
} from './task.schema.js';

export interface TaskActor {
  id: string;
  orgId?: string;
  roles?: string[];
  permissions?: string[];
  isSuperAdmin?: boolean;
}

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true
} as const;

export class TaskService {
  /**
   * Create a new task with optional initial assignments
   */
  static async createTask(actor: TaskActor, orgId: string, input: CreateTaskInput) {
    if (input.groupId) {
      const group = await prisma.taskGroup.findFirst({
        where: { id: input.groupId, orgId }
      });
      if (!group) {
        throw new AppError('Task group not found in this organization', 404, 'GROUP_NOT_FOUND');
      }
    }

    const dueDate = input.dueDate ? new Date(input.dueDate) : null;
    const task = await prisma.task.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? 'MEDIUM',
        status: input.status ?? 'PENDING',
        dueDate,
        createdById: actor.id,
        orgId,
        groupId: input.groupId ?? null,
        tags: input.tags ?? [],
        estimatedHours: input.estimatedHours ?? null
      },
      include: {
        createdBy: { select: userSelect },
        group: { select: { id: true, name: true } },
        assignments: {
          include: {
            assignedTo: { select: userSelect },
            assignedBy: { select: userSelect }
          }
        },
        updates: {
          include: { updatedBy: { select: userSelect } },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    const userIdsToAssign = input.assignedToIds ?? input.assignees;
    if (userIdsToAssign && userIdsToAssign.length > 0) {
      const validUsers = await prisma.user.findMany({
        where: { id: { in: userIdsToAssign }, orgId },
        select: { id: true }
      });
      const validUserIds = validUsers.map((u) => u.id);

      if (validUserIds.length > 0) {
        await prisma.taskAssignment.createMany({
          data: validUserIds.map((targetUserId) => ({
            taskId: task.id,
            assignedToId: targetUserId,
            assignedById: actor.id,
            status: 'ASSIGNED'
          })),
          skipDuplicates: true
        });
      }
    }

    await logActivity({
      orgId,
      actorId: actor.id,
      action: ActivityAction.CREATE,
      entity: ActivityEntity.TASK,
      entityId: task.id,
      description: `Created task: ${task.title}`,
      metadata: { taskId: task.id }
    });

    return this.getTaskById(actor, orgId, task.id);
  }

  /**
   * List tasks for organization with filtering and pagination
   */
  static async listTasks(
    actor: TaskActor,
    orgId: string,
    filters?: {
      status?: string;
      priority?: string;
      assignedTo?: string;
      groupId?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const page = Math.max(1, filters?.page ?? 1);
    const limit = Math.max(1, Math.min(100, filters?.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = { orgId };

    if (filters?.status) {
      where.status = filters.status.toUpperCase() as TaskStatus;
    }

    if (filters?.priority) {
      where.priority = filters.priority.toUpperCase() as TaskPriority;
    }

    if (filters?.groupId) {
      where.groupId = filters.groupId;
    }

    if (filters?.assignedTo === 'me') {
      where.assignments = { some: { assignedToId: actor.id } };
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          createdBy: { select: userSelect },
          group: { select: { id: true, name: true } },
          assignments: {
            include: {
              assignedTo: { select: userSelect },
              assignedBy: { select: userSelect }
            }
          },
          updates: {
            include: { updatedBy: { select: userSelect } },
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.task.count({ where })
    ]);

    return {
      tasks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get single task by ID
   */
  static async getTaskById(actor: TaskActor, orgId: string, id: string) {
    const task = await prisma.task.findFirst({
      where: { id, orgId },
      include: {
        createdBy: { select: userSelect },
        group: { select: { id: true, name: true } },
        assignments: {
          include: {
            assignedTo: { select: userSelect },
            assignedBy: { select: userSelect }
          }
        },
        updates: {
          include: { updatedBy: { select: userSelect } },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!task) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }

    return task;
  }

  /**
   * Update task fields
   */
  static async updateTask(
    actor: TaskActor,
    orgId: string,
    id: string,
    input: UpdateTaskInput
  ) {
    const existing = await prisma.task.findFirst({
      where: { id, orgId },
      include: { assignments: { select: { assignedToId: true } } }
    });

    if (!existing) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }

    const isCreator = existing.createdById === actor.id;
    const isAssignee = existing.assignments.some((a) => a.assignedToId === actor.id);
    const isOrgAdmin =
      Boolean(actor.isSuperAdmin) ||
      (actor.roles ?? []).some((r) => ['Org_Admin', 'Admin', 'Manager'].includes(r));

    if (!isCreator && !isAssignee && !isOrgAdmin) {
      throw new AppError('Access denied to update this task', 403, 'FORBIDDEN');
    }

    const data: Prisma.TaskUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.status !== undefined) data.status = input.status;
    if (input.dueDate !== undefined) {
      data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    }
    if (input.groupId !== undefined) {
      data.group = input.groupId ? { connect: { id: input.groupId } } : { disconnect: true };
    }
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.estimatedHours !== undefined) data.estimatedHours = input.estimatedHours;

    const updated = await prisma.task.update({
      where: { id },
      data,
      include: {
        createdBy: { select: userSelect },
        group: { select: { id: true, name: true } },
        assignments: {
          include: {
            assignedTo: { select: userSelect },
            assignedBy: { select: userSelect }
          }
        },
        updates: {
          include: { updatedBy: { select: userSelect } },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    await logActivity({
      orgId,
      actorId: actor.id,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.TASK,
      entityId: id,
      description: `Updated task: ${updated.title}`,
      metadata: { taskId: id }
    });

    return updated;
  }

  /**
   * Delete task
   */
  static async deleteTask(actor: TaskActor, orgId: string, id: string) {
    const existing = await prisma.task.findFirst({
      where: { id, orgId }
    });

    if (!existing) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }

    const isCreator = existing.createdById === actor.id;
    const isOrgAdmin =
      Boolean(actor.isSuperAdmin) ||
      (actor.roles ?? []).some((r) => ['Org_Admin', 'Admin', 'Manager'].includes(r));

    if (!isCreator && !isOrgAdmin) {
      throw new AppError('Only the task creator or managers can delete this task', 403, 'FORBIDDEN');
    }

    await prisma.$transaction([
      prisma.taskAssignment.deleteMany({ where: { taskId: id } }),
      prisma.taskUpdate.deleteMany({ where: { taskId: id } }),
      prisma.task.delete({ where: { id } })
    ]);

    await logActivity({
      orgId,
      actorId: actor.id,
      action: ActivityAction.DELETE,
      entity: ActivityEntity.TASK,
      entityId: id,
      description: `Deleted task: ${existing.title}`,
      metadata: { taskId: id }
    });

    return { success: true, message: 'Task deleted successfully' };
  }

  /**
   * List tasks assigned to a specific user
   */
  static async listUserTasks(actor: TaskActor, orgId: string, userId: string) {
    const isSelf = actor.id === userId;
    const isManagerOrAdmin =
      Boolean(actor.isSuperAdmin) ||
      (actor.roles ?? []).some((r) => ['Org_Admin', 'Admin', 'Manager'].includes(r));

    if (!isSelf && !isManagerOrAdmin) {
      throw new AppError('Access denied', 403, 'FORBIDDEN');
    }

    return prisma.task.findMany({
      where: {
        orgId,
        assignments: { some: { assignedToId: userId } }
      },
      include: {
        createdBy: { select: userSelect },
        group: { select: { id: true, name: true } },
        assignments: {
          include: {
            assignedTo: { select: userSelect },
            assignedBy: { select: userSelect }
          }
        },
        updates: {
          include: { updatedBy: { select: userSelect } },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * List tasks created by a manager
   */
  static async listManagerTasks(actor: TaskActor, orgId: string, managerId: string) {
    const isSelf = actor.id === managerId;
    const isManagerOrAdmin =
      Boolean(actor.isSuperAdmin) ||
      (actor.roles ?? []).some((r) => ['Org_Admin', 'Admin', 'Manager'].includes(r));

    if (!isSelf && !isManagerOrAdmin) {
      throw new AppError('Access denied', 403, 'FORBIDDEN');
    }

    return prisma.task.findMany({
      where: {
        orgId,
        createdById: managerId
      },
      include: {
        createdBy: { select: userSelect },
        group: { select: { id: true, name: true } },
        assignments: {
          include: {
            assignedTo: { select: userSelect },
            assignedBy: { select: userSelect }
          }
        },
        updates: {
          include: { updatedBy: { select: userSelect } },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * List tasks for a specific task group
   */
  static async listGroupTasks(actor: TaskActor, orgId: string, groupId: string) {
    const group = await prisma.taskGroup.findFirst({
      where: { id: groupId, orgId }
    });
    if (!group) {
      throw new AppError('Task group not found', 404, 'GROUP_NOT_FOUND');
    }

    return prisma.task.findMany({
      where: { orgId, groupId },
      include: {
        createdBy: { select: userSelect },
        group: { select: { id: true, name: true } },
        assignments: {
          include: {
            assignedTo: { select: userSelect },
            assignedBy: { select: userSelect }
          }
        },
        updates: {
          include: { updatedBy: { select: userSelect } },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Add a task update or chat message
   */
  static async addTaskUpdate(
    actor: TaskActor,
    orgId: string,
    taskId: string,
    input: CreateTaskUpdateInput
  ) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, orgId },
      include: { assignments: { select: { assignedToId: true } } }
    });

    if (!task) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }

    const isCreator = task.createdById === actor.id;
    const isAssignee = task.assignments.some((a) => a.assignedToId === actor.id);
    const isOrgAdmin =
      Boolean(actor.isSuperAdmin) ||
      (actor.roles ?? []).some((r) => ['Org_Admin', 'Admin', 'Manager'].includes(r));

    if (!isCreator && !isAssignee && !isOrgAdmin) {
      throw new AppError('Access denied to update this task', 403, 'FORBIDDEN');
    }

    const update = await prisma.taskUpdate.create({
      data: {
        taskId,
        updatedById: actor.id,
        updateType: input.updateType ?? 'COMMENT',
        message: input.message,
        progress: input.progress ?? null
      },
      include: {
        updatedBy: { select: userSelect }
      }
    });

    if (input.status) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: input.status }
      });
    }

    await logActivity({
      orgId,
      actorId: actor.id,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.TASK,
      entityId: update.id,
      description: `Added update to task: ${task.title}`,
      metadata: { taskId, updateId: update.id }
    });

    return update;
  }

  /**
   * List updates for a task
   */
  static async listTaskUpdates(actor: TaskActor, orgId: string, taskId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, orgId }
    });
    if (!task) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }

    return prisma.taskUpdate.findMany({
      where: { taskId },
      include: {
        updatedBy: { select: userSelect }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Delete a task update
   */
  static async deleteTaskUpdate(
    actor: TaskActor,
    orgId: string,
    taskId: string,
    updateId: string
  ) {
    const update = await prisma.taskUpdate.findFirst({
      where: { id: updateId, taskId, task: { orgId } }
    });

    if (!update) {
      throw new AppError('Task update not found', 404, 'UPDATE_NOT_FOUND');
    }

    const isAuthor = update.updatedById === actor.id;
    const isOrgAdmin =
      Boolean(actor.isSuperAdmin) ||
      (actor.roles ?? []).some((r) => ['Org_Admin', 'Admin'].includes(r));

    if (!isAuthor && !isOrgAdmin) {
      throw new AppError('Access denied to delete this update', 403, 'FORBIDDEN');
    }

    await prisma.taskUpdate.delete({ where: { id: updateId } });
    return { success: true, message: 'Task update deleted successfully' };
  }

  /**
   * Assign users to a task
   */
  static async assignTask(
    actor: TaskActor,
    orgId: string,
    taskId: string,
    input: AssignTaskInput
  ) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, orgId }
    });
    if (!task) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }

    const users = await prisma.user.findMany({
      where: { id: { in: input.userIds }, orgId },
      select: { id: true }
    });
    const validUserIds = users.map((u) => u.id);

    if (validUserIds.length === 0) {
      throw new AppError('No valid users found to assign', 400, 'INVALID_USERS');
    }

    await prisma.taskAssignment.createMany({
      data: validUserIds.map((userId) => ({
        taskId,
        assignedToId: userId,
        assignedById: actor.id,
        status: 'ASSIGNED'
      })),
      skipDuplicates: true
    });

    await logActivity({
      orgId,
      actorId: actor.id,
      action: ActivityAction.ASSIGN,
      entity: ActivityEntity.TASK,
      entityId: taskId,
      description: `Assigned task: ${task.title} to ${validUserIds.length} user(s)`,
      metadata: { taskId, userIds: validUserIds }
    });

    return prisma.taskAssignment.findMany({
      where: { taskId, assignedToId: { in: validUserIds } },
      include: {
        assignedTo: { select: userSelect },
        assignedBy: { select: userSelect }
      }
    });
  }

  /**
   * Unassign user from task
   */
  static async unassignTask(
    actor: TaskActor,
    orgId: string,
    taskId: string,
    userId: string
  ) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, orgId }
    });
    if (!task) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }

    const assignment = await prisma.taskAssignment.findFirst({
      where: { taskId, assignedToId: userId }
    });
    if (!assignment) {
      throw new AppError('Assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
    }

    await prisma.taskAssignment.delete({ where: { id: assignment.id } });

    await logActivity({
      orgId,
      actorId: actor.id,
      action: ActivityAction.UNASSIGN,
      entity: ActivityEntity.TASK,
      entityId: taskId,
      description: `Unassigned task: ${task.title} from user`,
      metadata: { taskId, userId }
    });

    return { success: true, message: 'Task unassigned successfully' };
  }

  /**
   * List assignments for a task
   */
  static async listAssignments(actor: TaskActor, orgId: string, taskId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, orgId }
    });
    if (!task) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }

    return prisma.taskAssignment.findMany({
      where: { taskId },
      include: {
        assignedTo: { select: userSelect },
        assignedBy: { select: userSelect }
      }
    });
  }

  /**
   * Update assignment status (accept/decline/complete)
   */
  static async updateAssignmentStatus(
    actor: TaskActor,
    orgId: string,
    assignmentId: string,
    rawStatus: string
  ) {
    const normalizedStatus =
      rawStatus.toUpperCase() === 'DECLINED' ? 'REJECTED' : rawStatus.toUpperCase();

    const assignment = await prisma.taskAssignment.findUnique({
      where: { id: assignmentId },
      include: { task: true }
    });

    if (assignment?.task.orgId !== orgId) {
      throw new AppError('Assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
    }

    const isAssignee = assignment.assignedToId === actor.id;
    const isCreator = assignment.task.createdById === actor.id;
    const isOrgAdmin =
      Boolean(actor.isSuperAdmin) ||
      (actor.roles ?? []).some((r) => ['Org_Admin', 'Admin'].includes(r));

    if (!isAssignee && !isCreator && !isOrgAdmin) {
      throw new AppError('Access denied', 403, 'FORBIDDEN');
    }

    const updateData: Prisma.TaskAssignmentUpdateInput = {
      status: normalizedStatus as AssignmentStatus
    };
    if (normalizedStatus === 'ACCEPTED') {
      updateData.acceptedAt = new Date();
    } else if (normalizedStatus === 'COMPLETED') {
      updateData.completedAt = new Date();
    }

    return prisma.taskAssignment.update({
      where: { id: assignmentId },
      data: updateData,
      include: {
        assignedTo: { select: userSelect },
        assignedBy: { select: userSelect }
      }
    });
  }
}

export class TaskGroupService {
  /**
   * Create task group
   */
  static async createGroup(
    actor: TaskActor,
    orgId: string,
    input: CreateTaskGroupInput
  ) {
    const group = await prisma.taskGroup.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        createdById: actor.id,
        orgId
      }
    });

    // Automatically add creator as ADMIN member
    await prisma.taskGroupMember.create({
      data: {
        groupId: group.id,
        userId: actor.id,
        role: 'ADMIN',
        addedById: actor.id,
        isActive: true
      }
    });

    // If initial members provided, add them
    if (input.members && input.members.length > 0) {
      const validUsers = await prisma.user.findMany({
        where: { id: { in: input.members }, orgId, status: 'active' },
        select: { id: true }
      });
      const validUserIds = validUsers.map((u) => u.id).filter((uid) => uid !== actor.id);

      if (validUserIds.length > 0) {
        await prisma.taskGroupMember.createMany({
          data: validUserIds.map((uid) => ({
            groupId: group.id,
            userId: uid,
            role: 'MEMBER',
            addedById: actor.id,
            isActive: true
          })),
          skipDuplicates: true
        });
      }
    }

    await logActivity({
      orgId,
      actorId: actor.id,
      action: ActivityAction.CREATE,
      entity: ActivityEntity.TASK,
      entityId: group.id,
      description: `Created task group: ${group.name}`,
      metadata: { groupId: group.id }
    });

    return this.getGroupById(actor, orgId, group.id);
  }

  /**
   * List task groups with calculated stats and processed members
   */
  static async listGroups(actor: TaskActor, orgId: string) {
    const groups = await prisma.taskGroup.findMany({
      where: { orgId },
      include: {
        createdBy: { select: userSelect },
        tasks: {
          select: { id: true, status: true }
        },
        members: {
          where: { isActive: true },
          include: {
            user: { select: userSelect },
            addedBy: { select: userSelect }
          }
        },
        _count: { select: { tasks: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return groups.map((group) => {
      const processedMembers = group.members.map((m) => ({
        ...m.user,
        role: m.role,
        addedAt: m.addedAt,
        addedBy: m.addedBy
      }));

      return {
        ...group,
        members: processedMembers,
        memberCount: processedMembers.length,
        stats: {
          totalTasks: group.tasks.length,
          pendingTasks: group.tasks.filter((t) => t.status === 'PENDING').length,
          inProgressTasks: group.tasks.filter((t) => t.status === 'IN_PROGRESS').length,
          completedTasks: group.tasks.filter((t) => t.status === 'COMPLETED').length
        }
      };
    });
  }

  /**
   * Get task group by ID
   */
  static async getGroupById(actor: TaskActor, orgId: string, id: string) {
    const group = await prisma.taskGroup.findFirst({
      where: { id, orgId },
      include: {
        createdBy: { select: userSelect },
        tasks: {
          include: {
            assignments: {
              include: {
                assignedTo: { select: userSelect },
                assignedBy: { select: userSelect }
              }
            },
            updates: {
              include: { updatedBy: { select: userSelect } },
              orderBy: { createdAt: 'desc' }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        members: {
          where: { isActive: true },
          include: {
            user: { select: userSelect },
            addedBy: { select: userSelect }
          },
          orderBy: { addedAt: 'asc' }
        }
      }
    });

    if (!group) {
      throw new AppError('Task group not found', 404, 'GROUP_NOT_FOUND');
    }

    const processedMembers = group.members.map((m) => ({
      ...m.user,
      role: m.role,
      addedAt: m.addedAt,
      addedBy: m.addedBy
    }));

    return {
      ...group,
      members: processedMembers,
      memberCount: processedMembers.length,
      stats: {
        totalTasks: group.tasks.length,
        pendingTasks: group.tasks.filter((t) => t.status === 'PENDING').length,
        inProgressTasks: group.tasks.filter((t) => t.status === 'IN_PROGRESS').length,
        completedTasks: group.tasks.filter((t) => t.status === 'COMPLETED').length
      }
    };
  }

  /**
   * Update task group
   */
  static async updateGroup(
    actor: TaskActor,
    orgId: string,
    id: string,
    input: UpdateTaskGroupInput
  ) {
    const group = await prisma.taskGroup.findFirst({
      where: { id, orgId }
    });
    if (!group) {
      throw new AppError('Task group not found', 404, 'GROUP_NOT_FOUND');
    }

    const isCreator = group.createdById === actor.id;
    const isOrgAdmin =
      Boolean(actor.isSuperAdmin) ||
      (actor.roles ?? []).some((r) => ['Org_Admin', 'Admin'].includes(r));

    if (!isCreator && !isOrgAdmin) {
      throw new AppError('Access denied to update group', 403, 'FORBIDDEN');
    }

    const updated = await prisma.taskGroup.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description })
      }
    });

    await logActivity({
      orgId,
      actorId: actor.id,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.TASK,
      entityId: id,
      description: `Updated task group: ${updated.name}`,
      metadata: { groupId: id }
    });

    return updated;
  }

  /**
   * Delete task group
   */
  static async deleteGroup(actor: TaskActor, orgId: string, id: string) {
    const group = await prisma.taskGroup.findFirst({
      where: { id, orgId }
    });
    if (!group) {
      throw new AppError('Task group not found', 404, 'GROUP_NOT_FOUND');
    }

    const isCreator = group.createdById === actor.id;
    const isOrgAdmin =
      Boolean(actor.isSuperAdmin) ||
      (actor.roles ?? []).some((r) => ['Org_Admin', 'Admin'].includes(r));

    if (!isCreator && !isOrgAdmin) {
      throw new AppError('Access denied to delete group', 403, 'FORBIDDEN');
    }

    await prisma.$transaction([
      prisma.task.updateMany({
        where: { groupId: id },
        data: { groupId: null }
      }),
      prisma.taskGroup.delete({ where: { id } })
    ]);

    await logActivity({
      orgId,
      actorId: actor.id,
      action: ActivityAction.DELETE,
      entity: ActivityEntity.TASK,
      entityId: id,
      description: `Deleted task group: ${group.name}`,
      metadata: { groupId: id }
    });

    return { success: true, message: 'Task group deleted successfully' };
  }

  /**
   * Add members to group
   */
  static async addMembers(
    actor: TaskActor,
    orgId: string,
    groupId: string,
    input: AddGroupMembersInput
  ) {
    const group = await prisma.taskGroup.findFirst({
      where: { id: groupId, orgId }
    });
    if (!group) {
      throw new AppError('Task group not found', 404, 'GROUP_NOT_FOUND');
    }

    const users = await prisma.user.findMany({
      where: { id: { in: input.userIds }, orgId, status: 'active' },
      select: userSelect
    });

    if (users.length !== input.userIds.length) {
      throw new AppError('Some users not found, belong to another org, or inactive', 400, 'INVALID_USERS');
    }

    const existingMembers = await prisma.taskGroupMember.findMany({
      where: { groupId, userId: { in: input.userIds }, isActive: true }
    });
    const existingUserIds = existingMembers.map((m) => m.userId);
    const newUserIds = input.userIds.filter((uid) => !existingUserIds.includes(uid));

    if (newUserIds.length > 0) {
      await prisma.taskGroupMember.createMany({
        data: newUserIds.map((uid) => ({
          groupId,
          userId: uid,
          role: input.role ?? 'MEMBER',
          addedById: actor.id,
          isActive: true
        })),
        skipDuplicates: true
      });
    }

    await logActivity({
      orgId,
      actorId: actor.id,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.TASK,
      entityId: groupId,
      description: `Added ${newUserIds.length} members to group: ${group.name}`,
      metadata: { groupId, addedUserIds: newUserIds }
    });

    return {
      groupId,
      addedMembers: users.filter((u) => newUserIds.includes(u.id)),
      skippedMembers: users.filter((u) => existingUserIds.includes(u.id))
    };
  }

  /**
   * Remove members from group
   */
  static async removeMembers(
    actor: TaskActor,
    orgId: string,
    groupId: string,
    userIds: string[]
  ) {
    const group = await prisma.taskGroup.findFirst({
      where: { id: groupId, orgId }
    });
    if (!group) {
      throw new AppError('Task group not found', 404, 'GROUP_NOT_FOUND');
    }

    if (userIds.includes(group.createdById)) {
      throw new AppError('Cannot remove group creator from the group', 400, 'CANNOT_REMOVE_CREATOR');
    }

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, orgId },
      select: userSelect
    });

    await prisma.$transaction([
      prisma.taskGroupMember.updateMany({
        where: { groupId, userId: { in: userIds }, isActive: true },
        data: { isActive: false, removedAt: new Date() }
      }),
      prisma.taskAssignment.deleteMany({
        where: {
          assignedToId: { in: userIds },
          task: { groupId }
        }
      })
    ]);

    await logActivity({
      orgId,
      actorId: actor.id,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.TASK,
      entityId: groupId,
      description: `Removed ${users.length} members from task group: ${group.name}`,
      metadata: { groupId, removedUserIds: userIds }
    });

    return {
      groupId,
      removedMembers: users
    };
  }

  /**
   * Update member role in group
   */
  static async updateMemberRole(
    actor: TaskActor,
    orgId: string,
    groupId: string,
    input: UpdateMemberRoleInput
  ) {
    const group = await prisma.taskGroup.findFirst({
      where: { id: groupId, orgId }
    });
    if (!group) {
      throw new AppError('Task group not found', 404, 'GROUP_NOT_FOUND');
    }

    if (input.userId === group.createdById) {
      throw new AppError("Cannot change the group creator's role", 400, 'CANNOT_CHANGE_CREATOR_ROLE');
    }

    const updated = await prisma.taskGroupMember.updateMany({
      where: { groupId, userId: input.userId, isActive: true },
      data: { role: input.role }
    });

    if (updated.count === 0) {
      throw new AppError('Member not found in this group', 404, 'MEMBER_NOT_FOUND');
    }

    return {
      groupId,
      userId: input.userId,
      newRole: input.role
    };
  }
}
