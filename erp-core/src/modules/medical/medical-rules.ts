/** Pure medical-case rules (FRS-006). Unit-tested. */

/** Allowed manual case status transitions; workflow drives NEW→APPROVED/REJECTED. */
const TRANSITIONS: Record<string, string[]> = {
  NEW: ['UNDER_REVIEW', 'CLOSED'],
  UNDER_REVIEW: ['AWAITING_DOCUMENTS', 'APPROVED', 'REJECTED', 'CLOSED'],
  AWAITING_DOCUMENTS: ['UNDER_REVIEW', 'CLOSED'],
  APPROVED: ['FUNDING', 'IN_TREATMENT', 'CLOSED'],
  FUNDING: ['IN_TREATMENT', 'CLOSED'],
  IN_TREATMENT: ['COMPLETED', 'CLOSED'],
  COMPLETED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  CLOSED: [],
};

export function canTransitionCase(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const MEDICAL_EXPENSE_ACCOUNT_CODE = '5100';
export const MEDICAL_FUND_CODE = 'MEDICAL';
