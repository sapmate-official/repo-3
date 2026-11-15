import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { NotificationController } from './notification.controller.js';

export const notificationRouter = Router();

// Apply auth & org context across notification router
notificationRouter.use(authenticateAny, requireOrgScope());

// Notification Stats
notificationRouter.get('/stats', NotificationController.stats);

// Bulk operations & actions
notificationRouter.post('/read', NotificationController.bulkMarkRead);
notificationRouter.patch('/bulk-mark', NotificationController.bulkMarkRead);
notificationRouter.patch('/user/:userId/mark-all-read', NotificationController.markAllUserRead);

// User-scoped notifications
notificationRouter.get('/user/:userId/unread', (req, res, next) => {
  req.query.unreadOnly = 'true';
  NotificationController.listByUser(req, res, next);
});
notificationRouter.get('/user/:userId', NotificationController.listByUser);

// Templates (mounted on /notification/templates & /notification/template)
notificationRouter.get('/templates', NotificationController.listTemplates);
notificationRouter.get('/template', NotificationController.listTemplates);
notificationRouter.post('/templates', NotificationController.createTemplate);
notificationRouter.post('/template', NotificationController.createTemplate);
notificationRouter.get('/templates/:id', NotificationController.getTemplateById);
notificationRouter.get('/template/:id', NotificationController.getTemplateById);
notificationRouter.delete('/templates/:id', NotificationController.deleteTemplate);
notificationRouter.delete('/template/:id', NotificationController.deleteTemplate);

// Notification item operations
notificationRouter.patch('/:id/read', NotificationController.markRead);
notificationRouter.patch('/:id/unread', NotificationController.markUnread);
notificationRouter.put('/:id', NotificationController.markRead);
notificationRouter.get('/:id', NotificationController.getById);
notificationRouter.delete('/:id', NotificationController.delete);

// Base notification routes
notificationRouter.get('/', NotificationController.list);
notificationRouter.post('/', NotificationController.create);
