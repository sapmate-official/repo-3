import type { Request, Response, NextFunction } from 'express';
import { OnboardingService } from './onboarding.service.js';
import type { CreateCandidateInput, SubmitCandidateFormInput, CompleteOnboardingInput } from './onboarding.schema.js';
import { AppError } from '../../util/errors.js';

const strParam = (val: unknown): string | undefined => {
  if (Array.isArray(val)) {
    const first: unknown = val[0];
    return typeof first === 'string' && first.trim() ? first.trim() : undefined;
  }
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
};

export class OnboardingController {
  // GET /api/v1/onboarding OR GET /api/v2/onboarding
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const candidates = await OnboardingService.listCandidates(orgId, status);
      res.status(200).json(candidates);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v1/onboarding/:id OR GET /api/v2/onboarding/:id
  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id) ?? '';
      const candidate = await OnboardingService.getCandidateById(orgId, id);
      res.status(200).json(candidate);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/v2/onboarding/:id/review
  static async getReviewData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id) ?? '';
      const reviewData = await OnboardingService.getCandidateReviewData(orgId, id);
      res.status(200).json(reviewData);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/onboarding OR POST /api/v2/onboarding
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawBody = req.body as Record<string, unknown>;
      const payload = (typeof rawBody.data === 'object' && rawBody.data !== null ? rawBody.data : rawBody) as Record<string, unknown>;
      const orgId = strParam(payload.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const userId = req.user?.id ?? '';
      const candidate = await OnboardingService.createCandidate(orgId, userId, payload as unknown as CreateCandidateInput);
      res.status(201).json(candidate);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/:id/invite
  static async sendInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id) ?? '';
      const result = await OnboardingService.sendInvitation(orgId, id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // PUT /api/v2/onboarding/:id
  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id) ?? '';
      const updated = await OnboardingService.updateCandidateData(orgId, id, req.body as Partial<CreateCandidateInput>);
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/:id/mark-review
  static async markUnderReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id) ?? '';
      const userId = req.user?.id ?? '';
      const candidate = await OnboardingService.markUnderReview(orgId, id, userId);
      res.status(200).json(candidate);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v1/onboarding/:id/verify-document
  static async verifyDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id) ?? '';
      const body = req.body as { documentKey: string; status: 'VERIFIED' | 'REJECTED'; feedback?: string };
      const userId = req.user?.id ?? '';
      const updated = await OnboardingService.verifyDocument(
        orgId,
        id,
        userId,
        body.documentKey,
        body.status,
        body.feedback
      );
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/:id/approve
  static async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id) ?? '';
      const userId = req.user?.id ?? '';
      const candidate = await OnboardingService.approveCandidate(orgId, id, userId, req.body as Record<string, unknown>);
      res.status(200).json(candidate);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/:id/request-changes
  static async requestChanges(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id) ?? '';
      const body = req.body as { feedback?: string; reason?: string };
      const feedback = body.feedback ?? body.reason ?? 'Changes requested by HR';
      const userId = req.user?.id ?? '';
      const candidate = await OnboardingService.requestChanges(orgId, id, userId, feedback);
      res.status(200).json(candidate);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/:id/reject
  static async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id) ?? '';
      const body = req.body as { reason?: string };
      const reason = body.reason ?? 'Application rejected';
      const userId = req.user?.id ?? '';
      const candidate = await OnboardingService.rejectCandidate(orgId, id, userId, reason);
      res.status(200).json(candidate);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/:id/complete
  static async complete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id) ?? '';
      const result = await OnboardingService.completeOnboarding(orgId, id, req.body as CompleteOnboardingInput);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/v2/onboarding/:id
  static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = strParam(req.params.orgId) ?? strParam(req.query.orgId) ?? req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 400, 'ORG_CONTEXT_MISSING');
      }

      const id = strParam(req.params.id) ?? '';
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
      const token = strParam(req.params.token) ?? '';
      const data = await OnboardingService.verifyCandidateToken(token);
      res.status(200).json(data);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/v2/onboarding/submit/:token OR /submit
  static async submitForm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawBody = req.body as Record<string, unknown>;
      const token = strParam(req.params.token) ?? strParam(rawBody.token);
      if (!token) {
        throw new AppError('Verification token is required', 400, 'TOKEN_REQUIRED');
      }
      const data = (typeof rawBody.formData === 'object' && rawBody.formData !== null ? rawBody.formData : rawBody) as SubmitCandidateFormInput;
      const result = await OnboardingService.submitCandidateForm(token, data);
      res.status(200).json({ message: 'Onboarding form submitted successfully', candidate: result });
    } catch (error) {
      next(error);
    }
  }
}
