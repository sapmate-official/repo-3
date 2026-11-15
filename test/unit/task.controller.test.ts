import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const taskServiceMock = vi.hoisted(() => ({
  createTask: vi.fn(),
  listTasks: vi.fn(),
  getTaskById: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  listUserTasks: vi.fn(),
  listManagerTasks: vi.fn(),
  listGroupTasks: vi.fn(),
  addTaskUpdate: vi.fn(),
  listTaskUpdates: vi.fn(),
  deleteTaskUpdate: vi.fn(),
  assignTask: vi.fn(),
  unassignTask: vi.fn(),
  listAssignments: vi.fn(),
  updateAssignmentStatus: vi.fn()
}));

const taskGroupServiceMock = vi.hoisted(() => ({
  createGroup: vi.fn(),
  listGroups: vi.fn(),
  getGroupById: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  addMembers: vi.fn(),
  removeMembers: vi.fn(),
  updateMemberRole: vi.fn()
}));

vi.mock('../../src/modules/task/task.service.js', () => ({
  TaskService: taskServiceMock,
  TaskGroupService: taskGroupServiceMock
}));

import {
  TaskController,
  TaskGroupController,
  WhatsAppController
} from '../../src/modules/task/task.controller.js';

describe('Task Management Controllers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    return res;
  };

  const sampleActor = {
    id: 'user-manager-1',
    orgId: 'org-test-1',
    roles: ['Manager'],
    permissions: ['view_tasks'],
    isSuperAdmin: false
  };

  describe('TaskController.create', () => {
    it('creates a task successfully and returns 201', async () => {
      const req = {
        user: sampleActor,
        body: {
          title: 'Implement Task API',
          description: 'Build backend and connect endpoints',
          priority: 'HIGH'
        }
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      const created = { id: 'task-1', title: 'Implement Task API' };
      taskServiceMock.createTask.mockResolvedValueOnce(created);

      await TaskController.create(req, res, next);

      expect(taskServiceMock.createTask).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        expect.objectContaining({ title: 'Implement Task API', priority: 'HIGH' })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Task created successfully',
        data: created
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('passes errors to next function on validation failure', async () => {
      const req = {
        user: sampleActor,
        body: {
          // missing title
          description: 'No title provided'
        }
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      await TaskController.create(req, res, next);

      expect(taskServiceMock.createTask).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('TaskController.list', () => {
    it('lists tasks with filters and pagination', async () => {
      const req = {
        user: sampleActor,
        query: {
          status: 'PENDING',
          priority: 'HIGH',
          page: '1',
          limit: '20'
        }
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      const mockResult = {
        tasks: [{ id: 'task-1', title: 'Task 1' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
      };
      taskServiceMock.listTasks.mockResolvedValueOnce(mockResult);

      await TaskController.list(req, res, next);

      expect(taskServiceMock.listTasks).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        expect.objectContaining({ status: 'PENDING', priority: 'HIGH', page: 1, limit: 20 })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockResult.tasks,
        pagination: mockResult.pagination
      });
    });
  });

  describe('TaskController.getById', () => {
    it('retrieves task details by id', async () => {
      const req = {
        user: sampleActor,
        params: { id: 'task-123' }
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      taskServiceMock.getTaskById.mockResolvedValueOnce({ id: 'task-123', title: 'Task 123' });

      await TaskController.getById(req, res, next);

      expect(taskServiceMock.getTaskById).toHaveBeenCalledWith(sampleActor, 'org-test-1', 'task-123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { id: 'task-123', title: 'Task 123' }
      });
    });
  });

  describe('TaskController.update & patch', () => {
    it('updates task fields and returns 200', async () => {
      const req = {
        user: sampleActor,
        params: { id: 'task-123' },
        body: { title: 'Updated Title', status: 'IN_PROGRESS' }
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      taskServiceMock.updateTask.mockResolvedValueOnce({ id: 'task-123', title: 'Updated Title' });

      await TaskController.update(req, res, next);

      expect(taskServiceMock.updateTask).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'task-123',
        expect.objectContaining({ title: 'Updated Title', status: 'IN_PROGRESS' })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('TaskController.delete', () => {
    it('deletes a task successfully', async () => {
      const req = {
        user: sampleActor,
        params: { id: 'task-123' }
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      taskServiceMock.deleteTask.mockResolvedValueOnce({ success: true, message: 'Deleted' });

      await TaskController.delete(req, res, next);

      expect(taskServiceMock.deleteTask).toHaveBeenCalledWith(sampleActor, 'org-test-1', 'task-123');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('TaskController.assign & unassign', () => {
    it('assigns task to userIds and returns 201', async () => {
      const req = {
        user: sampleActor,
        params: { taskId: 'task-123' },
        body: { userIds: ['user-1', 'user-2'] }
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      taskServiceMock.assignTask.mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }]);

      await TaskController.assign(req, res, next);

      expect(taskServiceMock.assignTask).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'task-123',
        { userIds: ['user-1', 'user-2'] }
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('unassigns user from task and returns 200', async () => {
      const req = {
        user: sampleActor,
        params: { taskId: 'task-123' },
        body: { userId: 'user-1' }
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      taskServiceMock.unassignTask.mockResolvedValueOnce({ success: true, message: 'Unassigned' });

      await TaskController.unassign(req, res, next);

      expect(taskServiceMock.unassignTask).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'task-123',
        'user-1'
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('TaskController.addUpdate & listUpdates', () => {
    it('adds task comment/progress update', async () => {
      const req = {
        user: sampleActor,
        params: { taskId: 'task-123' },
        body: { message: 'Work is 50% complete', progress: 50 }
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      taskServiceMock.addTaskUpdate.mockResolvedValueOnce({ id: 'up-1', message: 'Work is 50% complete' });

      await TaskController.addUpdate(req, res, next);

      expect(taskServiceMock.addTaskUpdate).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'task-123',
        expect.objectContaining({ message: 'Work is 50% complete', progress: 50 })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('TaskGroupController', () => {
    it('creates a task group successfully and returns 201', async () => {
      const req = {
        user: sampleActor,
        body: {
          name: 'Core Team Alpha',
          description: 'Product Engineering group',
          members: ['user-2']
        }
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      const group = { id: 'group-1', name: 'Core Team Alpha' };
      taskGroupServiceMock.createGroup.mockResolvedValueOnce(group);

      await TaskGroupController.create(req, res, next);

      expect(taskGroupServiceMock.createGroup).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        expect.objectContaining({ name: 'Core Team Alpha' })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Task group created successfully',
        data: group
      });
    });

    it('lists task groups', async () => {
      const req = {
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      taskGroupServiceMock.listGroups.mockResolvedValueOnce([{ id: 'g1', name: 'Alpha' }]);

      await TaskGroupController.list(req, res, next);

      expect(taskGroupServiceMock.listGroups).toHaveBeenCalledWith(sampleActor, 'org-test-1');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('adds members to a task group', async () => {
      const req = {
        user: sampleActor,
        params: { id: 'group-1' },
        body: { userIds: ['user-3', 'user-4'] }
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      taskGroupServiceMock.addMembers.mockResolvedValueOnce({ groupId: 'group-1', addedMembers: [] });

      await TaskGroupController.addMembers(req, res, next);

      expect(taskGroupServiceMock.addMembers).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'group-1',
        { userIds: ['user-3', 'user-4'], role: 'MEMBER' }
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('removes members from a task group', async () => {
      const req = {
        user: sampleActor,
        params: { id: 'group-1' },
        body: { userIds: ['user-3'] }
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      taskGroupServiceMock.removeMembers.mockResolvedValueOnce({ groupId: 'group-1', removedMembers: [] });

      await TaskGroupController.removeMembers(req, res, next);

      expect(taskGroupServiceMock.removeMembers).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'group-1',
        ['user-3']
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('WhatsAppController', () => {
    it('returns skipped message gracefully if whatsapp service is unconfigured', async () => {
      const origUrl = process.env.WHATSAPP_API_URL;
      const origKey = process.env.WHATSAPP_API_KEY;
      delete process.env.WHATSAPP_API_URL;
      delete process.env.WHATSAPP_API_KEY;

      const req = {
        user: sampleActor,
        body: {
          phoneNumbers: ['+919876543210'],
          message: 'You have a new task assigned'
        }
      } as unknown as Request;
      const res = mockRes();
      const next: NextFunction = vi.fn();

      await WhatsAppController.sendNotification(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'WhatsApp notification skipped: service not configured in environment'
      });

      process.env.WHATSAPP_API_URL = origUrl;
      process.env.WHATSAPP_API_KEY = origKey;
    });
  });
});
