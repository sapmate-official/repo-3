import { logger } from '../config/logger.js';

interface EmailRecipient {
  email: string;
  name?: string;
}

interface SendEmailOptions {
  to: EmailRecipient[];
  subject: string;
  htmlContent: string;
  sender?: {
    name: string;
    email: string;
  };
}

export class EmailService {
  private static readonly BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

  private static getBrevoApiKey(): string | undefined {
    return process.env.BREVO_API_KEY?.trim() || undefined;
  }

  private static getDefaultSender() {
    return {
      name: process.env.SENDER_NAME || 'Alkaa HRMS',
      email: process.env.SENDER_EMAIL || 'support@alkaa.online'
    };
  }

  static async sendEmail(options: SendEmailOptions): Promise<boolean> {
    const apiKey = this.getBrevoApiKey();
    if (!apiKey) {
      logger.warn(
        { to: options.to.map((r) => r.email), subject: options.subject },
        'BREVO_API_KEY is not configured in .env. Skipping external email dispatch.'
      );
      return false;
    }

    const sender = options.sender || this.getDefaultSender();

    try {
      const response = await fetch(this.BREVO_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender,
          to: options.to,
          subject: options.subject,
          htmlContent: options.htmlContent
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ status: response.status, error: errorText }, 'Brevo API returned error response');
        return false;
      }

      const result = await response.json();
      logger.info({ result, to: options.to.map((r) => r.email) }, 'Email successfully dispatched via Brevo');
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Failed to dispatch email via Brevo');
      return false;
    }
  }

  // 1. Demo Request Confirmation & Notification
  static async sendDemoRequestEmails(input: {
    name: string;
    company: string;
    phoneNumber: string;
    email: string;
  }): Promise<void> {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5174';

    // A. Send confirmation email to requester
    const requesterHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #e5e7eb;">
          <div style="background: linear-gradient(135deg, #2E7D32 0%, #4CAF50 100%); padding: 30px 20px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 700;">Alkaa Demo Request Received</h1>
          </div>
          <div style="padding: 30px; color: #374151; font-size: 15px; line-height: 1.6;">
            <p>Hi <strong>${input.name}</strong>,</p>
            <p>Thank you for your interest in Alkaa HRMS! We have received your request for a personalized demo for <strong>${input.company}</strong>.</p>
            <p>One of our product specialists will reach out to you within 24 hours at <strong>${input.phoneNumber}</strong> or via this email address to schedule your demo.</p>
            <div style="background-color: #f3f4f6; padding: 15px 20px; border-radius: 6px; margin: 25px 0;">
              <h4 style="margin: 0 0 10px 0; color: #111827;">Your Submitted Details:</h4>
              <p style="margin: 4px 0;"><strong>Company:</strong> ${input.company}</p>
              <p style="margin: 4px 0;"><strong>Phone:</strong> ${input.phoneNumber}</p>
              <p style="margin: 4px 0;"><strong>Email:</strong> ${input.email}</p>
            </div>
            <p>Best regards,<br/><strong>The Alkaa Team</strong></p>
          </div>
        </div>
      </div>
    `;

    await this.sendEmail({
      to: [{ email: input.email, name: input.name }],
      subject: `Alkaa Demo Request Confirmation - ${input.company}`,
      htmlContent: requesterHtml
    });

    // B. Send notification to internal team
    const internalRecipients: EmailRecipient[] = [
      { email: 'support@alkaa.online', name: 'Alkaa Support' }
    ];
    if (process.env.SENDER_EMAIL && process.env.SENDER_EMAIL !== 'support@alkaa.online') {
      internalRecipients.push({ email: process.env.SENDER_EMAIL });
    }

    const internalHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>🚀 New Demo Request Submitted</h2>
        <p><strong>Name:</strong> ${input.name}</p>
        <p><strong>Company:</strong> ${input.company}</p>
        <p><strong>Phone:</strong> ${input.phoneNumber}</p>
        <p><strong>Email:</strong> <a href="mailto:${input.email}">${input.email}</a></p>
        <p><em>Submitted at: ${new Date().toLocaleString()}</em></p>
      </div>
    `;

    await this.sendEmail({
      to: internalRecipients,
      subject: `[New Lead] Demo Request: ${input.company} (${input.name})`,
      htmlContent: internalHtml
    });
  }

  // 2. Candidate Onboarding Approval Notification
  static async sendCandidateApprovedEmail(candidate: {
    email: string;
    firstName: string;
    lastName?: string | null;
    companyName: string;
    jobTitle?: string | null;
  }): Promise<void> {
    const candidateName = `${candidate.firstName} ${candidate.lastName || ''}`.trim();
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #e5e7eb;">
          <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px 20px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 700;">Onboarding Approved 🎉</h1>
          </div>
          <div style="padding: 30px; color: #374151; font-size: 15px; line-height: 1.6;">
            <p>Dear <strong>${candidateName}</strong>,</p>
            <p>Congratulations! Your onboarding profile and submitted documents for <strong>${candidate.companyName}</strong> have been reviewed and <strong>approved</strong> by HR.</p>
            ${candidate.jobTitle ? `<p><strong>Role / Position:</strong> ${candidate.jobTitle}</p>` : ''}
            <p>Our HR operations team is now completing your official account provisioning. You will receive a subsequent welcome email with your official employee ID and system credentials.</p>
            <div style="background-color: #eff6ff; padding: 15px 20px; border-radius: 6px; border-left: 4px solid #3b82f6; margin: 25px 0;">
              <p style="margin: 0; color: #1e40af; font-size: 14px;">Welcome aboard! We are excited to have you join our team.</p>
            </div>
            <p>Warm regards,<br/><strong>HR Operations - ${candidate.companyName}</strong></p>
          </div>
        </div>
      </div>
    `;

    await this.sendEmail({
      to: [{ email: candidate.email, name: candidateName }],
      subject: `Congratulations! Your Onboarding with ${candidate.companyName} is Approved`,
      htmlContent
    });
  }

  // 3. New Provisioned Employee Welcome Email
  static async sendNewEmployeeWelcomeEmail(params: {
    email: string;
    name: string;
    employeeId: string;
    temporaryPassword: string;
    companyName: string;
    loginUrl?: string;
  }): Promise<void> {
    const loginUrl = params.loginUrl || process.env.CLIENT_URL || 'http://localhost:5174';
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #e5e7eb;">
          <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 30px 20px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 700;">Welcome to ${params.companyName}!</h1>
          </div>
          <div style="padding: 30px; color: #374151; font-size: 15px; line-height: 1.6;">
            <p>Hi <strong>${params.name}</strong>,</p>
            <p>Your employee account has been created. Here are your portal access credentials:</p>
            <div style="background-color: #f3f4f6; padding: 15px 20px; border-radius: 6px; margin: 25px 0;">
              <p style="margin: 6px 0;"><strong>Employee ID:</strong> <code>${params.employeeId}</code></p>
              <p style="margin: 6px 0;"><strong>Login Email:</strong> ${params.email}</p>
              <p style="margin: 6px 0;"><strong>Temporary Password:</strong> <code>${params.temporaryPassword}</code></p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginUrl}" style="background-color: #059669; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                Login to Employee Portal
              </a>
            </div>
            <p style="font-size: 13px; color: #6b7280;">Please change your password immediately upon your first login.</p>
          </div>
        </div>
      </div>
    `;

    await this.sendEmail({
      to: [{ email: params.email, name: params.name }],
      subject: `Welcome to ${params.companyName} - Your Account Credentials`,
      htmlContent
    });
  }
}
