/** Pure volunteer-domain rules (FRS-008). Unit-tested. */

const TRANSITIONS: Record<string, string[]> = {
  APPLICANT: ['REVIEW', 'ARCHIVED'],
  REVIEW: ['ACTIVE', 'ARCHIVED'], // ACTIVE via workflow approval
  ACTIVE: ['SUSPENDED', 'INACTIVE', 'ARCHIVED'],
  SUSPENDED: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
  INACTIVE: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionVolunteer(from: string, to: string): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Total approved hours from a set of records. */
export function totalApprovedHours(records: { status: string; hours: number }[]): number {
  const total = records
    .filter((r) => r.status === 'APPROVED')
    .reduce((sum, r) => sum + r.hours, 0);
  return Math.round(total * 100) / 100;
}

/** Evaluation score keys (FRS-008 معايير التقييم). */
export const EVALUATION_CRITERIA = [
  'commitment',
  'attendance',
  'quality',
  'cooperation',
  'initiative',
] as const;

/** Validates an evaluation scores object: known keys, 1..5 integers. */
export function validateScores(scores: Record<string, unknown>): string | null {
  const keys = Object.keys(scores);
  if (keys.length === 0) return 'At least one criterion score is required';
  for (const key of keys) {
    if (!(EVALUATION_CRITERIA as readonly string[]).includes(key)) {
      return `Unknown criterion: ${key}`;
    }
    const value = scores[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
      return `Score for ${key} must be an integer between 1 and 5`;
    }
  }
  return null;
}
