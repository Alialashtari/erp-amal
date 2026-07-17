/** Pure donation-domain rules (unit-tested). */

/** Payment method → asset account code (seeded chart of accounts). */
export function assetAccountCodeFor(paymentMethod: string): string {
  switch (paymentMethod) {
    case 'CASH':
      return '1000';
    case 'BANK_TRANSFER':
      return '1100';
    case 'CARD':
    case 'GATEWAY':
    case 'POS':
    case 'WALLET':
      return '1200';
    default:
      return '1000';
  }
}

export const DONATIONS_REVENUE_ACCOUNT_CODE = '4000';

/** Allowed campaign status transitions (FRS-003 lifecycle). */
const CAMPAIGN_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SCHEDULED', 'ACTIVE', 'CANCELLED'],
  SCHEDULED: ['ACTIVE', 'DRAFT', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionCampaign(from: string, to: string): boolean {
  return CAMPAIGN_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Next run date for a recurring donation (month-safe). */
export function nextRunDate(frequency: string, from: Date): Date {
  const next = new Date(from.getTime());
  switch (frequency) {
    case 'DAILY':
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'WEEKLY':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'MONTHLY':
      addMonthsSafe(next, 1);
      break;
    case 'QUARTERLY':
      addMonthsSafe(next, 3);
      break;
    case 'YEARLY':
      addMonthsSafe(next, 12);
      break;
    default:
      throw new Error(`Unknown frequency: ${frequency}`);
  }
  return next;
}

function addMonthsSafe(date: Date, months: number): void {
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
}

/** Guest donor display name (ADR-021). */
export function guestDonorName(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Anonymous Donor';
}
