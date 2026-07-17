/** Pure subscription-domain rules (FRS-004). Unit-tested. */

const CYCLE_MONTHS: Record<string, number | null> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  YEARLY: 12,
  LIFETIME: null, // single installment, no renewal
};

/** Next due date for a billing cycle; null for LIFETIME (no next installment). */
export function nextDueDate(cycle: string, from: Date): Date | null {
  const months = CYCLE_MONTHS[cycle];
  if (months === undefined) throw new Error(`Unknown billing cycle: ${cycle}`);
  if (months === null) return null;
  const next = new Date(from.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export const REMINDER_TAGS = ['D-7', 'D-3', 'D0', 'O+7', 'O+30'] as const;
export type ReminderTag = (typeof REMINDER_TAGS)[number];

/**
 * Reminder schedule (FRS-004 §قواعد التذكير): 7 and 3 days before due,
 * on the due date, 7 and 30 days after. Returns the single most relevant
 * unsent tag for `now`, or null.
 */
export function dueReminderTag(dueDate: Date, now: Date, sent: string[]): ReminderTag | null {
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / dayMs); // negative = before due
  const candidates: [ReminderTag, boolean][] = [
    ['O+30', diffDays >= 30],
    ['O+7', diffDays >= 7],
    ['D0', diffDays >= 0],
    ['D-3', diffDays >= -3],
    ['D-7', diffDays >= -7],
  ];
  for (const [tag, applicable] of candidates) {
    if (applicable && !sent.includes(tag)) return tag;
  }
  return null;
}

/** An installment is overdue once now > dueDate + gracePeriodDays. */
export function isOverdue(dueDate: Date, gracePeriodDays: number, now: Date): boolean {
  return now.getTime() > dueDate.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000;
}

/** A subscription lapses when an installment is overdue by more than lapseDays. */
export function shouldLapse(dueDate: Date, lapseDays: number, now: Date): boolean {
  return now.getTime() > dueDate.getTime() + lapseDays * 24 * 60 * 60 * 1000;
}

export const SUBSCRIPTIONS_REVENUE_ACCOUNT_CODE = '4100';

/** Allowed manual subscription status transitions. */
const TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ['PAUSED', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'CANCELLED'],
  LAPSED: ['ACTIVE', 'CANCELLED'], // reactivated by payment or staff
  EXPIRED: [],
  CANCELLED: [],
};

export function canTransitionSubscription(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
