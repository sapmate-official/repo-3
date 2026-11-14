import prisma from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';

export interface ChartUserHead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  employeeId: string | null;
  departmentId: string | null;
  managerId: string | null;
}

export interface DepartmentNode {
  id: string;
  name: string;
  type: 'department';
  description?: string | null;
  location?: string | null;
  budget?: number | null;
  parentId?: string | null;
  headId?: string | null;
  head?: ChartUserHead | null;
  users?: unknown[];
  children: (DepartmentNode | UserNode)[];
}

export interface UserNode {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  employeeId: string | null;
  type: 'user';
  departmentId?: string | null;
  departmentName?: string | null;
  department?: { id: string; name: string } | null;
  managerId?: string | null;
  manager?: { id: string; firstName: string | null; lastName: string | null } | null;
  subordinates?: { id: string; firstName: string | null; lastName: string | null }[];
  isHead: boolean;
  isManager: boolean;
  roles?: { role?: { id: string; name: string } }[];
  children: UserNode[];
}

export interface OrganizationChartResponse {
  organization: {
    id: string;
    name: string;
  };
  chart: (DepartmentNode | UserNode)[];
}

export interface OrganizationManagerChartResponse {
  organization: {
    id: string;
    name: string;
  };
  chart: UserNode[];
  focusUserId: string | null;
  isOrgAdmin: boolean;
}

