import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  superAdmin: { findUnique: vi.fn() },
  organization: { findUnique: vi.fn() },
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
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { PERMISSION_KEYS } from '../../src/modules/auth/permissionKeys.js';

const app = createApp();

const signUserToken = (payload: Record<string, unknown>): string =>
  jwt.sign(payload, env.USER_ACCESS_TOKEN_SECRET, {
    expiresIn: '15m',
    issuer: 'alkaa-backend-ts',
    audience: 'alkaa-clients'
  });

const authHeader = (user: { id: string; orgId: string }) => {
  const token = signUserToken({
    id: user.id,
    email: `${user.id}@example.test`,
    orgId: user.orgId,
    typ: 'user'
  });
  return `Bearer ${token}`;
};

const makeUser = (
  id: string,
  orgId: string,
  roles: { name: string; permissions?: string[] }[] = []
) => ({
  id,
  email: `${id}@example.test`,
  orgId,
  firstName: 'Test',
  lastName: 'User',
  status: 'active',
  roles: roles.map((role) => ({
    role: {
      name: role.name,
      permissions: (role.permissions ?? []).map((key) => ({
        permission: { key }
      }))
    }
  }))
});

describe('Holiday & HolidayType Route Authorization & Dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Authentication & Scoping', () => {
    it('rejects unauthenticated requests to /api/v2/holiday', async () => {
      const res = await request(app).get('/api/v2/holiday');
      expect(res.status).toBe(401);
    });

    it('rejects access without holiday_view permission', async () => {
      const regularUser = makeUser('user-1', 'org-a', [{ name: 'Employee', permissions: [] }]);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(regularUser);

      const res = await request(app)
        .get('/api/v2/holiday')
        .set('Authorization', authHeader(regularUser));

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Missing one of required permissions');
    });

    it('allows access with holiday_view permission via /api/v2/holiday/:orgId legacy format', async () => {
      const viewerUser = makeUser('user-2', 'org-a', [
        { name: 'Employee', permissions: [PERMISSION_KEYS.holidayView] }
      ]);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(viewerUser);
      vi.mocked(prismaMock.holiday.findMany).mockResolvedValue([
        {
          id: 'h-1',
          orgId: 'org-a',
          name: 'Independence Day',
          date: new Date('2026-08-15'),
          description: null,
          isOptional: false,
          holidayType: null
        } as never
      ]);

      const res = await request(app)
        .get('/api/v2/holiday/org-a')
        .set('Authorization', authHeader(viewerUser));

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({ id: 'h-1', name: 'Independence Day' })
      ]);
    });

    it('allows access with holiday_view permission', async () => {
      const viewerUser = makeUser('user-2', 'org-a', [
        { name: 'Employee', permissions: [PERMISSION_KEYS.holidayView] }
      ]);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(viewerUser);
      vi.mocked(prismaMock.holiday.findMany).mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v2/holiday')
        .set('Authorization', authHeader(viewerUser));

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(prismaMock.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-a' })
        })
      );
    });

    it('allows Org_Admin to manage holidays without explicit permission key', async () => {
      const adminUser = makeUser('admin-1', 'org-a', [{ name: 'Org_Admin' }]);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(adminUser);
      vi.mocked(prismaMock.organization.findUnique).mockResolvedValue({ id: 'org-a', name: 'Org A' });
      vi.mocked(prismaMock.holiday.create).mockResolvedValue({
        id: 'h-1',
        orgId: 'org-a',
        name: 'New Year',
        date: new Date('2026-01-01'),
        description: null,
        isOptional: false,
        type: null,
        holidayType: null
      });

      const res = await request(app)
        .post('/api/v2/holiday')
        .set('Authorization', authHeader(adminUser))
        .send({
          name: 'New Year',
          date: '2026-01-01T00:00:00.000Z'
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('New Year');
    });

    it('rejects cross-tenant access via org/:orgId route', async () => {
      const user = makeUser('user-1', 'org-a', [
        { name: 'Employee', permissions: [PERMISSION_KEYS.holidayView] }
      ]);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(user);

      const res = await request(app)
        .get('/api/v2/holiday/org/org-b')
        .set('Authorization', authHeader(user));

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('You cannot access data outside your organization');
    });
  });

  describe('Route Collision Prevention', () => {
    it('routes /calendar to calendar handler instead of /:id', async () => {
      const adminUser = makeUser('admin-1', 'org-a', [{ name: 'Org_Admin' }]);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(adminUser);
      vi.mocked(prismaMock.holiday.findMany).mockResolvedValue([
        {
          id: 'h-cal',
          orgId: 'org-a',
          name: 'Republic Day',
          date: new Date('2026-01-26T00:00:00.000Z'),
          description: null,
          isOptional: false,
          holidayType: null
        } as never
      ]);

      const res = await request(app)
        .get('/api/v2/holiday/calendar?year=2026&month=1')
        .set('Authorization', authHeader(adminUser));

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        expect.objectContaining({
          id: 'h-cal',
          title: 'Republic Day',
          year: 2026,
          month: 1,
          day: 26
        })
      ]);
    });

    it('routes /upcoming to upcoming handler instead of /:id', async () => {
      const adminUser = makeUser('admin-1', 'org-a', [{ name: 'Org_Admin' }]);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(adminUser);
      vi.mocked(prismaMock.holiday.findMany).mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v2/holiday/upcoming?limit=3')
        .set('Authorization', authHeader(adminUser));

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(prismaMock.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 3
        })
      );
    });
  });

  describe('Holiday Type Routing', () => {
    it('lists holiday types for tenant with /api/v2/holiday-type/:orgId legacy format', async () => {
      const adminUser = makeUser('admin-1', 'org-a', [{ name: 'Org_Admin' }]);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(adminUser);
      vi.mocked(prismaMock.holidayType.findMany).mockResolvedValue([
        { id: 'ht-1', orgId: 'org-a', name: 'Gazetted', policy: null, _count: { Holiday: 2 } } as never
      ]);

      const res = await request(app)
        .get('/api/v2/holiday-type/org-a')
        .set('Authorization', authHeader(adminUser));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        count: 1,
        data: [{ id: 'ht-1', name: 'Gazetted' }]
      });
    });

    it('lists holiday types for tenant with /api/v2/holiday-type', async () => {
      const adminUser = makeUser('admin-1', 'org-a', [{ name: 'Org_Admin' }]);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(adminUser);
      vi.mocked(prismaMock.holidayType.findMany).mockResolvedValue([
        { id: 'ht-1', orgId: 'org-a', name: 'Gazetted', policy: null, _count: { Holiday: 2 } } as never
      ]);

      const res = await request(app)
        .get('/api/v2/holiday-type')
        .set('Authorization', authHeader(adminUser));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        count: 1,
        data: [{ id: 'ht-1', name: 'Gazetted' }]
      });
    });

    it('creates holiday type under authenticated organization', async () => {
      const adminUser = makeUser('admin-1', 'org-a', [{ name: 'Org_Admin' }]);
      vi.mocked(prismaMock.user.findUnique).mockResolvedValue(adminUser);
      vi.mocked(prismaMock.holidayType.create).mockResolvedValue({
        id: 'ht-new',
        orgId: 'org-a',
        name: 'Restricted',
        policy: 'Optional'
      });

      const res = await request(app)
        .post('/api/v2/holiday-type')
        .set('Authorization', authHeader(adminUser))
        .send({ name: 'Restricted', policy: 'Optional' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        success: true,
        data: { id: 'ht-new', name: 'Restricted' }
      });
    });
  });
});
