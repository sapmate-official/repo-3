import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { PayrollController } from './payroll.controller.js';
import { PayrollCompatController } from './payroll-compat.controller.js';

// ==========================================
// Modern API v3 Payroll & Pay Run Router
// ==========================================
export const payrollRouter = Router();

payrollRouter.use(authenticateAny, requireOrgScope());

// Modern Pay Run Lifecycle Endpoints
payrollRouter.post('/runs', PayrollController.createDraftRun);
payrollRouter.post('/runs/:id/compute', PayrollController.computePayRun);
payrollRouter.post('/runs/:id/override', PayrollController.applyOverride);
payrollRouter.post('/runs/:id/submit', PayrollController.submitForApproval);
payrollRouter.post('/runs/:id/approve', PayrollController.approveRun);
payrollRouter.post('/runs/:id/reject', PayrollController.rejectRun);
payrollRouter.post('/runs/:id/disburse', PayrollController.disburseRun);
payrollRouter.get('/runs/:id', PayrollController.getRunDetails);
payrollRouter.get('/runs', PayrollController.listRuns);

// Payslip downloads
payrollRouter.get('/payslips/:id/pdf', PayrollController.downloadPayslipPdf);
payrollRouter.get('/my-payslips', PayrollController.getMyPayslips);

// Compatibility endpoints for legacy frontend v3 calls
payrollRouter.get('/payslip/:month/:year/:userId', PayrollCompatController.getPayslipByParams);
payrollRouter.get('/payslip/:month/:year', PayrollCompatController.getPayslipByParams);
payrollRouter.post('/salary-generate/:month/:year/:userId', PayrollCompatController.generateSalary);
payrollRouter.post('/salary-generate/:month/:year', PayrollCompatController.generateSalary);
payrollRouter.get('/statistics/:salaryRecordId', PayrollCompatController.getSalaryStatistics);
payrollRouter.get('/download/:salaryRecordId', PayrollCompatController.downloadPayslip);
payrollRouter.get('/download/:id', PayrollCompatController.downloadPayslip);
payrollRouter.get('/pre-stats/:month/:year/:userId', PayrollCompatController.preStatsSalaryGeneration);
payrollRouter.get('/pre-stats/:month/:year', PayrollCompatController.preStatsSalaryGeneration);

// ==========================================
// Compatibility Router for Legacy v2 /api/v2/payroll
// ==========================================
export const payrollV2Router = Router();

payrollV2Router.use(authenticateAny, requireOrgScope());
payrollV2Router.get('/parameters/:userId', PayrollCompatController.getParameters);
payrollV2Router.put('/parameters/:userId', PayrollCompatController.updateParameters);
payrollV2Router.get('/parameters', PayrollCompatController.getParameters);
payrollV2Router.put('/parameters', PayrollCompatController.updateParameters);

// ==========================================
// Compatibility Router for Legacy v2 /api/v2/salary
// ==========================================
export const salaryV2Router = Router();

salaryV2Router.use(authenticateAny, requireOrgScope());
salaryV2Router.get('/user/:userId/monthly/:month/year/:year', PayrollCompatController.checkSalaryExistence);

export default payrollRouter;
