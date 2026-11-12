import { describe, expect, it } from 'vitest';
import {
  checkInSchema,
  locationSchema,
  pastAttendanceSchema
} from '../../src/modules/attendance/attendance.schema.js';

describe('locationSchema', () => {
  it('accepts an object location', () => {
    const result = locationSchema.parse({ latitude: 12.9, longitude: 77.5 });
    expect(result).toEqual({ latitude: 12.9, longitude: 77.5 });
  });

  it('normalizes a comma-separated location string', () => {
    const result = locationSchema.parse('12.9, 77.5');
    expect(result).toEqual({ latitude: 12.9, longitude: 77.5 });
  });

  it('normalizes an empty location string', () => {
    const result = locationSchema.parse('');
    expect(result).toEqual({});
  });

  it('rejects malformed location strings', () => {
    expect(locationSchema.safeParse('12.9').success).toBe(false);
    expect(locationSchema.safeParse('north,east').success).toBe(false);
  });
});

describe('attendance location payloads', () => {
  it('accepts string locations for check-in', () => {
    const result = checkInSchema.parse({
      date: '2026-11-07',
      checkInTime: '2026-11-07T09:00:00.000Z',
      checkInLocation: '12.9,77.5'
    });

    expect(result.checkInLocation).toEqual({ latitude: 12.9, longitude: 77.5 });
  });

  it('accepts string locations for past attendance', () => {
    const result = pastAttendanceSchema.parse({
      date: '2026-11-06',
      checkInTime: '2026-11-06T09:00:00.000Z',
      checkOutTime: '2026-11-06T17:00:00.000Z',
      checkInLocation: '12.9,77.5',
      checkOutLocation: '12.9,77.5'
    });

    expect(result.checkInLocation).toEqual({ latitude: 12.9, longitude: 77.5 });
    expect(result.checkOutLocation).toEqual({ latitude: 12.9, longitude: 77.5 });
  });
});
