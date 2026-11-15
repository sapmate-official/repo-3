import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../db/prisma.js';
import { AppError } from '../../util/errors.js';

export interface SpecialEvent {
  type: 'BIRTHDAY' | 'BILL' | 'LEAVE_REQUEST' | 'MONTH_END_VERIFICATION' | 'INCOMPLETE_ATTENDANCE';
  title: string;
  description: string;
  date: Date | string;
  priority: 'high' | 'medium' | 'low';
  entity: Record<string, unknown>;
}

export class EventController {
  static async getEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.orgId;
      if (!orgId) {
        throw new AppError('Organization context required', 401, 'ORG_CONTEXT_MISSING');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const events: SpecialEvent[] = [];

      // 1. Upcoming Colleague Birthdays (next 14 days)
      const usersWithBirthdays = await prisma.user.findMany({
        where: {
          orgId,
          dateOfBirth: { not: null },
          status: 'active'
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          dateOfBirth: true,
          department: { select: { name: true } }
        }
      });

      for (const employee of usersWithBirthdays) {
        if (!employee.dateOfBirth) continue;

        const birthDate = new Date(employee.dateOfBirth);
        const thisBirthday = new Date(
          today.getFullYear(),
          birthDate.getMonth(),
          birthDate.getDate()
        );

        if (thisBirthday < today) {
          thisBirthday.setFullYear(today.getFullYear() + 1);
        }

        const diffTime = thisBirthday.getTime() - today.getTime();
        const daysToEvent = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (daysToEvent >= 0 && daysToEvent <= 14) {
          const fullNameRaw = `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim();
          const fullName = fullNameRaw.length > 0 ? fullNameRaw : employee.email;
          const firstName = employee.firstName ?? fullName;

          events.push({
            type: 'BIRTHDAY',
            title: `${fullName}'s Birthday`,
            description: `${firstName}'s birthday is ${
              daysToEvent === 0 ? 'today' : `in ${daysToEvent} day${daysToEvent > 1 ? 's' : ''}`
            }!`,
            date: thisBirthday,
            priority: daysToEvent === 0 ? 'high' : 'medium',
            entity: {
              id: employee.id,
              name: fullName,
              department: employee.department?.name ?? 'Unassigned'
            }
          });
        }
      }

      // 2. Pending Leave Requests for Managers & Admins
      const pendingLeaves = await prisma.leaveRequest.findMany({
        where: {
          user: { orgId, managerId: req.user?.id },
          status: 'PENDING'
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          leaveType: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 5
      });

      for (const leave of pendingLeaves) {
        const applicantName =
          `${leave.user.firstName ?? ''} ${leave.user.lastName ?? ''}`.trim() || leave.user.email;
        events.push({
          type: 'LEAVE_REQUEST',
          title: `Pending Leave: ${applicantName}`,
          description: `${applicantName} requested ${leave.leaveType.name} from ${new Date(
            leave.startDate
          ).toLocaleDateString()}`,
          date: leave.startDate,
          priority: 'medium',
          entity: {
            id: leave.id,
            userId: leave.userId,
            name: applicantName
          }
        });
      }

      // 3. Pending Invoices/Bills for Organization
      const pendingBills = await prisma.billingRecord.findMany({
        where: {
          organizationId: orgId,
          status: 'UNPAID',
          dueDate: {
            lte: new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
          }
        },
        orderBy: { dueDate: 'asc' },
        take: 3
      });

      for (const bill of pendingBills) {
        const diff = Math.ceil((bill.dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        events.push({
          type: 'BILL',
          title: `Subscription Payment Due`,
          description: `Invoice #${bill.id} due ${
            diff <= 0 ? 'today' : `in ${diff} days`
          }`,
          date: bill.dueDate,
          priority: diff <= 2 ? 'high' : 'medium',
          entity: {
            id: bill.id,
            amount: bill.totalAmount
          }
        });
      }

      // Sort events by date ascending
      events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      res.status(200).json({
        success: true,
        data: events
      });
    } catch (error) {
      next(error);
    }
  }
}
