import { requiredApprovalPermission } from './approval.util';

const rules = [
  { transactionType: 'EXPENSE', minAmountIqd: 0, requiredPermission: 'finance.approve', isActive: true },
  { transactionType: 'EXPENSE', minAmountIqd: 10000000, requiredPermission: 'finance.approve_executive', isActive: true },
  { transactionType: 'TRANSFER', minAmountIqd: 0, requiredPermission: 'finance.approve', isActive: true },
  { transactionType: 'EXPENSE', minAmountIqd: 999, requiredPermission: 'finance.approve_disabled', isActive: false },
];

describe('Approval tier resolution (FRS-002/FRS-014)', () => {
  it('small expenses need standard approval', () => {
    expect(requiredApprovalPermission(rules, 'EXPENSE', 50000)).toBe('finance.approve');
  });

  it('large expenses need executive approval', () => {
    expect(requiredApprovalPermission(rules, 'EXPENSE', 10000000)).toBe('finance.approve_executive');
    expect(requiredApprovalPermission(rules, 'EXPENSE', 25000000)).toBe('finance.approve_executive');
  });

  it('boundary just below the executive tier stays standard', () => {
    expect(requiredApprovalPermission(rules, 'EXPENSE', 9999999.99)).toBe('finance.approve');
  });

  it('inactive rules are ignored', () => {
    expect(requiredApprovalPermission(rules, 'EXPENSE', 1000)).toBe('finance.approve');
  });

  it('falls back to finance.approve when no rule matches', () => {
    expect(requiredApprovalPermission(rules, 'REFUND', 1000)).toBe('finance.approve');
  });
});
