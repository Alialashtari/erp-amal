import { randomBytes } from 'crypto';

/** Pure project-domain rules (FRS-007). Unit-tested. */

const PROJECT_TRANSITIONS: Record<string, string[]> = {
  PLANNING: ['PENDING_APPROVAL', 'ACTIVE', 'CANCELLED'],
  PENDING_APPROVAL: ['ACTIVE', 'PLANNING', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionProject(from: string, to: string): boolean {
  return PROJECT_TRANSITIONS[from]?.includes(to) ?? false;
}

const TASK_TRANSITIONS: Record<string, string[]> = {
  TODO: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  IN_PROGRESS: ['TODO', 'DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
};

export function canTransitionTask(from: string, to: string): boolean {
  return TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Certificate verification codes: URL-safe, unguessable, human-typable length. */
export function generateVerificationCode(): string {
  return randomBytes(9).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 12);
}

/** Attendance rate over records: PRESENT + LATE count as attended. */
export function attendanceRate(records: { status: string }[]): number | null {
  if (records.length === 0) return null;
  const attended = records.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
  return Math.round((attended / records.length) * 10000) / 100;
}
