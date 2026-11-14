import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/util/errors.js';

const prismaMock = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import prisma from '../../src/db/prisma.js';
import {
  OrganizationChartService,
  DepartmentNode,
  UserNode
} from '../../src/modules/organization/organization.chart.service.js';

describe('OrganizationChartService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildHierarchicalStructure', () => {
    it('nests sub-departments and places users under department heads and managers', () => {
      const mockOrg = {
        departments: [
          {
            id: 'dept-parent',
            name: 'Engineering',
            description: 'Tech dept',
            location: 'HQ',
            budget: 100000,
            parentId: null,
            headId: 'user-head',
            departmentHead: {
              id: 'user-head',
              firstName: 'Alan',
              lastName: 'Turing',
              email: 'alan@tech.com',
              employeeId: 'EMP001',
              departmentId: 'dept-parent',
              managerId: null
            },
            users: []
          },
          {
            id: 'dept-sub',
            name: 'DevOps',
            description: 'Infra',
            location: 'HQ',
            budget: 50000,
            parentId: 'dept-parent',
            headId: null,
            departmentHead: null,
            users: []
          }
        ],
        users: [
          {
            id: 'user-head',
            firstName: 'Alan',
            lastName: 'Turing',
            email: 'alan@tech.com',
            employeeId: 'EMP001',
            departmentId: 'dept-parent',
            managerId: null,
            manager: null,
            subordinates: [{ id: 'user-dev', firstName: 'Grace', lastName: 'Hopper' }]
          },
          {
            id: 'user-dev',
            firstName: 'Grace',
            lastName: 'Hopper',
            email: 'grace@tech.com',
            employeeId: 'EMP002',
            departmentId: 'dept-parent',
            managerId: 'user-head',
            manager: { id: 'user-head', firstName: 'Alan', lastName: 'Turing' },
            subordinates: []
          }
        ]
      };

      const result = OrganizationChartService.buildHierarchicalStructure(mockOrg);

      expect(result).toHaveLength(1);
      const rootDept = result[0] as DepartmentNode;
      expect(rootDept.id).toBe('dept-parent');
      expect(rootDept.type).toBe('department');

      // Check sub-department is in children
      const subDept = rootDept.children.find((c) => c.type === 'department' && c.id === 'dept-sub');
      expect(subDept).toBeDefined();

      // Check head is in children
      const headUser = rootDept.children.find((c) => c.type === 'user' && c.id === 'user-head') as UserNode;
      expect(headUser).toBeDefined();
      expect(headUser.isHead).toBe(true);

      // Check Grace (subordinate) is nested under Alan (manager)
      expect(headUser.children).toHaveLength(1);
      expect(headUser.children[0].id).toBe('user-dev');
    });
  });

  describe('buildManagerSubordinateStructure', () => {
    const mockOrgData = {
      users: [
        {
          id: 'ceo',
          firstName: 'Chief',
          lastName: 'Executive',
          email: 'ceo@org.com',
          employeeId: 'EMP001',
          departmentId: null,
          managerId: null,
          department: null,
          manager: null,
          subordinates: [
            { id: 'mgr-1', firstName: 'Manager', lastName: 'One' }
          ],
          roles: [{ role: { id: 'r1', name: 'Org_Admin' } }]
        },
        {
          id: 'mgr-1',
          firstName: 'Manager',
          lastName: 'One',
          email: 'm1@org.com',
          employeeId: 'EMP002',
          departmentId: null,
          managerId: 'ceo',
          department: null,
          manager: { id: 'ceo', firstName: 'Chief', lastName: 'Executive' },
          subordinates: [
            { id: 'dev-1', firstName: 'Dev', lastName: 'One' },
            { id: 'dev-2', firstName: 'Dev', lastName: 'Two' }
          ],
          roles: []
        },
        {
          id: 'dev-1',
          firstName: 'Dev',
          lastName: 'One',
          email: 'd1@org.com',
          employeeId: 'EMP003',
          departmentId: null,
          managerId: 'mgr-1',
          department: null,
          manager: { id: 'mgr-1', firstName: 'Manager', lastName: 'One' },
          subordinates: [],
          roles: []
        },
        {
          id: 'dev-2',
          firstName: 'Dev',
          lastName: 'Two',
          email: 'd2@org.com',
          employeeId: 'EMP004',
          departmentId: null,
          managerId: 'mgr-1',
          department: null,
          manager: { id: 'mgr-1', firstName: 'Manager', lastName: 'One' },
          subordinates: [],
          roles: []
        }
      ],
      departments: []
    };

    it('returns full tree from root users for Org Admin', () => {
      const chart = OrganizationChartService.buildManagerSubordinateStructure(
        mockOrgData,
        'ceo',
        true // isOrgAdmin
      );

      expect(chart).toHaveLength(1);
      expect(chart[0].id).toBe('ceo');
      expect(chart[0].children).toHaveLength(1);
      expect(chart[0].children[0].id).toBe('mgr-1');
      expect(chart[0].children[0].children).toHaveLength(2);
    });

    it('returns scoped hierarchy around focus user for non-admin', () => {
      const chart = OrganizationChartService.buildManagerSubordinateStructure(
        mockOrgData,
        'dev-1',
        false // not org admin
      );

      // Focus user dev-1: root of visible tree is grandparent 'ceo'
      expect(chart).toHaveLength(1);
      expect(chart[0].id).toBe('ceo');
      // CEO's children has manager 'mgr-1'
      expect(chart[0].children).toHaveLength(1);
      const managerNode = chart[0].children[0];
      expect(managerNode.id).toBe('mgr-1');
      // Children of manager include dev-1 and sibling dev-2
      expect(managerNode.children.map((c) => c.id).sort()).toEqual(['dev-1', 'dev-2']);
    });
  });

  describe('getOrganizationChart', () => {
    it('throws AppError if organization is not found', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce(null);

      await expect(
        OrganizationChartService.getOrganizationChart('non-existent-org')
      ).rejects.toThrow(AppError);
    });

    it('returns organization name and chart structure', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
        id: 'org-1',
        name: 'Test Org',
        departments: [],
        users: []
      } as never);

      const result = await OrganizationChartService.getOrganizationChart('org-1');
      expect(result.organization.id).toBe('org-1');
      expect(result.organization.name).toBe('Test Org');
      expect(result.chart).toEqual([]);
    });
  });

  describe('getManagerSubordinateChart', () => {
    it('detects isOrgAdmin and returns manager chart structure', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
        id: 'org-1',
        name: 'Test Org',
        users: [
          {
            id: 'admin-1',
            firstName: 'Admin',
            lastName: 'User',
            email: 'admin@org.com',
            employeeId: 'A001',
            departmentId: null,
            managerId: null,
            department: null,
            manager: null,
            subordinates: [],
            roles: [{ role: { id: 'r1', name: 'Org_Admin' } }]
          }
        ],
        departments: [],
        Organization_admin: [{ adminId: 'admin-1' }]
      } as never);

      const result = await OrganizationChartService.getManagerSubordinateChart(
        'org-1',
        'admin-1'
      );

      expect(result.organization.id).toBe('org-1');
      expect(result.isOrgAdmin).toBe(true);
      expect(result.focusUserId).toBe('admin-1');
      expect(result.chart).toHaveLength(1);
    });
  });
});
