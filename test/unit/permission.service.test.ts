import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  permission: {
    findMany: vi.fn(),
    create: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import prisma from '../../src/db/prisma.js';
import { PermissionService } from '../../src/modules/permission/permission.service.js';
import { PERMISSION_KEYS } from '../../src/modules/auth/permissionKeys.js';

describe('PermissionService', () => {
  beforeEach(() => {
    vi.mocked(prisma.permission.findMany).mockReset();
    vi.mocked(prisma.permission.create).mockReset();
  });

  it('seeds the same permission keys used by authorization guards', async () => {
    vi.mocked(prisma.permission.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    await PermissionService.listPermissions();

    const seededKeys = vi.mocked(prisma.permission.create).mock.calls.map(
      ([args]) => args.data.key
    );

    expect(seededKeys).toEqual(
      expect.arrayContaining([
        PERMISSION_KEYS.userRead,
        PERMISSION_KEYS.userWrite,
        PERMISSION_KEYS.roleManage,
        PERMISSION_KEYS.departmentCreate,
        PERMISSION_KEYS.departmentUpdate,
        PERMISSION_KEYS.departmentDelete,
        PERMISSION_KEYS.departmentHead,
        PERMISSION_KEYS.viewSubordinates,
        PERMISSION_KEYS.personalSelfUpdate,
        PERMISSION_KEYS.employeeSelfUpdate,
        PERMISSION_KEYS.salarySelfUpdate,
        PERMISSION_KEYS.personalAllUpdate
      ])
    );
  });
});
