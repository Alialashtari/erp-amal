import { BoxRequestStatus } from '@prisma/client';

/**
 * Box request lifecycle (ADR-027 §5): a full state machine — no single-step
 * "done". DELIVERED is reached only through the guarded deliver() transaction.
 */
export const REQUEST_TRANSITIONS: Record<BoxRequestStatus, BoxRequestStatus[]> = {
  NEW: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['OUT_FOR_DELIVERY', 'APPROVED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'ASSIGNED'],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransitionRequest(from: BoxRequestStatus, to: BoxRequestStatus): boolean {
  return (REQUEST_TRANSITIONS[from] ?? []).includes(to);
}

/** Unguessable printed/QR box code. */
export function generateBoxCode(boxNumber: number): string {
  const random = Array.from({ length: 6 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(Math.floor(Math.random() * 32)),
  ).join('');
  return `AMAL-BOX-${boxNumber}-${random}`;
}
