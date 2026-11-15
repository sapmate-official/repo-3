import { Router } from 'express';
import { authenticateSuperAdmin } from '../../middleware/superAdminAuth.js';
import { SuperAdminController } from './super-admin.controller.js';

export const superAdminRouter = Router();

// ==========================================
// SuperAdmin Authentication & Verification
// ==========================================
superAdminRouter.post('/login', SuperAdminController.login);
superAdminRouter.post('/logout', authenticateSuperAdmin, SuperAdminController.logout);
superAdminRouter.get('/validate-token', authenticateSuperAdmin, SuperAdminController.validateToken);
superAdminRouter.get('/get-user-info', authenticateSuperAdmin, SuperAdminController.getUserInfo);

// ==========================================
// Organization Tracking & Metrics (Mount before /:id)
// ==========================================
superAdminRouter.get('/organizations/stats', authenticateSuperAdmin, SuperAdminController.getOrganizationsStats);
superAdminRouter.get('/organization/:id/details', authenticateSuperAdmin, SuperAdminController.getOrganizationDetails);
superAdminRouter.get('/organization/:id/users', authenticateSuperAdmin, SuperAdminController.getOrganizationUsers);
superAdminRouter.get('/organization/:id/admins', authenticateSuperAdmin, SuperAdminController.getOrganizationAdmins);

// ==========================================
// Organization Billing Operations (Mount before /:id)
// ==========================================
superAdminRouter.get('/billing/statistics', authenticateSuperAdmin, SuperAdminController.getBillingStatistics);
superAdminRouter.get('/organization/:id/bills', authenticateSuperAdmin, SuperAdminController.getOrganizationBills);
superAdminRouter.post('/organization/:id/bill', authenticateSuperAdmin, SuperAdminController.generateOrganizationBill);
superAdminRouter.post('/organization/:id/send-bill', authenticateSuperAdmin, SuperAdminController.sendBillEmail);
superAdminRouter.post('/organizations/send-bills', authenticateSuperAdmin, SuperAdminController.sendBillsToAllOrganizations);

superAdminRouter.get('/bill/:id', authenticateSuperAdmin, SuperAdminController.getBillById);
superAdminRouter.patch('/bill/:id/status', authenticateSuperAdmin, SuperAdminController.updateBillStatus);
superAdminRouter.post('/bill/:id/payment', authenticateSuperAdmin, SuperAdminController.processBillPayment);

// ==========================================
// SuperAdmin Account Management
// ==========================================
superAdminRouter.get('/', authenticateSuperAdmin, SuperAdminController.getSuperAdmins);
superAdminRouter.post('/', SuperAdminController.createSuperAdmin);
superAdminRouter.get('/:id', authenticateSuperAdmin, SuperAdminController.getSuperAdminById);
superAdminRouter.put('/:id', authenticateSuperAdmin, SuperAdminController.updateSuperAdmin);
superAdminRouter.patch('/:id', authenticateSuperAdmin, SuperAdminController.updateSuperAdmin);
superAdminRouter.delete('/:id', authenticateSuperAdmin, SuperAdminController.deleteSuperAdmin);

export default superAdminRouter;
