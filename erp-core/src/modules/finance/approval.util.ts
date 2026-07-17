export interface ApprovalRuleLike {
  transactionType: string;
  minAmountIqd: number;
  requiredPermission: string;
  isActive: boolean;
}

/**
 * Resolves the permission required to approve a transaction (FRS-002 tiers).
 * The matching rule is the active rule of the same type with the highest
 * minAmountIqd that is <= amount. No matching rule => base finance.approve.
 */
export function requiredApprovalPermission(
  rules: ApprovalRuleLike[],
  transactionType: string,
  amountIqd: number,
): string {
  const applicable = rules
    .filter((r) => r.isActive && r.transactionType === transactionType && amountIqd >= r.minAmountIqd)
    .sort((a, b) => b.minAmountIqd - a.minAmountIqd);
  return applicable[0]?.requiredPermission ?? 'finance.approve';
}
