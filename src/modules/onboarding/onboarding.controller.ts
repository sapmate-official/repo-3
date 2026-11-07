import type { Request, Response, NextFunction } from 'express';
import { OnboardingService } from './onboarding.service.js';
import { AppError } from '../../util/errors.js';

const strParam = (val: unknown): string => (Array.isArray(val) ? val[0] : (val as string) || '');

export class OnboardingController {
  // GET /api/v1/onboarding OR GET /api/v2/onboarding
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const status = req.query.status as string | undefined;
      const candidates = await OnboardingService.listCandidates(orgId, status);
      res.status(200).json(candidates);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/onboarding/:id OR GET /api/v2/onboarding/:id
  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const candidate = await OnboardingService.getCandidateById(orgId, id);
      res.status(200).json(candidate);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/onboarding/:id/review
  static async getReviewData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const reviewData = await OnboardingService.getCandidateReviewData(orgId, id);
      res.status(200).json(reviewData);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/onboarding OR POST /api/v2/onboarding
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const payload = req.body.data || req.body;
      const orgId = strParam(payload.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const candidate = await OnboardingService.createCandidate(orgId, req.user!.id, payload);
      res.status(201).json(candidate);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/:id/invite
  static async sendInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const result = await OnboardingService.sendInvitation(orgId, strParam(req.params.id));
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/v2/onboarding/:id
  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const updated = await OnboardingService.updateCandidateData(orgId, id, req.body);
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/:id/mark-review
  static async markUnderReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const candidate = await OnboardingService.markUnderReview(orgId, id, req.user!.id);
      res.status(200).json(candidate);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/onboarding/:id/verify-document
  static async verifyDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const { documentKey, status, feedback } = req.body;
      const updated = await OnboardingService.verifyDocument(
        orgId,
        id,
        req.user!.id,
        documentKey,
        status,
        feedback
      );
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/:id/approve
  static async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const candidate = await OnboardingService.approveCandidate(orgId, id, req.user!.id, req.body);
      res.status(200).json(candidate);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/:id/request-changes
  static async requestChanges(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const feedback = req.body.feedback || req.body.reason || 'Changes requested by HR';
      const candidate = await OnboardingService.requestChanges(orgId, id, req.user!.id, feedback);
      res.status(200).json(candidate);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/:id/reject
  static async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const reason = req.body.reason || 'Application rejected';
      const candidate = await OnboardingService.rejectCandidate(orgId, id, req.user!.id, reason);
      res.status(200).json(candidate);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/:id/complete
  static async complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const result = await OnboardingService.completeOnboarding(orgId, id, req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/v2/onboarding/:id
  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) || strParam(req.query.orgId) || req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id);
      const result = await OnboardingService.deleteCandidate(orgId, id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // Public candidate endpoints (No auth required)
  // GET /api/v2/onboarding/verify/:token OR /validate/:token OR /form/:token
  static async verifyToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = strParam(req.params.token);
      const data = await OnboardingService.verifyCandidateToken(token);
      res.status(200).json(data);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/submit/:token OR /submit
  static async submitForm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = strParam(req.params.token) || strParam(req.body.token);
      if (!token) {
        throw new AppError('Verification token is required', 400, 'TOKEN_REQUIRED');
      }
      const data = req.body.formData || req.body;
      const result = await OnboardingService.submitCandidateForm(token, data);
      res.status(200).json({ message: 'Onboarding form submitted successfully', candidate: result });
    } catch (error) {
      next(error);
    }
  }
}
