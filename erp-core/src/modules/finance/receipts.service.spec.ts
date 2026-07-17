import { buildQrPayload } from './receipts.service';

describe('Receipt QR payload (ADR-020)', () => {
  it('encodes receipt number, transaction number, amount and date', () => {
    const payload = buildQrPayload({
      receiptNumber: 42,
      transactionNumber: 1001,
      amountIqd: 250000,
      date: '2026-07-16',
    });
    expect(JSON.parse(payload)).toEqual({ v: 1, rn: 42, tn: 1001, iqd: 250000, d: '2026-07-16' });
  });

  it('is stable and machine-parsable', () => {
    const payload = buildQrPayload({ receiptNumber: 1, transactionNumber: 2, amountIqd: 3.5, date: '2026-01-01' });
    expect(() => JSON.parse(payload)).not.toThrow();
  });
});
