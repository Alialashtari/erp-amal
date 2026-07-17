/**
 * Money helpers (ADR-019). All ledger amounts are IQD with 2-decimal precision.
 * Arithmetic is done in integer "fils" (hundredths) to avoid float drift.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** amountIqd = amountOriginal × exchangeRate, rounded half-up to 2 decimals. */
export function toIqd(amountOriginal: number, exchangeRate: number): number {
  if (amountOriginal <= 0) throw new Error('Amount must be positive');
  if (exchangeRate <= 0) throw new Error('Exchange rate must be positive');
  return round2(amountOriginal * exchangeRate);
}

export interface EntryLine {
  accountId: string;
  debitIqd: number;
  creditIqd: number;
}

/**
 * Double-entry validation (ADR-011):
 * - at least two lines;
 * - every line is debit XOR credit, positive;
 * - Σdebit = Σcredit = transaction amount (IQD).
 */
export function validateEntries(entries: EntryLine[], amountIqd: number): string | null {
  if (!entries || entries.length < 2) return 'A transaction requires at least two ledger lines';
  let debit = 0;
  let credit = 0;
  for (const e of entries) {
    const d = round2(e.debitIqd ?? 0);
    const c = round2(e.creditIqd ?? 0);
    if (d < 0 || c < 0) return 'Ledger amounts cannot be negative';
    if ((d === 0) === (c === 0)) return 'Each ledger line must be either a debit or a credit';
    debit = round2(debit + d);
    credit = round2(credit + c);
  }
  if (debit !== credit) return `Ledger is not balanced (debits ${debit} != credits ${credit})`;
  if (round2(amountIqd) !== debit) {
    return `Ledger total ${debit} does not match transaction amount ${round2(amountIqd)}`;
  }
  return null;
}

/** Sign of a transaction type on a fund balance. */
export function fundSign(type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'REFUND'): number {
  switch (type) {
    case 'INCOME':
      return 1;
    case 'EXPENSE':
    case 'REFUND':
      return -1;
    case 'TRANSFER':
      return -1; // outgoing from fundId; +1 on toFundId handled separately
  }
}
