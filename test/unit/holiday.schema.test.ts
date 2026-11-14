import { describe, expect, it } from 'vitest';
import {
  createHolidaySchema,
  updateHolidaySchema,
  listHolidaysQuerySchema,
  createHolidayTypeSchema,
  updateHolidayTypeSchema,
  bulkCreateHolidaySchema
} from '../../src/modules/holiday/holiday.schema.js';

describe('createHolidaySchema', () => {
  it('parses valid holiday input and coerces date', () => {
    const parsed = createHolidaySchema.parse({
      name: 'New Year',
      date: '2026-01-01T00:00:00.000Z',
      description: 'First day of the year',
      isOptional: false,
      type: 'type-123'
    });

    expect(parsed.name).toBe('New Year');
    expect(parsed.date).toBeInstanceOf(Date);
    expect(parsed.description).toBe('First day of the year');
    expect(parsed.isOptional).toBe(false);
    expect(parsed.type).toBe('type-123');
  });

  it('rejects missing or empty name', () => {
    expect(() =>
      createHolidaySchema.parse({
        name: '   ',
        date: '2026-01-01'
      })
    ).toThrow();
  });

  it('rejects invalid date', () => {
    expect(() =>
      createHolidaySchema.parse({
        name: 'Labor Day',
        date: 'not-a-date'
      })
    ).toThrow();
  });

  it('allows isOptional to be omitted', () => {
    const parsed = createHolidaySchema.parse({
      name: 'Republic Day',
      date: '2026-01-26'
    });

    expect(parsed.isOptional).toBeUndefined();
  });
});

describe('updateHolidaySchema', () => {
  it('allows partial updates', () => {
    const parsed = updateHolidaySchema.parse({
      name: 'Updated Name',
      isOptional: true
    });

    expect(parsed.name).toBe('Updated Name');
    expect(parsed.isOptional).toBe(true);
    expect(parsed.date).toBeUndefined();
  });
});

describe('listHolidaysQuerySchema', () => {
  it('coerces year, month, and isOptional from query strings', () => {
    const parsed = listHolidaysQuerySchema.parse({
      year: '2026',
      month: '11',
      isOptional: 'true',
      limit: '50'
    });

    expect(parsed.year).toBe(2026);
    expect(parsed.month).toBe(11);
    expect(parsed.isOptional).toBe(true);
    expect(parsed.limit).toBe(50);
  });
});

describe('bulkCreateHolidaySchema', () => {
  it('parses array of holidays', () => {
    const parsed = bulkCreateHolidaySchema.parse({
      holidays: [
        { name: 'Holiday 1', date: '2026-05-01' },
        { name: 'Holiday 2', date: '2026-08-15' }
      ]
    });

    expect(parsed.holidays).toHaveLength(2);
    expect(parsed.holidays[0]?.name).toBe('Holiday 1');
  });

  it('rejects empty array', () => {
    expect(() =>
      bulkCreateHolidaySchema.parse({
        holidays: []
      })
    ).toThrow();
  });
});

describe('createHolidayTypeSchema', () => {
  it('validates name and optional policy', () => {
    const parsed = createHolidayTypeSchema.parse({
      name: 'National Holiday',
      policy: 'Paid leave for all full-time employees'
    });

    expect(parsed.name).toBe('National Holiday');
    expect(parsed.policy).toBe('Paid leave for all full-time employees');
  });

  it('rejects empty name', () => {
    expect(() =>
      createHolidayTypeSchema.parse({
        name: ''
      })
    ).toThrow();
  });
});

describe('updateHolidayTypeSchema', () => {
  it('allows partial name or policy update', () => {
    const parsed = updateHolidayTypeSchema.parse({
      policy: 'Updated policy'
    });

    expect(parsed.policy).toBe('Updated policy');
    expect(parsed.name).toBeUndefined();
  });
});
