import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../config/logger.js';
import { validate } from '../../middleware/validate.js';
import { EmailService } from '../../services/email.service.js';

const demoRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  company: z.string().trim().min(1, 'Company is required'),
  phoneNumber: z.string().trim().min(1, 'Phone number is required'),
  email: z.string().trim().email('Valid email is required')
});

export const publicRouter = Router();

publicRouter.post(
  '/demo-request',
  validate({ body: demoRequestSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, company, phoneNumber, email } = req.body;
      logger.info({ name, company, email, phoneNumber }, 'Processing public onboarding submission');

      const normalizedEmail = email.toLowerCase().trim();
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0] || name;
      const lastName = nameParts.slice(1).join(' ') || '';

      // 1. Locate matching organization or active tenant with users
      let organization = await prisma.organization.findFirst({
        where: {
          OR: [
            { name: { contains: company, mode: 'insensitive' } },
            { users: { some: { email: { contains: 'shapenxt', mode: 'insensitive' } } } }
          ]
        },
        include: { users: { take: 1 } }
      });

      if (!organization) {
        // Fall back to the active organization that actually has users
        organization = await prisma.organization.findFirst({
          where: { users: { some: {} } },
          include: { users: { take: 1 } }
        });
      }

      // 2. Automatically create or update candidate in Onboarding Management
      if (organization) {
        const adminUser =
          organization.users[0] ||
          (await prisma.user.findFirst({ where: { orgId: organization.id } })) ||
          (await prisma.user.findFirst());

        if (adminUser) {
          const existingCandidate = await prisma.onboardingCandidate.findUnique({
            where: { email: normalizedEmail }
          });

          if (existingCandidate) {
            await prisma.onboardingCandidate.update({
              where: { id: existingCandidate.id },
              data: {
                firstName,
                lastName,
                mobileNumber: phoneNumber,
                status: 'FORM_SUBMITTED',
                formSubmittedAt: new Date(),
                formData: {
                  ...((existingCandidate.formData as Record<string, unknown>) || {}),
                  company,
                  phoneNumber,
                  source: 'Public Web Application / Demo Request',
                  submittedAt: new Date().toISOString()
                }
              }
            });
            logger.info({ candidateId: existingCandidate.id }, 'Existing candidate updated to FORM_SUBMITTED');
          } else {
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const tokenExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

            const created = await prisma.onboardingCandidate.create({
              data: {
                orgId: organization.id,
                createdById: adminUser.id,
                email: normalizedEmail,
                personalEmail: normalizedEmail,
                firstName,
                lastName,
                mobileNumber: phoneNumber,
                status: 'FORM_SUBMITTED',
                verificationToken,
                tokenExpiry,
                formSubmittedAt: new Date(),
                formData: {
                  company,
                  phoneNumber,
                  source: 'Public Web Application / Demo Request',
                  submittedAt: new Date().toISOString()
                }
              }
            });
            logger.info({ candidateId: created.id }, 'New onboarding candidate auto-created as FORM_SUBMITTED');
          }
        }
      }

      // 3. Dispatch confirmation to applicant & internal notification to admin
      await EmailService.sendDemoRequestEmails({ name, company, phoneNumber, email });

      res.status(200).json({
        message: 'Onboarding request submitted successfully. You will see it in the Onboarding dashboard.',
        success: true
      });
    } catch (error) {
      next(error);
    }
  }
);

export default publicRouter;
