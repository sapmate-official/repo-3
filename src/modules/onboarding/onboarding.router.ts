import { Router } from 'express';
import { OnboardingController } from './onboarding.controller.js';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { publicLimiter } from '../../middleware/rateLimit.js';
import { PERMISSION_KEYS } from '../auth/permissionKeys.js';

export const onboardingRouter = Router();

// ==========================================
// Public Candidate Routes (No Auth Required)
// ==========================================
onboardingRouter.get('/verify/:token', publicLimiter, OnboardingController.verifyToken);
onboardingRouter.get('/validate/:token', publicLimiter, OnboardingController.verifyToken);
onboardingRouter.get('/form/:token', publicLimiter, OnboardingController.verifyToken);
onboardingRouter.post('/submit/:token', publicLimiter, OnboardingController.submitForm);
onboardingRouter.post('/submit', publicLimiter, OnboardingController.submitForm);

// ==========================================
// Protected Routes (HR / Org Admin Scope)
// ==========================================
onboardingRouter.use(authenticateAny);

onboardingRouter.get('/', requireOrgScope(), requirePermission(PERMISSION_KEYS.userRead), OnboardingController.list);
onboardingRouter.get('/:id/review', requireOrgScope(), requirePermission(PERMISSION_KEYS.userRead), OnboardingController.getReviewData);
onboardingRouter.get('/:id', requireOrgScope(), requirePermission(PERMISSION_KEYS.userRead), OnboardingController.getById);

onboardingRouter.post('/', requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), OnboardingController.create);
onboardingRouter.post('/:id/invite', requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), OnboardingController.sendInvitation);
onboardingRouter.put('/:id', requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), OnboardingController.update);
onboardingRouter.delete('/:id', requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), OnboardingController.delete);

// Workflow stage actions
onboardingRouter.post('/:id/mark-review', requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), OnboardingController.markUnderReview);
onboardingRouter.post('/:id/verify-document', requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), OnboardingController.verifyDocument);
onboardingRouter.post('/:id/approve', requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), OnboardingController.approve);
onboardingRouter.post('/:id/request-changes', requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), OnboardingController.requestChanges);
onboardingRouter.post('/:id/reject', requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), OnboardingController.reject);
onboardingRouter.post('/:id/complete', requireOrgScope(), requirePermission(PERMISSION_KEYS.userWrite), OnboardingController.complete);

export default onboardingRouter;
