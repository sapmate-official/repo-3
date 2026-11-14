import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  holiday: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  holidayType: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  organization: {
    findUnique: vi.fn()
  },
  user: {
    findMany: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

vi.mock('../../src/services/email.service.js', () => ({
  EmailService: {
    sendHolidayAnnouncementEmail: vi.fn().mockResolvedValue(true)
  }
}));

import prisma from '../../src/db/prisma.js';
import { HolidayService, HolidayTypeService } from '../../src/modules/holiday/holiday.service.js';
import { EmailService } from '../../src/services/email.service.js';

describe('HolidayService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listHolidays', () => {
    it('scopes list query strictly to orgId', async () => {
      vi.mocked(prisma.holiday.findMany).mockResolvedValueOnce([
        {
          id: 'h-1',
          orgId: 'org-123',
          name: 'Diwali',
          date: new Date('2026-11-08'),
          description: 'Festival of Lights',
          isOptional: false,
          type: null,
          createdAt: new Date(),
          updatedAt: new Date()
        } as never
      ]);

      const result = await HolidayService.listHolidays('org-123', { year: 2026 });

      expect(prisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-123' })
        })
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Diwali');
    });
  });

  describe('getHolidayById', () => {
    it('returns holiday when orgId matches', async () => {
      vi.mocked(prisma.holiday.findUnique).mockResolvedValueOnce({
        id: 'h-1',
        orgId: 'org-123',
        name: 'Christmas',
        date: new Date('2026-12-25'),
        description: null,
        isOptional: false,
        type: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as never);

      const holiday = await HolidayService.getHolidayById('org-123', 'h-1');
      expect(holiday.name).toBe('Christmas');
    });

    it('throws 404 when holiday belongs to another organization', async () => {
      vi.mocked(prisma.holiday.findUnique).mockResolvedValueOnce({
        id: 'h-1',
        orgId: 'other-org',
        name: 'Christmas',
        date: new Date('2026-12-25')
      } as never);

      await expect(
        HolidayService.getHolidayById('org-123', 'h-1')
      ).rejects.toThrow('Holiday not found');
    });
  });

  describe('createHoliday', () => {
    it('creates holiday and dispatches announcement email in background', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
        id: 'org-123',
        name: 'Acme Corp'
      } as never);

      vi.mocked(prisma.holiday.create).mockResolvedValueOnce({
        id: 'h-new',
        orgId: 'org-123',
        name: 'Independence Day',
        date: new Date('2026-08-15'),
        description: 'National holiday',
        isOptional: false,
        type: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as never);

      vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
        { email: 'emp1@acme.test', firstName: 'Alice', lastName: 'Smith' },
        { email: 'emp2@acme.test', firstName: 'Bob', lastName: 'Jones' }
      ] as never);

      const created = await HolidayService.createHoliday('org-123', {
        name: 'Independence Day',
        date: new Date('2026-08-15'),
        description: 'National holiday'
      });

      expect(created.name).toBe('Independence Day');
      expect(prisma.holiday.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ orgId: 'org-123', name: 'Independence Day' })
        })
      );

      // Verify email announcement was triggered
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(EmailService.sendHolidayAnnouncementEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          companyName: 'Acme Corp',
          holidayName: 'Independence Day'
        })
      );
    });

    it('rejects holiday when type belongs to a different organization', async () => {
      vi.mocked(prisma.holidayType.findUnique).mockResolvedValueOnce({
        id: 'type-foreign',
        orgId: 'foreign-org',
        name: 'Restricted Type'
      } as never);

      await expect(
        HolidayService.createHoliday('org-123', {
          name: 'Some Holiday',
          date: new Date('2026-09-01'),
          type: 'type-foreign'
        })
      ).rejects.toThrow('Invalid holiday type for this organization');
    });
  });

  describe('updateHoliday', () => {
    it('updates holiday when orgId matches', async () => {
      vi.mocked(prisma.holiday.findUnique).mockResolvedValueOnce({
        id: 'h-1',
        orgId: 'org-123',
        name: 'Old Name',
        date: new Date('2026-05-01')
      } as never);

      vi.mocked(prisma.holiday.update).mockResolvedValueOnce({
        id: 'h-1',
        orgId: 'org-123',
        name: 'New Name',
        date: new Date('2026-05-01')
      } as never);

      const updated = await HolidayService.updateHoliday('org-123', 'h-1', {
        name: 'New Name'
      });

      expect(updated.name).toBe('New Name');
    });

    it('rejects update if holiday does not belong to organization', async () => {
      vi.mocked(prisma.holiday.findUnique).mockResolvedValueOnce({
        id: 'h-1',
        orgId: 'other-org',
        name: 'Holiday'
      } as never);

      await expect(
        HolidayService.updateHoliday('org-123', 'h-1', { name: 'Attempt' })
      ).rejects.toThrow('Holiday not found');
    });
  });

  describe('deleteHoliday', () => {
    it('deletes holiday when orgId matches', async () => {
      vi.mocked(prisma.holiday.findUnique).mockResolvedValueOnce({
        id: 'h-1',
        orgId: 'org-123'
      } as never);

      vi.mocked(prisma.holiday.delete).mockResolvedValueOnce({} as never);

      const result = await HolidayService.deleteHoliday('org-123', 'h-1');
      expect(result.success).toBe(true);
      expect(prisma.holiday.delete).toHaveBeenCalledWith({ where: { id: 'h-1' } });
    });
  });

  describe('getCalendar', () => {
    it('formats holidays into calendar entries', async () => {
      vi.mocked(prisma.holiday.findMany).mockResolvedValueOnce([
        {
          id: 'h-1',
          orgId: 'org-123',
          name: 'Holi',
          date: new Date('2026-03-04T00:00:00.000Z'),
          description: 'Festival of colors',
          isOptional: false,
          holidayType: { name: 'Gazetted', policy: 'Paid' }
        } as never
      ]);

      const calendar = await HolidayService.getCalendar('org-123', 2026, 3);
      expect(calendar).toHaveLength(1);
      expect(calendar[0].title).toBe('Holi');
      expect(calendar[0].holidayType).toBe('Gazetted');
      expect(calendar[0].year).toBe(2026);
    });
  });
});

