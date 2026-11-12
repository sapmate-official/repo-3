import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { publicLimiter } from '../../middleware/rateLimit.js';
import { EmailService } from '../../services/email.service.js';

const demoRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  company: z.string().trim().min(1, 'Company is required'),
  phoneNumber: z.string().trim().min(1, 'Phone number is required'),
  email: z.email('Valid email is required')
});

export const publicRouter = Router();

publicRouter.post(
  '/demo-request',
  publicLimiter,
  validate({ body: demoRequestSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, company, phoneNumber, email } = req.body as z.infer<typeof demoRequestSchema>;
      logger.info({ name, company, email, phoneNumber }, 'Processing public onboarding submission');

      const normalizedEmail = email.toLowerCase().trim();
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0] ?? name;
      const lastName = nameParts.slice(1).join(' ');

      const organization = env.PUBLIC_DEMO_ORG_ID
        ? await prisma.organization.findUnique({
            where: { id: env.PUBLIC_DEMO_ORG_ID },
            include: { users: { take: 1 } }
          })
        : null;

      if (!organization) {
        logger.warn(
          { PUBLIC_DEMO_ORG_ID: env.PUBLIC_DEMO_ORG_ID },
          'Public demo request received without a valid destination organization'
        );
      } else {
        const adminUser =
          organization.users[0] ??
          (await prisma.user.findFirst({
            where: { orgId: organization.id },
            select: { id: true }
          }));

        if (!adminUser) {
          logger.warn(
            { orgId: organization.id },
            'Public demo request destination organization has no users'
          );
        } else {
          const existingCandidate = await prisma.onboardingCandidate.findUnique({
            where: { email: normalizedEmail }
          });

          if (existingCandidate) {
            if (existingCandidate.orgId !== organization.id) {
              logger.warn(
                { candidateId: existingCandidate.id, orgId: existingCandidate.orgId },
                'Public demo request email belongs to a candidate in another organization'
              );
            } else {
              await prisma.onboardingCandidate.update({
                where: { id: existingCandidate.id },
                data: {
                  firstName,
                  lastName,
                  mobileNumber: phoneNumber,
                  status: 'FORM_SUBMITTED',
                  formSubmittedAt: new Date(),
                  formData: {
                    ...((existingCandidate.formData as Record<string, unknown> | null) ?? {}),
                    company,
                    phoneNumber,
                    source: 'Public Web Application / Demo Request',
                    submittedAt: new Date().toISOString()
                  }
                }
              });
              logger.info({ candidateId: existingCandidate.id }, 'Existing candidate updated to FORM_SUBMITTED');
            }
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
