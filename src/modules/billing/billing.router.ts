import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { BillingController } from './billing.controller.js';

export const billingRouter = Router();

// Dashboard & history (authenticated with org context)
billingRouter.get('/dashboard', authenticateAny, requireOrgScope(), BillingController.getBillingDashboard);
billingRouter.get('/history', authenticateAny, requireOrgScope(), BillingController.getBillHistory);

// Specific bill actions
billingRouter.get('/bill/:id', authenticateAny, requireOrgScope(), BillingController.getBillDetails);
billingRouter.post('/bill/:id/pay', authenticateAny, requireOrgScope(), BillingController.markBillAsPaid);

// Invoice download (authenticated with org context)
billingRouter.get('/bill/:id/invoice', authenticateAny, requireOrgScope(), BillingController.downloadBillInvoice);

export default billingRouter;
