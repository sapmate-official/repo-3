import { AppError } from '../../util/errors.js';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeTimeZone = (timeZone?: string | null): string => {
  if (!timeZone) {
    return 'UTC';
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return 'UTC';
  }
};

export const getTimeZone = (preferred?: string | null, fallback = 'UTC'): string => {
  if (!preferred) {
    return normalizeTimeZone(fallback);
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: preferred }).format(new Date());
    return preferred;
  } catch {
    return normalizeTimeZone(fallback);
  }
};

export const getDateKeyInTimeZone = (date: Date, timeZone?: string | null): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
};

export const parseDateOnly = (value: string, field = 'date'): Date => {
  if (!DATE_KEY_PATTERN.test(value)) {
    throw new AppError(`Invalid ${field}: expected YYYY-MM-DD`, 400, 'INVALID_DATE');
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AppError(`Invalid ${field}`, 400, 'INVALID_DATE');
  }

  return parsed;
};

export const parseDateTime = (value: string, field = 'timestamp'): Date => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(`Invalid ${field}`, 400, 'INVALID_DATETIME');
  }
  return parsed;
};

export const parseStartAndEndOfDay = (value: string, field = 'date') => {
  const start = DATE_KEY_PATTERN.test(value)
    ? parseDateOnly(value, field)
    : (() => {
        const parsed = parseDateTime(value, field);
        return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
      })();

  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);

  return { date: start, start, end };
};

export const isSameDateKey = (date: Date, dateKey: string): boolean => {
  return date.toISOString().slice(0, 10) === dateKey;
};
