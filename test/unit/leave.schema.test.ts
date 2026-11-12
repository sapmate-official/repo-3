import { describe, expect, it } from 'vitest';
import {
  leaveBalanceCreateSchema,
  leaveRejectSchema,
  leaveRequestCreateSchema,
  leaveTypeCreateSchema,
  leaveTypeUpdateSchema
} from '../../src/modules/leave/leave.schema.js';

describe('leaveTypeCreateSchema', () => {
  it('applies defaults and coerces numeric strings', () => {
    const parsed = leaveTypeCreateSchema.parse({
      name: 'Annual Leave',
      annualLimit: '20',
      maxCarryForward: '5'
    });

    expect(parsed).toMatchObject({
      name: 'Annual Leave',
      annualLimit: 20,
      requiresApproval: true,
      isPaid: true,
      carryForward: false,
      maxCarryForward: 5
    });
  });

  it('coerces boolean strings used by legacy clients', () => {
    const parsed = leaveTypeCreateSchema.parse({
      name: 'Unpaid Leave',
      annualLimit: 5,
      requiresApproval: 'false',
      isPaid: 'false',
      carryForward: 'true'
    });

    expect(parsed.requiresApproval).toBe(false);
    expect(parsed.isPaid).toBe(false);
    expect(parsed.carryForward).toBe(true);
  });

  it('rejects negative annual limits', () => {
    expect(() =>
      leaveTypeCreateSchema.parse({ name: 'Invalid', annualLimit: -1 })
    ).toThrow();
  });
});

describe('leaveTypeUpdateSchema', () => {
  it('allows partial updates', () => {
    expect(leaveTypeUpdateSchema.parse({ annualLimit: 25 })).toEqual({
      annualLimit: 25
    });
  });

  it('rejects blank names', () => {
    expect(() => leaveTypeUpdateSchema.parse({ name: '   ' })).toThrow();
  });
});

describe('leaveRequestCreateSchema', () => {
  it('accepts a date-only leave request', () => {
    const parsed = leaveRequestCreateSchema.parse({
      leaveTypeId: 'leave-type-1',
      startDate: '2026-12-01',
      endDate: '2026-12-02',
      reason: 'Family event'
    });

    expect(parsed.startDate).toBe('2026-12-01');
    expect(parsed.endDate).toBe('2026-12-02');
  });

  it('rejects non-date values', () => {
    expect(() =>
      leaveRequestCreateSchema.parse({
        leaveTypeId: 'leave-type-1',
        startDate: '01-12-2026',
        endDate: '2026-12-02',
        reason: 'Family event'
      })
    ).toThrow();
  });

  it('requires a reason', () => {
    expect(() =>
      leaveRequestCreateSchema.parse({
        leaveTypeId: 'leave-type-1',
        startDate: '2026-12-01',
        endDate: '2026-12-02',
        reason: '   '
      })
    ).toThrow();
  });
});

describe('leaveRejectSchema', () => {
  it('requires a rejection reason', () => {
    expect(() => leaveRejectSchema.parse({ rejectedReason: '' })).toThrow();
  });
});

describe('leaveBalanceCreateSchema', () => {
  it('coerces numeric strings', () => {
    const parsed = leaveBalanceCreateSchema.parse({
      userId: 'user-1',
      leaveTypeId: 'leave-type-1',
      remainingDays: '12',
      year: '2026'
    });

    expect(parsed.remainingDays).toBe(12);
    expect(parsed.year).toBe(2026);
    expect(parsed.usedDays).toBe(0);
    expect(parsed.carryForward).toBe(0);
  });
});
