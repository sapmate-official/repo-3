import { prisma } from '../db/prisma.js';
import { EmailService } from '../services/email.service.js';
import { logger } from '../config/logger.js';

export interface BirthdayJobResult {
  birthdaysFound: number;
  emailsSent: number;
}

export const processBirthdayEmailsJob = async (): Promise<BirthdayJobResult> => {
  logger.info('Running birthday greeting background job');
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  const activeUsers = await prisma.user.findMany({
    where: {
      status: 'active',
      dateOfBirth: { not: null }
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      managerId: true,
      orgId: true,
      organization: { select: { name: true } }
    }
  });

  let birthdaysFound = 0;
  let emailsSent = 0;

  for (const user of activeUsers) {
    if (!user.dateOfBirth) continue;

    const dob = new Date(user.dateOfBirth);
    if (dob.getMonth() === currentMonth && dob.getDate() === currentDay) {
      birthdaysFound++;
      try {
        const employeeName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
        const companyName = user.organization?.name ?? 'Alkaa Workforce';

        let managerEmail: string | undefined;
        if (user.managerId) {
          const manager = await prisma.user.findUnique({
            where: { id: user.managerId },
            select: { email: true }
          });
          if (manager?.email) {
            managerEmail = manager.email;
          }
        }

        const sent = await EmailService.sendBirthdayEmail({
          to: user.email,
          employeeName,
          companyName,
          managerEmail
        });

        if (sent) emailsSent++;
      } catch (err) {
        logger.error({ err, userId: user.id }, 'Failed to dispatch birthday greeting email');
      }
    }
  }

  logger.info({ birthdaysFound, emailsSent }, 'Birthday greeting background job completed');
  return { birthdaysFound, emailsSent };
};
