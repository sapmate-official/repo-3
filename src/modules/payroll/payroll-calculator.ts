import type { CalculatedEmployeePayroll, CalculatedLineItem, EmployeeSalaryInput } from './payroll.types.js';

// Convert to integer paise to ensure exact arithmetic
export const toPaise = (amt: number): number => Math.round((amt + Number.EPSILON) * 100);
export const fromPaise = (paise: number): number => paise / 100;

export function getWorkingDaysInMonth(year: number, month: number, weekoffDays = [0, 6]): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    if (!weekoffDays.includes(d.getDay())) {
      workingDays++;
    }
  }

  return Math.max(1, workingDays);
}

export function calculateEmployeePayroll(
  emp: EmployeeSalaryInput,
  workingDays: number
): CalculatedEmployeePayroll {
  const basicPaise = toPaise(emp.monthlySalary || 0);

  const params = emp.salaryParameter ?? {
    hraPercentage: 40,
    daPercentage: 10,
    taPercentage: 10,
    pfPercentage: 12,
    taxPercentage: 10,
    insuranceFixed: 1000,
    additionalAllowances: {},
    additionalDeductions: {}
  };

  // 1. Calculate Allowances
  const hraPaise = Math.round((basicPaise * (params.hraPercentage ?? 40)) / 100);
  const daPaise = Math.round((basicPaise * (params.daPercentage ?? 10)) / 100);
  const taPaise = Math.round((basicPaise * (params.taPercentage ?? 10)) / 100);

  let extraAllowancesPaise = 0;
  if (params.additionalAllowances && typeof params.additionalAllowances === 'object') {
    for (const val of Object.values(params.additionalAllowances)) {
      if (typeof val === 'number') {
        extraAllowancesPaise += toPaise(val);
      }
    }
  }

  const grossEarningsPaise = basicPaise + hraPaise + daPaise + taPaise + extraAllowancesPaise;

  // 2. Attendance & LOP (Loss of Pay)
  const presentDays = emp.attendanceCount;
  const approvedLeaveDays = emp.approvedLeaveDays;
  const effectiveDays = presentDays + approvedLeaveDays;
  const lopDays = Math.max(0, workingDays - effectiveDays);

  const lopDeductionPaise = workingDays > 0 ? Math.round((basicPaise / workingDays) * lopDays) : 0;

  // 3. Deductions
  const pfPaise = Math.round((basicPaise * (params.pfPercentage ?? 12)) / 100);
  const insurancePaise = toPaise(params.insuranceFixed ?? 0);
  const taxPaise = Math.round((basicPaise * (params.taxPercentage ?? 10)) / 100);

  let extraDeductionsPaise = 0;
  if (params.additionalDeductions && typeof params.additionalDeductions === 'object') {
    for (const val of Object.values(params.additionalDeductions)) {
      if (typeof val === 'number') {
        extraDeductionsPaise += toPaise(val);
      }
    }
  }

  const totalDeductionsPaise = pfPaise + insurancePaise + taxPaise + lopDeductionPaise + extraDeductionsPaise;

  // 4. Net Pay (Floor at 0)
  const netPayPaise = Math.max(0, grossEarningsPaise - totalDeductionsPaise);

  // 5. Line items
  const lineItems: CalculatedLineItem[] = [
    { componentCode: 'BASIC', category: 'EARNING', systemAmount: fromPaise(basicPaise), finalAmount: fromPaise(basicPaise) },
    { componentCode: 'HRA', category: 'EARNING', systemAmount: fromPaise(hraPaise), finalAmount: fromPaise(hraPaise) },
    { componentCode: 'DA', category: 'EARNING', systemAmount: fromPaise(daPaise), finalAmount: fromPaise(daPaise) },
    { componentCode: 'TA', category: 'EARNING', systemAmount: fromPaise(taPaise), finalAmount: fromPaise(taPaise) }
  ];

  if (extraAllowancesPaise > 0) {
    lineItems.push({
      componentCode: 'ADDITIONAL_ALLOWANCE',
      category: 'EARNING',
      systemAmount: fromPaise(extraAllowancesPaise),
      finalAmount: fromPaise(extraAllowancesPaise)
    });
  }

  lineItems.push(
    { componentCode: 'EPF_EE', category: 'DEDUCTION', systemAmount: fromPaise(pfPaise), finalAmount: fromPaise(pfPaise) },
    { componentCode: 'INSURANCE', category: 'DEDUCTION', systemAmount: fromPaise(insurancePaise), finalAmount: fromPaise(insurancePaise) },
    { componentCode: 'TDS', category: 'DEDUCTION', systemAmount: fromPaise(taxPaise), finalAmount: fromPaise(taxPaise) }
  );

  if (lopDeductionPaise > 0) {
    lineItems.push({
      componentCode: 'LOP_DEDUCTION',
      category: 'DEDUCTION',
      systemAmount: fromPaise(lopDeductionPaise),
      finalAmount: fromPaise(lopDeductionPaise)
    });
  }

  if (extraDeductionsPaise > 0) {
    lineItems.push({
      componentCode: 'ADDITIONAL_DEDUCTION',
      category: 'DEDUCTION',
      systemAmount: fromPaise(extraDeductionsPaise),
      finalAmount: fromPaise(extraDeductionsPaise)
    });
  }

  // 6. Anomaly Detection
  let hasAnomaly = false;
  const anomalyReasons: string[] = [];

  if (netPayPaise <= 0) {
    hasAnomaly = true;
    anomalyReasons.push('Net pay is zero or negative');
  }

  if (!emp.bankDetails?.accountNumber || !emp.bankDetails?.ifscCode) {
    hasAnomaly = true;
    anomalyReasons.push('Missing bank account or IFSC details');
  }

  if (lopDays > workingDays / 2) {
    hasAnomaly = true;
    anomalyReasons.push(`High Loss of Pay days (${lopDays} days)`);
  }

  return {
    userId: emp.userId,
    workingDays,
    presentDays,
    lopDays,
    grossEarnings: fromPaise(grossEarningsPaise),
    totalDeductions: fromPaise(totalDeductionsPaise),
    netPay: fromPaise(netPayPaise),
    hasAnomaly,
    anomalyReason: anomalyReasons.length > 0 ? anomalyReasons.join('; ') : undefined,
    lineItems,
    compensationSnapshot: {
      monthlySalary: emp.monthlySalary,
      salaryParameters: params
    },
    attendanceSnapshot: {
      workingDays,
      presentDays,
      approvedLeaveDays,
      lopDays
    }
  };
}
