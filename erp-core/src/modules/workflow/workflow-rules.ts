/** Pure workflow-advancement logic (ADR-015). Unit-tested. */

export interface StepDefLike {
  sequence: number;
  name: string;
  requiredPermission: string;
}

export interface AdvanceResult {
  outcome: 'ADVANCED' | 'COMPLETED' | 'REJECTED' | 'RETURNED' | 'ERROR';
  nextStepSequence?: number;
  error?: string;
}

/**
 * Resolves the effect of an action on an instance at `currentStep`.
 * APPROVE → next step, or COMPLETED at the last step.
 * REJECT  → terminal rejection.
 * RETURN  → back one step (or stays at 1).
 */
export function resolveAction(
  steps: StepDefLike[],
  currentStepSequence: number,
  action: 'APPROVE' | 'REJECT' | 'RETURN',
  actorPermissions: string[],
): AdvanceResult {
  const ordered = [...steps].sort((a, b) => a.sequence - b.sequence);
  const current = ordered.find((s) => s.sequence === currentStepSequence);
  if (!current) return { outcome: 'ERROR', error: `No step ${currentStepSequence} in definition` };
  if (!actorPermissions.includes(current.requiredPermission)) {
    return {
      outcome: 'ERROR',
      error: `Acting on step "${current.name}" requires permission: ${current.requiredPermission}`,
    };
  }
  if (action === 'REJECT') return { outcome: 'REJECTED' };
  if (action === 'RETURN') {
    const prev = ordered.filter((s) => s.sequence < currentStepSequence).pop();
    return { outcome: 'RETURNED', nextStepSequence: prev?.sequence ?? currentStepSequence };
  }
  const next = ordered.find((s) => s.sequence > currentStepSequence);
  if (!next) return { outcome: 'COMPLETED' };
  return { outcome: 'ADVANCED', nextStepSequence: next.sequence };
}
