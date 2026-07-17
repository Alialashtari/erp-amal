import { resolveAction } from './workflow-rules';

const steps = [
  { sequence: 1, name: 'Review', requiredPermission: 'medical.review' },
  { sequence: 2, name: 'Committee', requiredPermission: 'medical.committee' },
  { sequence: 3, name: 'Final', requiredPermission: 'medical.approve' },
];

describe('Workflow engine advancement (ADR-015, FRS-014) — workflow tests', () => {
  it('advances to the next step on approve', () => {
    const r = resolveAction(steps, 1, 'APPROVE', ['medical.review']);
    expect(r).toEqual({ outcome: 'ADVANCED', nextStepSequence: 2 });
  });

  it('completes at the last step', () => {
    const r = resolveAction(steps, 3, 'APPROVE', ['medical.approve']);
    expect(r.outcome).toBe('COMPLETED');
  });

  it('rejects terminally from any step', () => {
    expect(resolveAction(steps, 2, 'REJECT', ['medical.committee']).outcome).toBe('REJECTED');
  });

  it('returns to the previous step', () => {
    const r = resolveAction(steps, 3, 'RETURN', ['medical.approve']);
    expect(r).toEqual({ outcome: 'RETURNED', nextStepSequence: 2 });
  });

  it('return at step 1 stays at step 1', () => {
    const r = resolveAction(steps, 1, 'RETURN', ['medical.review']);
    expect(r.nextStepSequence).toBe(1);
  });

  it('blocks actors without the step permission (no bypassing, Art. 7.1)', () => {
    const r = resolveAction(steps, 2, 'APPROVE', ['medical.review']);
    expect(r.outcome).toBe('ERROR');
    expect(r.error).toContain('medical.committee');
  });

  it('errors on unknown step', () => {
    expect(resolveAction(steps, 9, 'APPROVE', ['medical.review']).outcome).toBe('ERROR');
  });
});
