import { canTransitionRequest, generateBoxCode } from './box-rules';

describe('box request lifecycle (ADR-027)', () => {
  it('follows the operational path new → review → approved → assigned → delivery → delivered', () => {
    expect(canTransitionRequest('NEW', 'UNDER_REVIEW')).toBe(true);
    expect(canTransitionRequest('UNDER_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransitionRequest('APPROVED', 'ASSIGNED')).toBe(true);
    expect(canTransitionRequest('ASSIGNED', 'OUT_FOR_DELIVERY')).toBe(true);
    expect(canTransitionRequest('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
  });

  it('forbids skipping stages or reopening terminal states', () => {
    expect(canTransitionRequest('NEW', 'DELIVERED')).toBe(false);
    expect(canTransitionRequest('NEW', 'APPROVED')).toBe(false);
    expect(canTransitionRequest('DELIVERED', 'NEW')).toBe(false);
    expect(canTransitionRequest('REJECTED', 'UNDER_REVIEW')).toBe(false);
  });

  it('allows rejection only from review, cancellation before delivery', () => {
    expect(canTransitionRequest('UNDER_REVIEW', 'REJECTED')).toBe(true);
    expect(canTransitionRequest('APPROVED', 'CANCELLED')).toBe(true);
    expect(canTransitionRequest('OUT_FOR_DELIVERY', 'CANCELLED')).toBe(false);
  });

  it('generates unique-format box codes', () => {
    const code = generateBoxCode(17);
    expect(code).toMatch(/^AMAL-BOX-17-[A-Z2-9]{6}$/);
  });
});
