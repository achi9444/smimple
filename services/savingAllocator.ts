import type { Account, BucketAllocation, BucketSpend, IncomeAllocationRule, SavingBucket } from '../types';

type RuleDraft = {
  bucketId: string;
  sourceAccountId: string;
  amount: number;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const getReservedByAccount = (accounts: Account[], allocations: BucketAllocation[], spends: BucketSpend[] = []) => {
  const reserved: Record<string, number> = {};
  accounts.forEach((acc) => {
    reserved[acc.id] = 0;
  });
  allocations.forEach((allocation) => {
    reserved[allocation.accountId] = roundMoney((reserved[allocation.accountId] || 0) + allocation.amount);
  });
  spends.forEach((spend) => {
    reserved[spend.accountId] = roundMoney((reserved[spend.accountId] || 0) - spend.amount);
  });
  return reserved;
};

export const getAvailableByAccount = (accounts: Account[], allocations: BucketAllocation[], spends: BucketSpend[] = []) => {
  const reserved = getReservedByAccount(accounts, allocations, spends);
  const available: Record<string, number> = {};
  accounts.forEach((acc) => {
    available[acc.id] = roundMoney(acc.balance - (reserved[acc.id] || 0));
  });
  return available;
};

export const getBucketTotals = (buckets: SavingBucket[], allocations: BucketAllocation[], spends: BucketSpend[] = []) => {
  const totals: Record<string, number> = {};
  buckets.forEach((bucket) => {
    totals[bucket.id] = 0;
  });
  allocations.forEach((allocation) => {
    totals[allocation.bucketId] = roundMoney((totals[allocation.bucketId] || 0) + allocation.amount);
  });
  spends.forEach((spend) => {
    totals[spend.bucketId] = roundMoney((totals[spend.bucketId] || 0) - spend.amount);
  });
  return totals;
};

export const getBucketAccountSpendable = (
  buckets: SavingBucket[],
  accounts: Account[],
  allocations: BucketAllocation[],
  spends: BucketSpend[]
) => {
  const spendable: Record<string, number> = {};
  buckets.forEach((bucket) => {
    accounts.forEach((account) => {
      spendable[`${bucket.id}::${account.id}`] = 0;
    });
  });
  allocations.forEach((allocation) => {
    const key = `${allocation.bucketId}::${allocation.accountId}`;
    spendable[key] = roundMoney((spendable[key] || 0) + allocation.amount);
  });
  spends.forEach((spend) => {
    const key = `${spend.bucketId}::${spend.accountId}`;
    spendable[key] = roundMoney((spendable[key] || 0) - spend.amount);
  });
  return spendable;
};

export const buildAutoAllocations = (
  txId: string,
  accountId: string,
  amount: number,
  rules: IncomeAllocationRule[],
  buckets: SavingBucket[]
): BucketAllocation[] => {
  if (amount <= 0) return [];
  const activeRules = rules.filter(
    (r) =>
      r.isActive &&
      r.value > 0 &&
      buckets.some((b) => b.id === r.bucketId) &&
      (!r.sourceAccountId || r.sourceAccountId === accountId)
  );
  if (!activeRules.length) return [];

  let remaining = amount;
  const draft: RuleDraft[] = [];

  activeRules
    .filter((r) => r.type === 'fixed')
    .forEach((rule) => {
      if (remaining <= 0) return;
      const allocate = Math.min(remaining, rule.value);
      if (allocate > 0) {
        draft.push({ bucketId: rule.bucketId, sourceAccountId: rule.sourceAccountId || accountId, amount: roundMoney(allocate) });
        remaining = roundMoney(remaining - allocate);
      }
    });

  const percentRules = activeRules.filter((r) => r.type === 'percent');
  if (remaining > 0 && percentRules.length > 0) {
    percentRules.forEach((rule) => {
      if (remaining <= 0) return;
      const raw = amount * (rule.value / 100);
      const allocate = roundMoney(Math.max(0, Math.min(remaining, raw)));
      if (allocate > 0) {
        draft.push({ bucketId: rule.bucketId, sourceAccountId: rule.sourceAccountId || accountId, amount: allocate });
        remaining = roundMoney(remaining - allocate);
      }
    });
  }

  return draft
    .filter((item) => item.amount > 0)
    .map((item, index) => ({
      id: `ba_${txId}_${index}`,
      bucketId: item.bucketId,
      accountId: item.sourceAccountId,
      amount: item.amount,
      source: 'auto',
      linkedTransactionId: txId,
      createdAt: new Date().toISOString(),
    }));
};
