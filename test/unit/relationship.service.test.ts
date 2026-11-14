import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/util/errors.js';

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn()
  },
  organization_admin: {
    findFirst: vi.fn(),
    findMany: vi.fn()
  },
  department: {
    findFirst: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import prisma from '../../src/db/prisma.js';
import { RelationshipService } from '../../src/modules/relationship/relationship.service.js';

describe('RelationshipService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkIndirectManagership', () => {
    it('returns true when targetUser directly reports to managerId', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        managerId: 'manager-1'
      } as never);

      const result = await RelationshipService.checkIndirectManagership('manager-1', 'sub-1');
      expect(result).toBe(true);
    });

    it('returns true when targetUser indirectly reports to managerId (multi-level)', async () => {
      // First call for sub-1 -> reports to manager-intermediate
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({ managerId: 'mgr-inter' } as never)
        // Second call for mgr-inter -> reports to big-boss
        .mockResolvedValueOnce({ managerId: 'big-boss' } as never);

      const result = await RelationshipService.checkIndirectManagership('big-boss', 'sub-1');
      expect(result).toBe(true);
    });

    it('returns false when targetUser has no manager', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        managerId: null
      } as never);

      const result = await RelationshipService.checkIndirectManagership('manager-1', 'root-user');
      expect(result).toBe(false);
    });

    it('returns false when chain terminates without finding managerId', async () => {
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({ managerId: 'mgr-2' } as never)
        .mockResolvedValueOnce({ managerId: null } as never);

      const result = await RelationshipService.checkIndirectManagership('manager-1', 'sub-1');
      expect(result).toBe(false);
    });

    it('stops and returns false when maxDepth is reached (cycle prevention)', async () => {
      // Return cyclically
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ managerId: 'other-user' } as never);

      const result = await RelationshipService.checkIndirectManagership('never-found', 'sub-1', 0, 3);
      expect(result).toBe(false);
    });
  });

  describe('getRelationshipWithUser', () => {
    it('returns relationship with self properly', async () => {
      const mockUser = {
        id: 'user-1',
        orgId: 'org-1',
        firstName: 'Self',
        lastName: 'User',
        email: 'self@example.com',
        roles: [
          {
            role: {
              name: 'Employee',
              permissions: [
                {
                  permission: {
                    key: 'view_personal_info_to_myself',
                    name: 'View Personal Info'
                  }
                }
              ]
            }
          }
        ]
      };

      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(mockUser as never) // current user
        .mockResolvedValueOnce(mockUser as never); // target user is self
      vi.mocked(prisma.organization_admin.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const res = await RelationshipService.getRelationshipWithUser('user-1', 'user-1');

      expect(res.userId).toBe('user-1');
      expect(res.isOrgAdmin).toBe(false);
      expect(res.relationship?.isSelf).toBe(true);
      expect(res.relationship?.canViewProfile).toBe(true);
      expect(res.relationship?.canEditProfile).toBe(true);
      expect(res.relationship?.canViewSalary).toBe(true);
      expect(res.relationship?.canViewPersonalInfo).toBe(true);
      expect(res.relationship?.canViewEmploymentInfo).toBe(true);
    });

    it('grants full permissions to Org Admin viewing another employee', async () => {
      const adminUser = {
        id: 'admin-1',
        orgId: 'org-1',
        roles: [{ role: { name: 'Org_Admin', permissions: [] } }]
      };
      const employeeUser = {
        id: 'emp-2',
        orgId: 'org-1',
        firstName: 'Target',
        lastName: 'Employee',
        email: 'target@example.com',
        managerId: 'someone-else',
        roles: [{ role: { name: 'Employee', permissions: [] } }]
      };

      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(adminUser as never) // current user
        .mockResolvedValueOnce(employeeUser as never) // target user
        .mockResolvedValueOnce({ managerId: 'mgr-3' } as never) // checkIndirect
        .mockResolvedValueOnce({ managerId: null } as never);
      vi.mocked(prisma.organization_admin.findFirst).mockResolvedValueOnce({ id: 'admin-row' } as never);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const res = await RelationshipService.getRelationshipWithUser('admin-1', 'emp-2');

      expect(res.isOrgAdmin).toBe(true);
      expect(res.targetUser?.id).toBe('emp-2');
      expect(res.relationship?.canViewProfile).toBe(true);
      expect(res.relationship?.canEditProfile).toBe(true);
      expect(res.relationship?.canViewSalary).toBe(true);
      expect(res.relationship?.canViewBankDetails).toBe(true);
      expect(res.relationship?.canViewPersonalInfo).toBe(true);
      expect(res.relationship?.canViewEmploymentInfo).toBe(true);
    });

    it('throws TENANT_MISMATCH when target user belongs to another org', async () => {
      const currentUser = {
        id: 'user-1',
        orgId: 'org-1',
        roles: []
      };
      const targetUser = {
        id: 'user-2',
        orgId: 'org-different',
        roles: []
      };

      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(currentUser as never)
        .mockResolvedValueOnce(targetUser as never);

      await expect(
        RelationshipService.getRelationshipWithUser('user-1', 'user-2')
      ).rejects.toThrow(AppError);
    });

    it('throws TARGET_USER_NOT_FOUND when target user does not exist', async () => {
      const currentUser = {
        id: 'user-1',
        orgId: 'org-1',
        roles: []
      };

      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(currentUser as never)
        .mockResolvedValueOnce(null);

      await expect(
        RelationshipService.getRelationshipWithUser('user-1', 'nonexistent')
      ).rejects.toThrow(AppError);
    });
  });

  describe('getOrganizationRelationship', () => {
    it('returns organization role and admin summaries', async () => {
      const mockUser = {
        id: 'user-1',
        orgId: 'org-1',
        roles: [
          {
            role: {
              name: 'Employee',
              permissions: [
                {
                  permission: {
                    key: 'some_perm',
                    name: 'Some Perm',
                    description: 'desc'
                  }
                }
              ]
            }
          }
        ]
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(mockUser as never);
      vi.mocked(prisma.organization_admin.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'sub-1' } as never); // has subordinates
      vi.mocked(prisma.user.count).mockResolvedValue(3);
      vi.mocked(prisma.department.findFirst).mockResolvedValue({ id: 'dept-1', name: 'Engineering' } as never);
      vi.mocked(prisma.organization_admin.findMany).mockResolvedValue([
        {
          admin_user: {
            id: 'admin-1',
            firstName: 'Chief',
            lastName: 'Admin',
            email: 'admin@org.com'
          }
        }
      ] as never);

      const res = await RelationshipService.getOrganizationRelationship('user-1');

      expect(res.userId).toBe('user-1');
      expect(res.organizationRole.isManager).toBe(true);
      expect(res.organizationRole.isDepartmentHead).toBe(true);
      expect(res.organizationRole.departmentName).toBe('Engineering');
      expect(res.organizationRole.subordinateCount).toBe(3);
      expect(res.organizationRole.organizationAdmins).toHaveLength(1);
      expect(res.organizationRole.organizationAdmins[0].name).toBe('Chief Admin');
      expect(res.permissions).toHaveLength(1);
    });
  });
});