describe('HolidayTypeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listTypes', () => {
    it('lists holiday types for organization', async () => {
      vi.mocked(prisma.holidayType.findMany).mockResolvedValueOnce([
        { id: 'ht-1', orgId: 'org-123', name: 'Gazetted', policy: null } as never
      ]);

      const types = await HolidayTypeService.listTypes('org-123');
      expect(types).toHaveLength(1);
      expect(types[0].name).toBe('Gazetted');
    });
  });

  describe('createType', () => {
    it('creates a new holiday type', async () => {
      vi.mocked(prisma.holidayType.create).mockResolvedValueOnce({
        id: 'ht-new',
        orgId: 'org-123',
        name: 'Floating Holiday',
        policy: '2 floating holidays per year'
      } as never);

      const created = await HolidayTypeService.createType('org-123', {
        name: 'Floating Holiday',
        policy: '2 floating holidays per year'
      });

      expect(created.name).toBe('Floating Holiday');
    });
  });

  describe('deleteType', () => {
    it('rejects deletion when holiday type is in use by holidays', async () => {
      vi.mocked(prisma.holidayType.findUnique).mockResolvedValueOnce({
        id: 'ht-1',
        orgId: 'org-123',
        Holiday: [{ id: 'h-1' }]
      } as never);

      await expect(
        HolidayTypeService.deleteType('org-123', 'ht-1')
      ).rejects.toThrow('Cannot delete holiday type as it is in use by one or more holidays');
    });

    it('deletes holiday type when not in use', async () => {
      vi.mocked(prisma.holidayType.findUnique).mockResolvedValueOnce({
        id: 'ht-1',
        orgId: 'org-123',
        Holiday: []
      } as never);

      vi.mocked(prisma.holidayType.delete).mockResolvedValueOnce({} as never);

      const result = await HolidayTypeService.deleteType('org-123', 'ht-1');
      expect(result.success).toBe(true);
    });
  });
});
