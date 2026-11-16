import { prisma } from '../db/prisma.js';
import { EmailService } from '../services/email.service.js';
import { logger } from '../config/logger.js';

export interface AttendanceJobResult {
  recordsFound: number;
  remindersSent: number;
}

export const checkMissingCheckoutsJob = async (cutoffHours = 8): Promise<AttendanceJobResult> => {
  logger.info({ cutoffHours }, 'Running missing checkout background job');
  const now = new Date();
  const cutoffTime = new Date(now.getTime() - cutoffHours * 60 * 60 * 1000);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const missingCheckouts = await prisma.attendanceRecord.findMany({
    where: {
      date: {
        gte: startOfDay,
        lt: endOfDay
      },
      checkInTime: {
        lt: cutoffTime
      },
      checkOutTime: null
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          managerId: true,
          orgId: true,
          organization: { select: { name: true } }
        }
      }
    }
  });

  logger.info({ count: missingCheckouts.length }, 'Found attendance records without checkout');

  let remindersSent = 0;

  for (const record of missingCheckouts) {
    try {
      const user = record.user;
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

      const sent = await EmailService.sendCheckoutReminderEmail({
        to: user.email,
        employeeName,
        checkInTime: record.checkInTime,
        companyName,
        managerEmail
      });

      if (sent) remindersSent++;
    } catch (err) {
      logger.error({ err, attendanceId: record.id }, 'Failed to send checkout reminder email');
    }
  }

  logger.info({ recordsFound: missingCheckouts.length, remindersSent }, 'Missing checkout background job completed');
  return { recordsFound: missingCheckouts.length, remindersSent };
};
