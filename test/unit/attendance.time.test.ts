import { describe, expect, it } from 'vitest';
import {
  getDateKeyInTimeZone,
  getTimeZone,
  parseDateOnly,
  parseStartAndEndOfDay
} from '../../src/modules/attendance/attendance.time.js';

describe('getDateKeyInTimeZone', () => {
  it('uses the organization timezone for the date key', () => {
    const date = new Date('2026-11-07T20:00:00.000Z');
    expect(getDateKeyInTimeZone(date, 'Asia/Kolkata')).toBe('2026-11-08');
    expect(getDateKeyInTimeZone(date, 'UTC')).toBe('2026-11-07');
  });

  it('falls back to UTC for invalid timezones', () => {
    const date = new Date('2026-11-07T20:00:00.000Z');
    expect(getDateKeyInTimeZone(date, 'Not/AZone')).toBe('2026-11-07');
  });
});

describe('getTimeZone', () => {
  it('returns a valid preferred timezone', () => {
    expect(getTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata');
  });

  it('returns the fallback for an invalid timezone', () => {
    expect(getTimeZone('Not/AZone', 'Asia/Kolkata')).toBe('Asia/Kolkata');
  });
});

describe('parseDateOnly', () => {
  it('parses a valid date key', () => {
    expect(parseDateOnly('2026-11-07').toISOString()).toBe('2026-11-07T00:00:00.000Z');
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => parseDateOnly('2026-11-7')).toThrow();
    expect(() => parseDateOnly('2026-02-31')).toThrow();
  });
});

describe('parseStartAndEndOfDay', () => {
  it('returns inclusive UTC day boundaries', () => {
    const result = parseStartAndEndOfDay('2026-11-07');
    expect(result.start.toISOString()).toBe('2026-11-07T00:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-11-07T23:59:59.999Z');
  });
});
