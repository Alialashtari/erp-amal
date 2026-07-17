import {
  assetAccountCodeFor,
  canTransitionCampaign,
  guestDonorName,
  nextRunDate,
} from './donation-rules';

describe('Donation domain rules (FRS-003, ADR-021)', () => {
  describe('payment method → asset account', () => {
    it('maps cash, bank and electronic methods', () => {
      expect(assetAccountCodeFor('CASH')).toBe('1000');
      expect(assetAccountCodeFor('BANK_TRANSFER')).toBe('1100');
      expect(assetAccountCodeFor('GATEWAY')).toBe('1200');
      expect(assetAccountCodeFor('CARD')).toBe('1200');
      expect(assetAccountCodeFor('POS')).toBe('1200');
    });
  });

  describe('campaign lifecycle transitions', () => {
    it('allows the documented lifecycle', () => {
      expect(canTransitionCampaign('DRAFT', 'ACTIVE')).toBe(true);
      expect(canTransitionCampaign('ACTIVE', 'PAUSED')).toBe(true);
      expect(canTransitionCampaign('PAUSED', 'ACTIVE')).toBe(true);
      expect(canTransitionCampaign('ACTIVE', 'COMPLETED')).toBe(true);
      expect(canTransitionCampaign('COMPLETED', 'ARCHIVED')).toBe(true);
    });

    it('blocks invalid jumps', () => {
      expect(canTransitionCampaign('DRAFT', 'COMPLETED')).toBe(false);
      expect(canTransitionCampaign('ARCHIVED', 'ACTIVE')).toBe(false);
      expect(canTransitionCampaign('COMPLETED', 'ACTIVE')).toBe(false);
      expect(canTransitionCampaign('CANCELLED', 'ACTIVE')).toBe(false);
    });
  });

  describe('recurring next-run dates', () => {
    it('advances by frequency', () => {
      const from = new Date(Date.UTC(2026, 0, 15));
      expect(nextRunDate('DAILY', from).toISOString().slice(0, 10)).toBe('2026-01-16');
      expect(nextRunDate('WEEKLY', from).toISOString().slice(0, 10)).toBe('2026-01-22');
      expect(nextRunDate('MONTHLY', from).toISOString().slice(0, 10)).toBe('2026-02-15');
      expect(nextRunDate('QUARTERLY', from).toISOString().slice(0, 10)).toBe('2026-04-15');
      expect(nextRunDate('YEARLY', from).toISOString().slice(0, 10)).toBe('2027-01-15');
    });

    it('is month-length safe (Jan 31 → Feb 28)', () => {
      const from = new Date(Date.UTC(2026, 0, 31));
      expect(nextRunDate('MONTHLY', from).toISOString().slice(0, 10)).toBe('2026-02-28');
    });

    it('rejects unknown frequencies', () => {
      expect(() => nextRunDate('HOURLY', new Date())).toThrow();
    });
  });

  describe('guest donor names (ADR-021)', () => {
    it('uses the provided name when present', () => {
      expect(guestDonorName('Ali Hassan')).toBe('Ali Hassan');
    });

    it('falls back to Anonymous Donor', () => {
      expect(guestDonorName(undefined)).toBe('Anonymous Donor');
      expect(guestDonorName('')).toBe('Anonymous Donor');
      expect(guestDonorName('   ')).toBe('Anonymous Donor');
    });
  });
});
