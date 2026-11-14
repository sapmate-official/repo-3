import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const prismaMock = vi.hoisted(() => ({
  organization: { findUnique: vi.fn() },
  holiday: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  holidayType: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  user: { findMany: vi.fn() }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { HolidayController, HolidayTypeController } from '../../src/modules/holiday/holiday.controller.js';
import { HolidayService, HolidayTypeService } from '../../src/modules/holiday/holiday.service.js';

describe('HolidayController getById legacy resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  it('lists holidays when :id matches caller orgId', async () => {
    const req = {
      params: { id: 'org-test-1' },
      query: {},
      user: { orgId: 'org-test-1' }
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    const listSpy = vi.spyOn(HolidayService, 'listHolidays').mockResolvedValueOnce([
      { id: 'h-1', orgId: 'org-test-1', name: 'Diwali' } as never
    ]);

    await HolidayController.getById(req, res, next);

    expect(listSpy).toHaveBeenCalledWith('org-test-1', expect.anything());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ name: 'Diwali' })]);
  });

  it('fetches single holiday when :id is a holiday id', async () => {
    const req = {
      params: { id: 'holiday-123' },
      query: {},
      user: { orgId: 'org-test-1' }
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    const getSpy = vi.spyOn(HolidayService, 'getHolidayById').mockResolvedValueOnce({
      id: 'holiday-123',
      orgId: 'org-test-1',
      name: 'Christmas'
    } as never);

    await HolidayController.getById(req, res, next);

    expect(getSpy).toHaveBeenCalledWith('org-test-1', 'holiday-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'Christmas' }));
  });

  it('lists holiday types when :id matches caller orgId', async () => {
    const req = {
      params: { id: 'org-test-1' },
      query: {},
      user: { orgId: 'org-test-1' }
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    const listSpy = vi.spyOn(HolidayTypeService, 'listTypes').mockResolvedValueOnce([
      { id: 'ht-1', orgId: 'org-test-1', name: 'National' } as never
    ]);

    await HolidayTypeController.getById(req, res, next);

    expect(listSpy).toHaveBeenCalledWith('org-test-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: [expect.objectContaining({ name: 'National' })]
    }));
  });
});
