import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db/prisma.js', () => {
  const db = {
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    superAdmin: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    emailOtpVerification: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    tempLoginSession: {
      findFirst: vi.fn(),
      update: vi.fn()
    },
    authSession: {
      updateMany: vi.fn()
    },
    $transaction: vi.fn()
  };

  db.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof db) => unknown)(db);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });

  return { default: db };
});

import prisma from '../../src/db/prisma.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';

const sensitiveKeys = ['hashedPassword', 'refreshToken', 'verificationToken', 'verificationTokenExpiry'];

const expectNoSensitiveFields = (value: Record<string, unknown>) => {
  for (const key of sensitiveKeys) {
    expect(value).not.toHaveProperty(key);
  }
};

const profileRow = {
  id: 'user-1',
  email: 'user@example.com',
  businessEmail: 'business@example.com',
  personalEmail: 'personal@example.com',
  firstName: 'Test',
  lastName: 'User',
  employeeId: 'EMP-1',
  jobTitle: 'Engineer',
  mobileNumber: '+10000000000',
  orgId: 'org-1',
  status: 'active',
  hashedPassword: '$2b$10$should-not-leak',
  refreshToken: 'refresh-token-should-not-leak',
  verificationToken: 'verify-token-should-not-leak',
  verificationTokenExpiry: new Date('2030-01-01T00:00:00.000Z'),
  organization: { id: 'org-1', name: 'Acme', isActive: true },
  department: { id: 'dept-1', name: 'Engineering' },
  roles: [
    {
      role: {
        id: 'role-1',
        name: 'Employee',
        permissions: [{ permission: { id: 'perm-1', key: 'view_self' } }]
      }
    }
  ]
};

describe('AuthService.setPassword', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findFirst).mockReset();
    vi.mocked(prisma.user.update).mockReset();
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['non-string', 123]
  ])('rejects a %s verification token without touching the database', async (_label, token) => {
    await expect(AuthService.setPassword('NewPassword123!', token as string)).rejects.toThrow(
      /valid verification token/
    );
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown verification token', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await expect(AuthService.setPassword('NewPassword123!', 'unknown-token')).rejects.toThrow(
      /Invalid or expired/
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('hashes the password, activates the user and clears the verification token', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-1',
      verificationToken: 'verify-token',
      verificationTokenExpiry: new Date(Date.now() + 60_000),
      createdAt: new Date()
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      businessEmail: null,
      personalEmail: null,
      firstName: 'Test',
      lastName: 'User',
      orgId: 'org-1',
      status: 'active',
      hashedPassword: '$2b$10$should-not-leak',
      refreshToken: 'refresh-token-should-not-leak',
      verificationToken: 'verify-token-should-not-leak'
    } as never);

    const result = await AuthService.setPassword('NewPassword123!', '  verify-token  ');

    const updateArgs = vi.mocked(prisma.user.update).mock.calls[0]![0] as unknown as {
      data: Record<string, unknown>;
      where: { id: string };
    };

    expect(updateArgs.where.id).toBe('user-1');
    expect(updateArgs.data.status).toBe('active');
    expect(updateArgs.data.verificationToken).toBeNull();
    expect(updateArgs.data.hashedPassword).not.toBe('NewPassword123!');
    expect(String(updateArgs.data.hashedPassword)).toMatch(/^\$2[aby]\$/);

    expectNoSensitiveFields(result as unknown as Record<string, unknown>);
    expect(result).toMatchObject({
      id: 'user-1',
      email: 'user@example.com',
      orgId: 'org-1',
      status: 'active'
    });
  });

  it('trims the verification token before lookup', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await expect(AuthService.setPassword('NewPassword123!', '  token  ')).rejects.toThrow();

    const findArgs = vi.mocked(prisma.user.findFirst).mock.calls[0]![0] as unknown as {
      where: { verificationToken: { in: string[] } };
    };
    expect(findArgs.where.verificationToken.in).toContain('token');
  });

  it('rejects an expired verification token', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'user-1',
      verificationToken: 'expired-token',
      verificationTokenExpiry: new Date(Date.now() - 1_000),
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    } as never);

    await expect(AuthService.setPassword('NewPassword123!', 'expired-token')).rejects.toThrow(
      /Invalid or expired/
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AuthService.getUserProfile', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findFirst).mockReset();
    vi.mocked(prisma.superAdmin.findUnique).mockReset();
  });

  it('returns an explicit DTO without sensitive fields', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(profileRow as never);

    const result = await AuthService.getUserProfile('user-1', 'org-1');

    expectNoSensitiveFields(result as unknown as Record<string, unknown>);
    expect(result).toMatchObject({
      id: 'user-1',
      email: 'user@example.com',
      orgId: 'org-1',
      roles: ['Employee'],
      permissions: ['view_self'],
      isSuperAdmin: false,
      organization: { id: 'org-1', name: 'Acme', isActive: true },
      department: { id: 'dept-1', name: 'Engineering' }
    });
  });

  it('scopes the lookup to the provided organization', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(profileRow as never);

    await AuthService.getUserProfile('user-1', 'org-1');

    const findArgs = vi.mocked(prisma.user.findFirst).mock.calls[0]![0] as unknown as {
      where: { id: string; orgId?: string };
    };
    expect(findArgs.where).toEqual({ id: 'user-1', orgId: 'org-1' });
  });

  it('rejects a missing user', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await expect(AuthService.getUserProfile('missing')).rejects.toThrow(/User not found/);
  });

  it('rejects an inactive user', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...profileRow, status: 'inactive' } as never);
    await expect(AuthService.getUserProfile('user-1')).rejects.toThrow(/inactive/);
  });

  it('rejects an inactive organization', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      ...profileRow,
      organization: { ...profileRow.organization, isActive: false }
    } as never);
    await expect(AuthService.getUserProfile('user-1')).rejects.toThrow(/Organization is inactive/);
  });

  it('returns a safe super-admin profile', async () => {
    vi.mocked(prisma.superAdmin.findUnique).mockResolvedValue({
      id: 'sa-1',
      email: 'root@example.com',
      name: 'Root',
      hashedPassword: 'should-not-leak',
      refreshToken: 'should-not-leak'
    } as never);

    const result = await AuthService.getUserProfile('sa-1', undefined, true);

    expectNoSensitiveFields(result as unknown as Record<string, unknown>);
    expect(result).toMatchObject({
      id: 'sa-1',
      email: 'root@example.com',
      name: 'Root',
      isSuperAdmin: true,
      superAdmin: true
    });
  });

  it('rejects a missing super-admin', async () => {
    vi.mocked(prisma.superAdmin.findUnique).mockResolvedValue(null);
    await expect(AuthService.getUserProfile('sa-1', undefined, true)).rejects.toThrow(
      /Super-admin not found/
    );
  });
});
