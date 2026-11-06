import { Router } from 'express';
import { OnboardingController } from './onboarding.controller.js';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';

export const onboardingRouter = Router();

// ==========================================
// Public Candidate Routes (No Auth Required)
// ==========================================
onboardingRouter.get('/verify/:token', OnboardingController.verifyToken);
onboardingRouter.get('/validate/:token', OnboardingController.verifyToken);
onboardingRouter.get('/form/:token', OnboardingController.verifyToken);
onboardingRouter.post('/submit/:token', OnboardingController.submitForm);
onboardingRouter.post('/submit', OnboardingController.submitForm);

// ==========================================
// Protected Routes (HR / Org Admin Scope)
// ==========================================
onboardingRouter.use(authenticateAny);

onboardingRouter.get('/', requireOrgScope(), OnboardingController.list);
onboardingRouter.get('/:id/review', requireOrgScope(), OnboardingController.getReviewData);
onboardingRouter.get('/:id', requireOrgScope(), OnboardingController.getById);

onboardingRouter.post('/', requireOrgScope(), OnboardingController.create);
onboardingRouter.put('/:id', requireOrgScope(), OnboardingController.update);
onboardingRouter.delete('/:id', requireOrgScope(), OnboardingController.delete);

// Workflow stage actions
onboardingRouter.post('/:id/mark-review', requireOrgScope(), OnboardingController.markUnderReview);
onboardingRouter.post('/:id/verify-document', requireOrgScope(), OnboardingController.verifyDocument);
onboardingRouter.post('/:id/approve', requireOrgScope(), OnboardingController.approve);
onboardingRouter.post('/:id/request-changes', requireOrgScope(), OnboardingController.requestChanges);
onboardingRouter.post('/:id/reject', requireOrgScope(), OnboardingController.reject);
onboardingRouter.post('/:id/complete', requireOrgScope(), OnboardingController.complete);

export default onboardingRouter;
