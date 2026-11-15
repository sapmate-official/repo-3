import { Router } from 'express';
import { authenticateSuperAdmin } from '../../middleware/superAdminAuth.js';
import { SubscriptionPlanController } from './subscription-plan.controller.js';

export const subscriptionPlanRouter = Router();

// Public / Authenticated read routes
subscriptionPlanRouter.get('/', SubscriptionPlanController.getSubscriptionPlans);
subscriptionPlanRouter.get('/:id', SubscriptionPlanController.getSubscriptionPlanById);

// Super-admin only mutations
subscriptionPlanRouter.post('/', authenticateSuperAdmin, SubscriptionPlanController.createSubscriptionPlan);
subscriptionPlanRouter.put('/:id', authenticateSuperAdmin, SubscriptionPlanController.updateSubscriptionPlan);
subscriptionPlanRouter.patch('/:id', authenticateSuperAdmin, SubscriptionPlanController.updateSubscriptionPlan);
subscriptionPlanRouter.delete('/:id', authenticateSuperAdmin, SubscriptionPlanController.deleteSubscriptionPlan);
subscriptionPlanRouter.patch('/:id/toggle-status', authenticateSuperAdmin, SubscriptionPlanController.toggleSubscriptionPlanStatus);

export default subscriptionPlanRouter;
