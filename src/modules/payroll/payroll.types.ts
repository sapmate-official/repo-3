import type { LineItemCategory, PayrollRunStatus, Prisma } from '@prisma/client';

export interface EmployeeSalaryInput {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  monthlySalary: number;
  bankDetails?: {
    accountNumber: string;
    ifscCode: string;
    bankName: string;
  } | null;
  salaryParameter?: {
    hraPercentage: number;
    daPercentage: number;
    taPercentage: number;
    pfPercentage: number;
    taxPercentage: number;
    insuranceFixed: number;
    additionalAllowances: Prisma.JsonValue;
    additionalDeductions: Prisma.JsonValue;
  } | null;
  attendanceCount: number;
  approvedLeaveDays: number;
}

export interface CalculatedLineItem {
  componentCode: string;
  category: LineItemCategory;
  systemAmount: number;
  finalAmount: number;
}

export interface CalculatedEmployeePayroll {
  userId: string;
  workingDays: number;
  presentDays: number;
  lopDays: number;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  hasAnomaly: boolean;
  anomalyReason?: string;
  lineItems: CalculatedLineItem[];
  compensationSnapshot: Record<string, unknown>;
  attendanceSnapshot: Record<string, unknown>;
}

export interface PayRunSummary {
  runId: string;
  companyId: string;
  year: number;
  month: number;
  status: PayrollRunStatus;
  makerId: string;
  checkerId: string | null;
  totalGross: number;
  totalDeductions: number;
  totalNetPay: number;
  totalEmployees: number;
  anomalyCount: number;
  lockedAt: Date | null;
  approvedAt: Date | null;
  disbursedAt: Date | null;
}
