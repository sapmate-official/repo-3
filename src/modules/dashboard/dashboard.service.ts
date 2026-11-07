import { prisma } from '../../db/prisma.js';

export class DashboardService {
  static async getSummary(user: { id: string; orgId: string; isSuperAdmin?: boolean; roles?: string[]; permissions?: string[] }) {
    let orgId = user.orgId;
    if (!orgId && user.isSuperAdmin) {
      const firstOrg = await prisma.organization.findFirst({ select: { id: true } });
      orgId = firstOrg?.id || '';
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // 1. Determine User Role Profile
    const isAdmin = Boolean(
      user.isSuperAdmin ||
      user.roles?.some((r) => ['SUPER_ADMIN', 'Org_Admin', 'Admin', 'HR_Admin'].includes(r)) ||
      user.permissions?.includes('*') ||
      user.permissions?.includes('manage_organization')
    );

    // Check if manager (has subordinates or heads a department)
    let isManager = false;
    let directReportsCount = 0;
    if (orgId && user.id) {
      directReportsCount = await prisma.user.count({ where: { orgId, managerId: user.id } });
      const deptHeadCount = await prisma.department.count({ where: { orgId, headId: user.id } });
      isManager = directReportsCount > 0 || deptHeadCount > 0;
    }

    const roleType: 'ADMIN' | 'MANAGER' | 'EMPLOYEE' = isAdmin ? 'ADMIN' : isManager ? 'MANAGER' : 'EMPLOYEE';

    // 2. Fetch Base Employee Data (for the logged-in user)
    const [myUser, myLeaveBalances, myTodayAttendance, myRecentLeaves, upcomingHolidays] = await Promise.all([
      user.id
        ? prisma.user.findUnique({
            where: { id: user.id },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              employeeId: true,
              jobTitle: true,
              department: { select: { id: true, name: true } },
              organization: { select: { id: true, name: true, logo: true } }
            }
          })
        : null,
      user.id
        ? prisma.leaveBalance.findMany({
            where: { userId: user.id },
            include: { leaveType: { select: { id: true, name: true, annualLimit: true } } }
          })
        : [],
      user.id
        ? prisma.attendanceRecord.findFirst({
            where: { userId: user.id, date: { gte: startOfDay, lte: endOfDay } },
            orderBy: { checkInTime: 'desc' }
          })
        : null,
      user.id
        ? prisma.leaveRequest.findMany({
            where: { userId: user.id },
            take: 3,
            orderBy: { createdAt: 'desc' },
            include: { leaveType: { select: { name: true } } }
          })
        : [],
      orgId
        ? prisma.holiday.findMany({
            where: { orgId, date: { gte: startOfDay } },
            take: 4,
            orderBy: { date: 'asc' }
          })
        : []
    ]);

    // 3. Role-Specific Data Aggregations
    let adminStats: any = null;
    let managerStats: any = null;

    if (isAdmin && orgId) {
      const [
        totalEmployees,
        activeEmployees,
        presentToday,
        pendingLeaves,
        onboardingPending,
        onboardingApproved,
        departments,
        recentPendingCandidates,
        recentPendingLeaves
      ] = await Promise.all([
        prisma.user.count({ where: { orgId } }),
        prisma.user.count({ where: { orgId, status: 'active' } }),
        prisma.attendanceRecord.count({
          where: {
            date: { gte: startOfDay, lte: endOfDay },
            status: 'PRESENT',
            user: { orgId }
          }
        }),
        prisma.leaveRequest.count({
          where: {
            status: 'PENDING',
            user: { orgId }
          }
        }),
        prisma.onboardingCandidate.count({
          where: {
            orgId,
            status: { in: ['FORM_SUBMITTED', 'UNDER_REVIEW'] }
          }
        }),
        prisma.onboardingCandidate.count({
          where: { orgId, status: 'APPROVED' }
        }),
        prisma.department.findMany({
          where: { orgId },
          select: {
            id: true,
            name: true,
            code: true,
            _count: { select: { users: true } }
          }
        }),
        prisma.onboardingCandidate.findMany({
          where: { orgId, status: { in: ['FORM_SUBMITTED', 'UNDER_REVIEW'] } },
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            createdAt: true,
            department: { select: { name: true } }
          }
        }),
        prisma.leaveRequest.findMany({
          where: { user: { orgId }, status: 'PENDING' },
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            leaveType: { select: { name: true } }
          }
        })
      ]);

      adminStats = {
        totalEmployees,
        activeEmployees,
        presentToday,
        pendingLeaves,
        onboardingPending,
        onboardingApproved,
        attendanceRate: totalEmployees > 0 ? Math.round((presentToday / totalEmployees) * 100) : 0,
        departments,
        recentPendingCandidates,
        recentPendingLeaves
      };
    }

    if ((isManager || isAdmin) && orgId && user.id) {
      const [teamMembers, teamPendingLeaves, teamPresentToday] = await Promise.all([
        prisma.user.findMany({
          where: { orgId, managerId: user.id },
          take: 10,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
            status: true
          }
        }),
        prisma.leaveRequest.findMany({
          where: { user: { orgId, managerId: user.id }, status: 'PENDING' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
            leaveType: { select: { name: true } }
          }
        }),
        prisma.attendanceRecord.count({
          where: {
            date: { gte: startOfDay, lte: endOfDay },
            status: 'PRESENT',
            user: { managerId: user.id }
          }
        })
      ]);

      managerStats = {
        teamSize: directReportsCount,
        teamPresentToday,
        teamMembers,
        teamPendingLeaves
      };
    }

    // 4. Backward Compatibility format for legacy screen callers
    const legacyDashboardFormat = {
      totalEmployees: adminStats?.totalEmployees ?? directReportsCount ?? 1,
      presentToday: adminStats?.presentToday ?? managerStats?.teamPresentToday ?? (myTodayAttendance ? 1 : 0),
      pendingLeaves: adminStats?.pendingLeaves ?? managerStats?.teamPendingLeaves?.length ?? myRecentLeaves.filter((l) => l.status === 'PENDING').length,
      recentActivities: adminStats?.recentPendingLeaves ?? []
    };

    return {
      roleType,
      userProfile: myUser,
      adminStats,
      managerStats,
      employeeStats: {
        leaveBalances: myLeaveBalances.map((lb) => ({
          id: lb.id,
          name: lb.leaveType.name,
          used: lb.usedDays,
          remaining: lb.remainingDays,
          total: lb.leaveType.annualLimit
        })),
        todayAttendance: myTodayAttendance
          ? {
              status: myTodayAttendance.status,
              checkInTime: myTodayAttendance.checkInTime,
              checkOutTime: myTodayAttendance.checkOutTime
            }
          : null,
        recentLeaves: myRecentLeaves,
        upcomingHolidays
      },
      ...legacyDashboardFormat
    };
  }
}
