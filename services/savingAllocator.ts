import type { Account, BucketAllocation, IncomeAllocationRule, SavingBucket } from '../types';

type RuleDraft = {
  bucketId: string;
  amount: number;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const getReservedByAccount = (accounts: Account[], allocations: BucketAllocation[]) => {
  const reserved: Record<string, number> = {};
  accounts.forEach((acc) => {
    reserved[acc.id] = 0;
  });
  allocations.forEach((allocation) => {
    reserved[allocation.accountId] = roundMoney((reserved[allocation.accountId] || 0) + allocation.amount);
  });
  return reserved;
};

export const getAvailableByAccount = (accounts: Account[], allocations: BucketAllocation[]) => {
  const reserved = getReservedByAccount(accounts, allocations);
  const available: Record<string, number> = {};
  accounts.forEach((acc) => {
    available[acc.id] = roundMoney(acc.balance - (reserved[acc.id] || 0));
  });
  return available;
};

export const getBucketTotals = (buckets: SavingBucket[], allocations: BucketAllocation[]) => {
  const totals: Record<string, number> = {};
  buckets.forEach((bucket) => {
    totals[bucket.id] = 0;
  });
  allocations.forEach((allocation) => {
    totals[allocation.bucketId] = roundMoney((totals[allocation.bucketId] || 0) + allocation.amount);
  });
  return totals;
};

export const buildAutoAllocations = (
  txId: string,
  accountId: string,
  amount: number,
  rules: IncomeAllocationRule[],
  buckets: SavingBucket[]
): BucketAllocation[] => {
  if (amount <= 0) return [];
  const activeRules = rules.filter((r) => r.isActive && r.value > 0 && buckets.some((b) => b.id === r.bucketId));
  if (!activeRules.length) return [];

  let remaining = amount;
  const draft: RuleDraft[] = [];

  activeRules
    .filter((r) => r.type === 'fixed')
    .forEach((rule) => {
      if (remaining <= 0) return;
      const allocate = Math.min(remaining, rule.value);
      if (allocate > 0) {
        draft.push({ bucketId: rule.bucketId, amount: roundMoney(allocate) });
        remaining = roundMoney(remaining - allocate);
      }
    });

  const percentRules = activeRules.filter((r) => r.type === 'percent');
  if (remaining > 0 && percentRules.length > 0) {
    const totalPercent = percentRules.reduce((sum, r) => sum + r.value, 0);
    let distributed = 0;
    percentRules.forEach((rule, index) => {
      const ratio = totalPercent > 0 ? rule.value / totalPercent : 0;
      const raw = index === percentRules.length - 1 ? remaining - distributed : remaining * ratio;
      const allocate = roundMoney(Math.max(0, raw));
      if (allocate > 0) {
        draft.push({ bucketId: rule.bucketId, amount: allocate });
        distributed = roundMoney(distributed + allocate);
      }
    });
  }

  return draft
    .filter((item) => item.amount > 0)
    .map((item, index) => ({
      id: `ba_${txId}_${index}`,
      bucketId: item.bucketId,
      accountId,
      amount: item.amount,
      source: 'auto',
      linkedTransactionId: txId,
      createdAt: new Date().toISOString(),
    }));
};

