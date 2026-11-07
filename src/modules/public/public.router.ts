import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
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
      logger.info({ name, company, email, phoneNumber }, 'Processing demo request');

      // Dispatch confirmation to user & internal notification to admin
      await EmailService.sendDemoRequestEmails({ name, company, phoneNumber, email });

      res.status(200).json({
        message: 'Demo request submitted successfully. Our team will contact you soon!',
        success: true
      });
    } catch (error) {
      next(error);
    }
  }
);

export default publicRouter;
