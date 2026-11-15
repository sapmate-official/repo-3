import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import {
  TaskController,
  TaskGroupController,
  WhatsAppController
} from './task.controller.js';

export const taskRouter = Router();

taskRouter.use(authenticateAny);
taskRouter.use(requireOrgScope());

// Assignment status updates (must precede /:id)
taskRouter.put('/assignments/:assignmentId', TaskController.updateAssignmentStatus);
taskRouter.put('/assignment/:assignmentId', TaskController.updateAssignmentStatus);

// Specific lookups (must precede /:id)
taskRouter.get('/user/:userId', TaskController.listByUser);
taskRouter.get('/manager/:managerId', TaskController.listByManager);
taskRouter.get('/group/:groupId', TaskController.listByGroup);

// Task CRUD
taskRouter.post('/', TaskController.create);
taskRouter.get('/', TaskController.list);
taskRouter.get('/:id', TaskController.getById);
taskRouter.put('/:id', TaskController.update);
taskRouter.patch('/:id', TaskController.patch);
taskRouter.delete('/:id', TaskController.delete);

// Task Updates & Chat
taskRouter.post('/:taskId/updates', TaskController.addUpdate);
taskRouter.get('/:taskId/updates', TaskController.listUpdates);
taskRouter.delete('/:taskId/updates/:updateId', TaskController.deleteUpdate);

// Task Assignments
taskRouter.post('/:taskId/assign', TaskController.assign);
taskRouter.delete('/:taskId/unassign', TaskController.unassign);
taskRouter.get('/:taskId/assignments', TaskController.listAssignments);

// -------------------------------------------------------------
// Task Group Router
// -------------------------------------------------------------
export const taskGroupRouter = Router();

taskGroupRouter.use(authenticateAny);
taskGroupRouter.use(requireOrgScope());

taskGroupRouter.post('/', TaskGroupController.create);
taskGroupRouter.get('/', TaskGroupController.list);
taskGroupRouter.get('/:id', TaskGroupController.getById);
taskGroupRouter.put('/:id', TaskGroupController.update);
taskGroupRouter.delete('/:id', TaskGroupController.delete);

// Task Group Members
taskGroupRouter.post('/:id/members', TaskGroupController.addMembers);
taskGroupRouter.delete('/:id/members', TaskGroupController.removeMembers);
taskGroupRouter.put('/:id/members/role', TaskGroupController.updateMemberRole);

// -------------------------------------------------------------
// WhatsApp Notification Router
// -------------------------------------------------------------
export const whatsappRouter = Router();

whatsappRouter.use(authenticateAny);
whatsappRouter.use(requireOrgScope());

whatsappRouter.post('/send', WhatsAppController.sendNotification);
