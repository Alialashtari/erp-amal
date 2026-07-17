import { growthPercent } from './analytics.service';

describe('analytics KPI rules (FRS-013)', () => {
  it('computes growth percentage against the previous period', () => {
    expect(growthPercent(150, 100)).toBe(50);
    expect(growthPercent(75, 100)).toBe(-25);
    expect(growthPercent(100, 100)).toBe(0);
  });

  it('returns null when there is no base period (no fake growth)', () => {
    expect(growthPercent(100, 0)).toBeNull();
  });

  it('rounds to two decimals', () => {
    expect(growthPercent(1, 3)).toBe(-66.67);
  });
});
