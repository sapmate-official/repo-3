import type { PayrollRunStatus } from '@prisma/client';
import { AppError } from '../../util/errors.js';

const VALID_TRANSITIONS: Record<PayrollRunStatus, PayrollRunStatus[]> = {
  DRAFT: ['COMPUTING'],
  COMPUTING: ['PENDING_REVIEW', 'FAILED'],
  FAILED: ['DRAFT', 'COMPUTING'],
  PENDING_REVIEW: ['PENDING_APPROVAL', 'DRAFT', 'COMPUTING'],
  PENDING_APPROVAL: ['APPROVED', 'PENDING_REVIEW'],
  APPROVED: ['DISBURSED'],
  DISBURSED: [] // Terminal / Immutable
};

export class PayrollStateMachine {
  static assertTransition(current: PayrollRunStatus, target: PayrollRunStatus): void {
    if (current === 'DISBURSED') {
      throw new AppError(
        'Payroll run is disbursed and immutable. Historical records cannot be modified.',
        400,
        'RUN_IMMUTABLE'
      );
    }

    const allowed = VALID_TRANSITIONS[current] ?? [];
    if (!allowed.includes(target)) {
      throw new AppError(
        `Invalid payroll state transition from ${current} to ${target}`,
        400,
        'INVALID_STATE_TRANSITION'
      );
    }
  }

  static assertMakerChecker(makerId: string, checkerId: string): void {
    if (makerId === checkerId) {
      throw new AppError(
        'Segregation of Duties violation: The maker who initiated the payroll run cannot approve it. An independent checker is required.',
        403,
        'MAKER_CHECKER_VIOLATION'
      );
    }
  }

  static assertNotImmutable(status: PayrollRunStatus): void {
    if (status === 'DISBURSED') {
      throw new AppError(
        'Payroll run is disbursed and immutable. Modifications are forbidden.',
        400,
        'RUN_IMMUTABLE'
      );
    }
  }
}
