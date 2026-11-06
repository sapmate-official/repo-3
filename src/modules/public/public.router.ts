import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../../config/logger.js';
import { validate } from '../../middleware/validate.js';

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
      logger.info({ name, company, email, phoneNumber }, 'Received demo request');

      const brevoApiKey = process.env.BREVO_API_KEY;
      if (brevoApiKey) {
        try {
          const recipients = [
            'support@alkaa.online',
            'shramana.show@alkaa.online'
          ];
          await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Api-Key': brevoApiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sender: {
                name: 'Alkaa Demo Requests',
                email: process.env.SENDER_EMAIL || 'noreply@alkaa.online'
              },
              to: recipients.map((toEmail) => ({ email: toEmail })),
              subject: `New Demo Request from ${company}`,
              htmlContent: `
                <h2>New Demo Request</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Company:</strong> ${company}</p>
                <p><strong>Phone:</strong> ${phoneNumber}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><em>Submitted at: ${new Date().toISOString()}</em></p>
              `
            })
          });
        } catch (emailErr) {
          logger.warn({ err: emailErr }, 'Failed to dispatch email via Brevo, but request captured');
        }
      }

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
