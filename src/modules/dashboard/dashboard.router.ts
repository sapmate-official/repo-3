import { Router } from 'express';
import { DashboardController } from './dashboard.controller.js';
import { authenticateAny } from '../../middleware/auth.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticateAny);

dashboardRouter.get('/summary', DashboardController.getSummary);
dashboardRouter.get('/screen/dashboard/:userId', DashboardController.getSummary);
dashboardRouter.get('/:userId', DashboardController.getSummary);
dashboardRouter.get('/', DashboardController.getSummary);

export default dashboardRouter;
