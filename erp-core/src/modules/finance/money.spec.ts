import { fundSign, round2, toIqd, validateEntries } from './money';

describe('Financial money rules (ADR-011, ADR-019) — critical financial tests', () => {
  describe('currency conversion (ADR-019)', () => {
    it('IQD passes through at rate 1', () => {
      expect(toIqd(50000, 1)).toBe(50000);
    });

    it('converts foreign currency with per-transaction rate', () => {
      expect(toIqd(100, 1310.25)).toBe(131025);
    });

    it('rounds to 2 decimals half-up', () => {
      expect(toIqd(1, 1310.255)).toBe(1310.26);
      expect(round2(0.005)).toBe(0.01);
    });

    it('rejects non-positive amounts and rates', () => {
      expect(() => toIqd(0, 1)).toThrow();
      expect(() => toIqd(-5, 1)).toThrow();
      expect(() => toIqd(5, 0)).toThrow();
    });
  });

  describe('double-entry validation (ADR-011)', () => {
    const A = 'acc-a';
    const B = 'acc-b';

    it('accepts a balanced pair matching the amount', () => {
      expect(
        validateEntries(
          [
            { accountId: A, debitIqd: 50000, creditIqd: 0 },
            { accountId: B, debitIqd: 0, creditIqd: 50000 },
          ],
          50000,
        ),
      ).toBeNull();
    });

    it('accepts balanced multi-line splits', () => {
      expect(
        validateEntries(
          [
            { accountId: A, debitIqd: 30000, creditIqd: 0 },
            { accountId: A, debitIqd: 20000, creditIqd: 0 },
            { accountId: B, debitIqd: 0, creditIqd: 50000 },
          ],
          50000,
        ),
      ).toBeNull();
    });

    it('rejects unbalanced entries', () => {
      expect(
        validateEntries(
          [
            { accountId: A, debitIqd: 50000, creditIqd: 0 },
            { accountId: B, debitIqd: 0, creditIqd: 40000 },
          ],
          50000,
        ),
      ).toMatch(/not balanced/);
    });

    it('rejects entries that do not match the transaction amount', () => {
      expect(
        validateEntries(
          [
            { accountId: A, debitIqd: 40000, creditIqd: 0 },
            { accountId: B, debitIqd: 0, creditIqd: 40000 },
          ],
          50000,
        ),
      ).toMatch(/does not match/);
    });

    it('rejects lines that are both debit and credit or neither', () => {
      expect(
        validateEntries(
          [
            { accountId: A, debitIqd: 10, creditIqd: 10 },
            { accountId: B, debitIqd: 0, creditIqd: 0 },
          ],
          10,
        ),
      ).toMatch(/either a debit or a credit/);
    });

    it('rejects fewer than two lines', () => {
      expect(validateEntries([{ accountId: A, debitIqd: 10, creditIqd: 0 }], 10)).toMatch(
        /at least two/,
      );
    });

    it('rejects negative amounts', () => {
      expect(
        validateEntries(
          [
            { accountId: A, debitIqd: -10, creditIqd: 0 },
            { accountId: B, debitIqd: 0, creditIqd: -10 },
          ],
          10,
        ),
      ).toMatch(/negative/);
    });
  });

  describe('fund balance signs (Art. 5.3)', () => {
    it('income increases, expense/refund decrease, transfer decreases source', () => {
      expect(fundSign('INCOME')).toBe(1);
      expect(fundSign('EXPENSE')).toBe(-1);
      expect(fundSign('REFUND')).toBe(-1);
      expect(fundSign('TRANSFER')).toBe(-1);
    });
  });
});
