import { logger } from '../config/logger.js';
import { checkMissingCheckoutsJob, type AttendanceJobResult } from './attendance.job.js';
import { processHolidayRemindersJob, type HolidayReminderJobResult } from './holiday-reminder.job.js';
import { processBirthdayEmailsJob, type BirthdayJobResult } from './birthday.job.js';

export interface SchedulerStatus {
  isRunning: boolean;
  lastRunDates: {
    birthday?: string;
    holiday?: string;
    attendance?: string;
  };
}

let attendanceTimer: NodeJS.Timeout | null = null;
let dailyCheckerTimer: NodeJS.Timeout | null = null;

const state: SchedulerStatus = {
  isRunning: false,
  lastRunDates: {},
};

/**
 * Run all scheduled background jobs immediately (useful for testing or admin trigger).
 */
export async function runAllJobsNow(): Promise<{
  attendance: AttendanceJobResult;
  holiday: HolidayReminderJobResult;
  birthday: BirthdayJobResult;
}> {
  logger.info("Manually triggering all background jobs");
  const nowStr = new Date().toISOString().slice(0, 10);

  const [attendance, holiday, birthday] = await Promise.all([
    checkMissingCheckoutsJob(),
    processHolidayRemindersJob(1),
    processBirthdayEmailsJob(),
  ]);

  state.lastRunDates.attendance = nowStr;
  state.lastRunDates.holiday = nowStr;
  state.lastRunDates.birthday = nowStr;

  logger.info(
    { attendance, holiday, birthday },
    "All background jobs completed manually",
  );
  return { attendance, holiday, birthday };
}

/**
 * Checks and runs daily 9 AM tasks (birthday emails & holiday reminders).
 */
async function checkDailyTasks(): Promise<void> {
  const now = new Date();
  const currentHour = now.getHours();
  const todayDateStr = now.toISOString().slice(0, 10);

  // Run holiday reminders around 9 AM if not already run today
  if (currentHour >= 9 && state.lastRunDates.holiday !== todayDateStr) {
    try {
      logger.info("Executing scheduled holiday reminders");
      await processHolidayRemindersJob(1);
      state.lastRunDates.holiday = todayDateStr;
    } catch (err) {
      logger.error({ err }, "Error executing scheduled holiday reminders");
    }
  }

  // Run birthday emails around 9 AM if not already run today
  if (currentHour >= 9 && state.lastRunDates.birthday !== todayDateStr) {
    try {
      logger.info("Executing scheduled birthday emails");
      await processBirthdayEmailsJob();
      state.lastRunDates.birthday = todayDateStr;
    } catch (err) {
      logger.error({ err }, "Error executing scheduled birthday emails");
    }
  }
}

/**
 * Checks for missing attendance checkouts during evening hours (5 PM - midnight).
 */
async function checkAttendanceTasks(): Promise<void> {
  const now = new Date();
  const hour = now.getHours();

  // Run between 5 PM and midnight (hours 17 through 23)
  if (hour >= 17) {
    try {
      logger.info("Executing scheduled attendance missing-checkout check");
      await checkMissingCheckoutsJob(8);
      state.lastRunDates.attendance = now.toISOString().slice(0, 10);
    } catch (err) {
      logger.error(
        { err },
        "Error executing scheduled attendance checkout check",
      );
    }
  }
}

/**
 * Starts background job schedulers.
 */
export function startScheduledJobs(): void {
  if (state.isRunning) {
    logger.warn("Scheduled jobs are already running");
    return;
  }

  logger.info(
    "Starting background job schedulers (attendance, birthdays, holidays)",
  );
  state.isRunning = true;

  // Run daily task checker every 15 minutes
  dailyCheckerTimer = setInterval(
    () => {
      void checkDailyTasks();
    },
    15 * 60 * 1000,
  );
  dailyCheckerTimer.unref();

  // Run attendance missing-checkout check every 30 minutes
  attendanceTimer = setInterval(
    () => {
      void checkAttendanceTasks();
    },
    30 * 60 * 1000,
  );
  attendanceTimer.unref();

  // Initial trigger check on boot
  void checkDailyTasks();
  void checkAttendanceTasks();

  logger.info("Background job schedulers started successfully");
}

/**
 * Stops all background job schedulers cleanly.
 */
export function stopScheduledJobs(): void {
  if (!state.isRunning) return;

  if (dailyCheckerTimer) {
    clearInterval(dailyCheckerTimer);
    dailyCheckerTimer = null;
  }

  if (attendanceTimer) {
    clearInterval(attendanceTimer);
    attendanceTimer = null;
  }

  state.isRunning = false;
  logger.info("Background job schedulers stopped cleanly");
}

/**
 * Get current scheduler status.
 */
export function getSchedulerStatus(): SchedulerStatus {
  return { ...state, lastRunDates: { ...state.lastRunDates } };
}
