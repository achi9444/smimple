import type { PlanTier } from '../types';

export type FeatureKey = 'saving_assistant' | 'bucket_limit' | 'auto_income_rules';

export const canUse = (feature: FeatureKey, planTier: PlanTier) => {
  if (planTier === 'pro') return true;
  if (feature === 'saving_assistant') return true;
  if (feature === 'bucket_limit') return true;
  return false;
};

export const getBucketLimit = (planTier: PlanTier) => (planTier === 'pro' ? Infinity : 2);

