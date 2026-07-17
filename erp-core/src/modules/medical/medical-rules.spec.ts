import { canTransitionCase } from './medical-rules';

describe('Medical case lifecycle (FRS-006)', () => {
  it('follows the documented flow', () => {
    expect(canTransitionCase('NEW', 'UNDER_REVIEW')).toBe(true);
    expect(canTransitionCase('UNDER_REVIEW', 'AWAITING_DOCUMENTS')).toBe(true);
    expect(canTransitionCase('AWAITING_DOCUMENTS', 'UNDER_REVIEW')).toBe(true);
    expect(canTransitionCase('APPROVED', 'FUNDING')).toBe(true);
    expect(canTransitionCase('FUNDING', 'IN_TREATMENT')).toBe(true);
    expect(canTransitionCase('IN_TREATMENT', 'COMPLETED')).toBe(true);
    expect(canTransitionCase('COMPLETED', 'CLOSED')).toBe(true);
  });

  it('blocks invalid jumps and reopening', () => {
    expect(canTransitionCase('NEW', 'APPROVED')).toBe(false);
    expect(canTransitionCase('NEW', 'IN_TREATMENT')).toBe(false);
    expect(canTransitionCase('CLOSED', 'NEW')).toBe(false);
    expect(canTransitionCase('REJECTED', 'APPROVED')).toBe(false);
  });

  it('any active state can be closed', () => {
    for (const from of ['NEW', 'UNDER_REVIEW', 'APPROVED', 'FUNDING', 'IN_TREATMENT']) {
      expect(canTransitionCase(from, 'CLOSED')).toBe(true);
    }
  });
});
