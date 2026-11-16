import { prisma } from '../db/prisma.js';
import { EmailService } from '../services/email.service.js';
import { logger } from '../config/logger.js';

export interface HolidayReminderJobResult {
  holidaysFound: number;
  emailsSent: number;
}

export const processHolidayRemindersJob = async (leadDays = 1): Promise<HolidayReminderJobResult> => {
  logger.info({ leadDays }, 'Running holiday reminder background job');
  const now = new Date();
  const targetDateUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + leadDays
  ));

  const startOfDay = new Date(targetDateUTC);
  const endOfDay = new Date(targetDateUTC);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  const upcomingHolidays = await prisma.holiday.findMany({
    where: {
      date: {
        gte: startOfDay,
        lt: endOfDay
      }
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  logger.info({ count: upcomingHolidays.length }, 'Found upcoming holidays for reminder');

  let emailsSent = 0;

  for (const holiday of upcomingHolidays) {
    try {
      const companyName = holiday.organization?.name ?? 'Alkaa Workforce';

      const activeEmployees = await prisma.user.findMany({
        where: {
          orgId: holiday.orgId,
          status: 'active'
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      });

      if (activeEmployees.length === 0) continue;

      const recipients = activeEmployees.map((e) => ({
        email: e.email,
        name: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || e.email
      }));

      await EmailService.sendHolidayAnnouncementEmail({
        recipients,
        holidayName: holiday.name,
        holidayDate: holiday.date,
        description: holiday.description ?? undefined,
        isOptional: holiday.isOptional,
        companyName
      });

      emailsSent += recipients.length;
    } catch (err) {
      logger.error({ err, holidayId: holiday.id }, 'Failed to dispatch holiday reminder emails');
    }
  }

  logger.info({ holidaysFound: upcomingHolidays.length, emailsSent }, 'Holiday reminder background job completed');
  return { holidaysFound: upcomingHolidays.length, emailsSent };
};
