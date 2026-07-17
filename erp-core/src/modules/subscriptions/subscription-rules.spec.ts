import {
  canTransitionSubscription,
  dueReminderTag,
  isOverdue,
  nextDueDate,
  shouldLapse,
} from './subscription-rules';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('Subscription billing rules (FRS-004)', () => {
  describe('billing cycles', () => {
    it('advances by cycle length', () => {
      const from = d('2026-01-15');
      expect(nextDueDate('MONTHLY', from)?.toISOString().slice(0, 10)).toBe('2026-02-15');
      expect(nextDueDate('BIMONTHLY', from)?.toISOString().slice(0, 10)).toBe('2026-03-15');
      expect(nextDueDate('QUARTERLY', from)?.toISOString().slice(0, 10)).toBe('2026-04-15');
      expect(nextDueDate('SEMIANNUAL', from)?.toISOString().slice(0, 10)).toBe('2026-07-15');
      expect(nextDueDate('YEARLY', from)?.toISOString().slice(0, 10)).toBe('2027-01-15');
    });

    it('LIFETIME has no next installment', () => {
      expect(nextDueDate('LIFETIME', d('2026-01-15'))).toBeNull();
    });

    it('is month-length safe', () => {
      expect(nextDueDate('MONTHLY', d('2026-01-31'))?.toISOString().slice(0, 10)).toBe('2026-02-28');
    });

    it('rejects unknown cycles', () => {
      expect(() => nextDueDate('WEEKLY', new Date())).toThrow();
    });
  });

  describe('reminder schedule (7/3/0 before, 7/30 after)', () => {
    const due = d('2026-06-10');

    it('sends D-7 a week before', () => {
      expect(dueReminderTag(due, d('2026-06-03'), [])).toBe('D-7');
    });

    it('sends D-3 three days before when D-7 already sent', () => {
      expect(dueReminderTag(due, d('2026-06-07'), ['D-7'])).toBe('D-3');
    });

    it('sends D0 on the due date', () => {
      expect(dueReminderTag(due, d('2026-06-10'), ['D-7', 'D-3'])).toBe('D0');
    });

    it('sends O+7 and O+30 after overdue', () => {
      expect(dueReminderTag(due, d('2026-06-17'), ['D-7', 'D-3', 'D0'])).toBe('O+7');
      expect(dueReminderTag(due, d('2026-07-10'), ['D-7', 'D-3', 'D0', 'O+7'])).toBe('O+30');
    });

    it('sends nothing too early or when all sent', () => {
      expect(dueReminderTag(due, d('2026-05-20'), [])).toBeNull();
      expect(dueReminderTag(due, d('2026-08-01'), ['D-7', 'D-3', 'D0', 'O+7', 'O+30'])).toBeNull();
    });
  });

  describe('overdue and lapse', () => {
    const due = d('2026-06-01');

    it('respects grace period', () => {
      expect(isOverdue(due, 14, d('2026-06-10'))).toBe(false);
      expect(isOverdue(due, 14, d('2026-06-16'))).toBe(true);
    });

    it('lapses after the lapse window', () => {
      expect(shouldLapse(due, 60, d('2026-07-15'))).toBe(false);
      expect(shouldLapse(due, 60, d('2026-08-05'))).toBe(true);
    });
  });

  describe('manual status transitions', () => {
    it('allows pause/resume/cancel and lapse recovery', () => {
      expect(canTransitionSubscription('ACTIVE', 'PAUSED')).toBe(true);
      expect(canTransitionSubscription('PAUSED', 'ACTIVE')).toBe(true);
      expect(canTransitionSubscription('LAPSED', 'ACTIVE')).toBe(true);
      expect(canTransitionSubscription('ACTIVE', 'CANCELLED')).toBe(true);
    });

    it('blocks resurrection of terminal states', () => {
      expect(canTransitionSubscription('CANCELLED', 'ACTIVE')).toBe(false);
      expect(canTransitionSubscription('EXPIRED', 'ACTIVE')).toBe(false);
    });
  });
});
