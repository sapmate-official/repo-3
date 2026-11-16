import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  attendanceRecord: {
    findMany: vi.fn()
  },
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn()
  },
  holiday: {
    findMany: vi.fn()
  }
}));

const emailServiceMock = vi.hoisted(() => ({
  sendBirthdayEmail: vi.fn(),
  sendCheckoutReminderEmail: vi.fn(),
  sendHolidayAnnouncementEmail: vi.fn()
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

vi.mock('../../src/services/email.service.js', () => ({
  EmailService: emailServiceMock
}));

import { checkMissingCheckoutsJob } from '../../src/jobs/attendance.job.js';
import { processBirthdayEmailsJob } from '../../src/jobs/birthday.job.js';
import { processHolidayRemindersJob } from '../../src/jobs/holiday-reminder.job.js';
import {
  startScheduledJobs,
  stopScheduledJobs,
  runAllJobsNow,
  getSchedulerStatus
} from '../../src/jobs/scheduler.js';

describe('Background Jobs & Schedulers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Attendance Job (Missing Checkouts)', () => {
    it('finds employees missing checkouts and sends reminder emails', async () => {
      const checkIn = new Date(Date.now() - 9 * 60 * 60 * 1000);
      prismaMock.attendanceRecord.findMany.mockResolvedValue([
        {
          id: 'att-1',
          checkInTime: checkIn,
          checkOutTime: null,
          user: {
            id: 'u-1',
            firstName: 'Soumabrata',
            lastName: 'Ghosh',
            email: 'souma@shapenxt.com',
            managerId: 'mgr-1',
            orgId: 'org-1',
            organization: { name: 'ShapeNXT' }
          }
        }
      ]);

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'mgr-1',
        email: 'manager@shapenxt.com'
      });

      emailServiceMock.sendCheckoutReminderEmail.mockResolvedValue(true);

      const result = await checkMissingCheckoutsJob(8);

      expect(result.recordsFound).toBe(1);
      expect(result.remindersSent).toBe(1);
      expect(emailServiceMock.sendCheckoutReminderEmail).toHaveBeenCalledWith({
        to: 'souma@shapenxt.com',
        employeeName: 'Soumabrata Ghosh',
        checkInTime: checkIn,
        companyName: 'ShapeNXT',
        managerEmail: 'manager@shapenxt.com'
      });
    });

    it('returns 0 reminders sent when no checkouts are missing', async () => {
      prismaMock.attendanceRecord.findMany.mockResolvedValue([]);

      const result = await checkMissingCheckoutsJob(8);

      expect(result.recordsFound).toBe(0);
      expect(result.remindersSent).toBe(0);
      expect(emailServiceMock.sendCheckoutReminderEmail).not.toHaveBeenCalled();
    });
  });

  describe('Birthday Job', () => {
    it('dispatches birthday email to employees whose birthday is today', async () => {
      const today = new Date();
      // Year 1995, same month and day as today
      const dobToday = new Date(1995, today.getMonth(), today.getDate());

      prismaMock.user.findMany.mockResolvedValue([
        {
          id: 'u-1',
          email: 'birthday.user@shapenxt.com',
          firstName: 'Alice',
          lastName: 'Smith',
          dateOfBirth: dobToday,
          managerId: null,
          orgId: 'org-1',
          organization: { name: 'ShapeNXT' }
        },
        {
          id: 'u-2',
          email: 'other.user@shapenxt.com',
          firstName: 'Bob',
          lastName: 'Jones',
          dateOfBirth: new Date(1990, (today.getMonth() + 2) % 12, 15),
          managerId: null,
          orgId: 'org-1',
          organization: { name: 'ShapeNXT' }
        }
      ]);

      emailServiceMock.sendBirthdayEmail.mockResolvedValue(true);

      const result = await processBirthdayEmailsJob();

      expect(result.birthdaysFound).toBe(1);
      expect(result.emailsSent).toBe(1);
      expect(emailServiceMock.sendBirthdayEmail).toHaveBeenCalledWith({
        to: 'birthday.user@shapenxt.com',
        employeeName: 'Alice Smith',
        companyName: 'ShapeNXT',
        managerEmail: undefined
      });
    });
  });

  describe('Holiday Reminder Job', () => {
    it('dispatches announcement email for upcoming holidays to active employees', async () => {
      const holidayDate = new Date();
      prismaMock.holiday.findMany.mockResolvedValue([
        {
          id: 'hol-1',
          name: 'New Year',
          date: holidayDate,
          description: 'Global holiday',
          isOptional: false,
          orgId: 'org-1',
          organization: { id: 'org-1', name: 'ShapeNXT' }
        }
      ]);

      prismaMock.user.findMany.mockResolvedValue([
        { id: 'u-1', email: 'emp1@shapenxt.com', firstName: 'John', lastName: 'Doe' },
        { id: 'u-2', email: 'emp2@shapenxt.com', firstName: 'Jane', lastName: 'Doe' }
      ]);

      emailServiceMock.sendHolidayAnnouncementEmail.mockResolvedValue(true);

      const result = await processHolidayRemindersJob(1);

      expect(result.holidaysFound).toBe(1);
      expect(result.emailsSent).toBe(2);
      expect(emailServiceMock.sendHolidayAnnouncementEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          holidayName: 'New Year',
          companyName: 'ShapeNXT'
        })
      );
    });
  });

  describe('Scheduler Lifecycle', () => {
    it('starts and stops background job timers', () => {
      startScheduledJobs();
      expect(getSchedulerStatus().isRunning).toBe(true);

      stopScheduledJobs();
      expect(getSchedulerStatus().isRunning).toBe(false);
    });

    it('runAllJobsNow executes all 3 jobs and returns metrics', async () => {
      prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.holiday.findMany.mockResolvedValue([]);

      const metrics = await runAllJobsNow();

      expect(metrics.attendance).toBeDefined();
      expect(metrics.holiday).toBeDefined();
      expect(metrics.birthday).toBeDefined();
    });
  });
});