export class OrganizationChartService {
  /**
   * Build hierarchical department and user tree structure.
   */
  static buildHierarchicalStructure(organization: {
    departments: {
      id: string;
      name: string;
      description: string | null;
      location: string | null;
      budget: number | null;
      parentId: string | null;
      headId: string | null;
      departmentHead: ChartUserHead | null;
      users: unknown[];
    }[];
    users: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      employeeId: string | null;
      departmentId: string | null;
      managerId: string | null;
      manager: { id: string; firstName: string | null; lastName: string | null } | null;
      subordinates: { id: string; firstName: string | null; lastName: string | null }[];
    }[];
  }): (DepartmentNode | UserNode)[] {
    const { departments, users } = organization;

    const departmentMap = new Map<string, DepartmentNode>();
    const userMap = new Map<string, UserNode>();

    // 1. Process departments
    for (const dept of departments) {
      departmentMap.set(dept.id, {
        id: dept.id,
        name: dept.name,
        type: 'department',
        description: dept.description,
        location: dept.location,
        budget: dept.budget,
        parentId: dept.parentId,
        headId: dept.headId,
        head: dept.departmentHead,
        users: dept.users,
        children: []
      });
    }

    // 2. Process users
    for (const user of users) {
      userMap.set(user.id, {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        employeeId: user.employeeId,
        type: 'user',
        departmentId: user.departmentId,
        managerId: user.managerId,
        manager: user.manager,
        subordinates: user.subordinates,
        isHead: departments.some((dept) => dept.headId === user.id),
        isManager: Array.isArray(user.subordinates) && user.subordinates.length > 0,
        children: []
      });
    }

    // 3. Build department hierarchy
    const rootNodes: (DepartmentNode | UserNode)[] = [];
    for (const dept of departments) {
      const deptNode = departmentMap.get(dept.id);
      if (!deptNode) continue;
      if (dept.parentId && departmentMap.has(dept.parentId)) {
        const parent = departmentMap.get(dept.parentId);
        parent?.children.push(deptNode);
      } else {
        rootNodes.push(deptNode);
      }
    }

    // 4. Assign users to departments or managers
    for (const user of users) {
      const userNode = userMap.get(user.id);
      if (!userNode) continue;

      if (user.departmentId && departmentMap.has(user.departmentId)) {
        const department = departmentMap.get(user.departmentId);
        if (!department) continue;

        // If user has a manager in the same department, place under manager
        if (user.managerId && userMap.has(user.managerId)) {
          const manager = userMap.get(user.managerId);
          if (manager?.departmentId === user.departmentId) {
            manager.children.push(userNode);
            continue;
          }
        }

        // Add directly to department (head first via unshift, others pushed)
        if (user.id === department.headId) {
          department.children.unshift(userNode);
        } else {
          department.children.push(userNode);
        }
      } else {
        // Users without department
        if (user.managerId && userMap.has(user.managerId)) {
          const manager = userMap.get(user.managerId);
          manager?.children.push(userNode);
        } else {
          rootNodes.push(userNode);
        }
      }
    }

    // 5. Recursively sort children
    const sortNodes = (nodes: (DepartmentNode | UserNode)[]): void => {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          node.children.sort((a, b) => {
            // Departments before users
            if (a.type === 'department' && b.type === 'user') return -1;
            if (a.type === 'user' && b.type === 'department') return 1;

            // Among users: head first, then manager, then alphabetical
            if (a.type === 'user' && b.type === 'user') {
              if (a.isHead && !b.isHead) return -1;
              if (!a.isHead && b.isHead) return 1;
              if (a.isManager && !b.isManager) return -1;
              if (!a.isManager && b.isManager) return 1;
            }

            const nameA =
              a.type === 'department'
                ? a.name
                : `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim();
            const nameB =
              b.type === 'department'
                ? b.name
                : `${b.firstName ?? ''} ${b.lastName ?? ''}`.trim();
            return nameA.localeCompare(nameB);
          });

          sortNodes(node.children);
        }
      }
    };

    sortNodes(rootNodes);
    return rootNodes;
  }

  /**
   * Build manager-subordinate tree hierarchy.
   */
  static buildManagerSubordinateStructure(
    organization: {
      users: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
        employeeId: string | null;
        departmentId: string | null;
        managerId: string | null;
        department: { id: string; name: string } | null;
        manager: { id: string; firstName: string | null; lastName: string | null } | null;
        subordinates: { id: string; firstName: string | null; lastName: string | null }[];
        roles: { role: { id: string; name: string } }[];
      }[];
      departments: {
        id: string;
        name: string;
        headId: string | null;
      }[];
    },
    focusUserId: string | null = null,
    isOrgAdmin = false
  ): UserNode[] {
    const { users, departments } = organization;

    const userMap = new Map<string, UserNode>();
    for (const user of users) {
      userMap.set(user.id, {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        employeeId: user.employeeId,
        type: 'user',
        departmentId: user.departmentId,
        departmentName: user.department?.name,
        department: user.department,
        managerId: user.managerId,
        manager: user.manager,
        subordinates: user.subordinates || [],
        isHead: departments.some((dept) => dept.headId === user.id),
        isManager: Array.isArray(user.subordinates) && user.subordinates.length > 0,
        roles: user.roles || [],
        children: []
      });
    }

    // Build manager-subordinate tree
    for (const user of users) {
      if (user.managerId && userMap.has(user.managerId)) {
        const manager = userMap.get(user.managerId);
        const subordinate = userMap.get(user.id);
        if (manager && subordinate) {
          manager.children.push(subordinate);
        }
      }
    }

    // If org admin: return entire top-level tree
    if (isOrgAdmin) {
      const rootUsers: UserNode[] = [];
      for (const user of users) {
        if (!user.managerId) {
          const node = userMap.get(user.id);
          if (node) rootUsers.push(node);
        }
      }

      rootUsers.sort((a, b) => {
        if (a.isHead && !b.isHead) return -1;
        if (!a.isHead && b.isHead) return 1;
        if (a.isManager && !b.isManager) return -1;
        if (!a.isManager && b.isManager) return 1;
        const nameA = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim();
        const nameB = `${b.firstName ?? ''} ${b.lastName ?? ''}`.trim();
        return nameA.localeCompare(nameB);
      });

      return rootUsers;
    }

    // For regular users: scoped tree around focus user
    if (focusUserId && userMap.has(focusUserId)) {
      const focusUser = userMap.get(focusUserId);
      if (!focusUser) return [];

      const getAllSubordinates = (userId: string, visited = new Set<string>()): UserNode[] => {
        if (visited.has(userId)) return [];
        visited.add(userId);

        const node = userMap.get(userId);
        if (!node) return [];

        const result: UserNode[] = [node];
        for (const child of node.children) {
          result.push(...getAllSubordinates(child.id, visited));
        }
        return result;
      };

      const getSiblings = (userId: string): UserNode[] => {
        const user = userMap.get(userId);
        if (!user?.managerId) return [];
        const manager = userMap.get(user.managerId);
        if (!manager) return [];
        return manager.children.filter((child) => child.id !== userId);
      };

      const visibleUserIds = new Set<string>();

      // 1. Focus user + recursive subordinates
      const subordinateHierarchy = getAllSubordinates(focusUserId);
      for (const u of subordinateHierarchy) visibleUserIds.add(u.id);

      // 2. Manager + siblings + grandparent manager
      if (focusUser.managerId) {
        const manager = userMap.get(focusUser.managerId);
        if (manager) {
          visibleUserIds.add(manager.id);
          for (const sibling of getSiblings(focusUserId)) {
            visibleUserIds.add(sibling.id);
          }
          if (manager.managerId) {
            const grandManager = userMap.get(manager.managerId);
            if (grandManager) {
              visibleUserIds.add(grandManager.id);
            }
          }
        }
      }

      // Rebuild isolated tree for visible users only
      const filteredUserMap = new Map<string, UserNode>();
      for (const id of visibleUserIds) {
        const orig = userMap.get(id);
        if (orig) {
          filteredUserMap.set(id, {
            ...orig,
            children: []
          });
        }
      }

      for (const node of filteredUserMap.values()) {
        if (node.managerId && filteredUserMap.has(node.managerId)) {
          const mgr = filteredUserMap.get(node.managerId);
          mgr?.children.push(node);
        }
      }

      if (focusUser.managerId && filteredUserMap.has(focusUser.managerId)) {
        const mgr = filteredUserMap.get(focusUser.managerId);
        if (mgr?.managerId && filteredUserMap.has(mgr.managerId)) {
          const grand = filteredUserMap.get(mgr.managerId);
          return grand ? [grand] : [mgr];
        }
        return mgr ? [mgr] : [];
      } else {
        const root = filteredUserMap.get(focusUserId);
        return root ? [root] : [];
      }
    }

    return [];
  }

  /**
   * Fetch full organization chart hierarchy.
   */
  static async getOrganizationChart(orgId: string): Promise<OrganizationChartResponse> {
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        departments: {
          include: {
            departmentHead: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                employeeId: true,
                departmentId: true,
                managerId: true
              }
            },
            parentDepartment: {
              select: {
                id: true,
                name: true
              }
            },
            subDepartments: {
              select: {
                id: true,
                name: true
              }
            },
            users: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                employeeId: true,
                departmentId: true,
                managerId: true
              }
            }
          }
        },
        users: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            employeeId: true,
            departmentId: true,
            managerId: true,
            manager: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            },
            subordinates: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!organization) {
      throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    const chartStructure = this.buildHierarchicalStructure(organization);

    return {
      organization: {
        id: organization.id,
        name: organization.name
      },
      chart: chartStructure
    };
  }

  /**
   * Fetch manager-subordinate chart hierarchy.
   */
  static async getManagerSubordinateChart(
    orgId: string,
    currentUserId: string,
    requestedUserId?: string
  ): Promise<OrganizationManagerChartResponse> {
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        users: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            employeeId: true,
            departmentId: true,
            managerId: true,
            department: {
              select: {
                id: true,
                name: true
              }
            },
            manager: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            },
            subordinates: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            },
            roles: {
              include: {
                role: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        },
        departments: {
          select: {
            id: true,
            name: true,
            headId: true
          }
        },
        Organization_admin: {
          select: {
            adminId: true
          }
        }
      }
    });

    if (!organization) {
      throw new AppError('Organization not found', 404, 'ORGANIZATION_NOT_FOUND');
    }

    const isOrgAdminByTable = organization.Organization_admin.some(
      (admin) => admin.adminId === currentUserId
    );
    const currentUserObj = organization.users.find((u) => u.id === currentUserId);
    const isOrgAdminByRole = currentUserObj?.roles.some((r) => r.role.name === 'Org_Admin') ?? false;
    const isOrgAdmin = isOrgAdminByTable || isOrgAdminByRole;

    const focusUserId = requestedUserId ?? currentUserId;
    const managerChart = this.buildManagerSubordinateStructure(
      organization,
      focusUserId,
      isOrgAdmin
    );

    return {
      organization: {
        id: organization.id,
        name: organization.name
      },
      chart: managerChart,
      focusUserId,
      isOrgAdmin
    };
  }
}
