import { EmailService } from '../services/email.service.js';

async function testEmailDispatch() {
  console.log('Sending test verification email via Brevo...');
  const success = await EmailService.sendEmail({
    to: [{ email: process.env.SENDER_EMAIL ?? '', name: 'Soumabrata Ghosh' }],
    subject: 'Alkaa HRMS - Email System Successfully Connected! 🚀',
    htmlContent: `
      <div style="font-family: Arial, sans-serif; padding: 25px; border-radius: 8px; border: 1px solid #e5e7eb;">
        <h2 style="color: #2e7d32;">Email Dispatch is Active!</h2>
        <p>Your Brevo API connection is verified and functioning perfectly with Alkaa HRMS.</p>
        <p>You will now receive all demo requests, candidate approval alerts, and welcome emails directly in your inbox.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 13px; color: #6b7280;">Sent by Alkaa HRMS automated testing service.</p>
      </div>
    `
  });

  if (success) {
    console.log('SUCCESS: Email dispatched! Check your inbox.');
  } else {
    console.error('FAILED: Email dispatch failed.');
  }
}

testEmailDispatch();
