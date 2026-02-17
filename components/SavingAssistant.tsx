import React, { useMemo, useState } from 'react';
import { PiggyBank, Plus, Trash2, Sparkles } from 'lucide-react';
import type { Account, BucketAllocation, IncomeAllocationRule, PlanTier, SavingBucket } from '../types';

interface SavingAssistantProps {
  planTier: PlanTier;
  bucketLimit: number;
  canUseAutoRules: boolean;
  accounts: Account[];
  buckets: SavingBucket[];
  allocations: BucketAllocation[];
  incomeRules: IncomeAllocationRule[];
  onAddBucket: (name: string, targetAmount: number, color: string) => void;
  onDeleteBucket: (bucketId: string) => void;
  onUpdateBucketTarget: (bucketId: string, targetAmount: number) => void;
  onAddAllocation: (bucketId: string, accountId: string, amount: number) => void;
  onDeleteAllocation: (allocationId: string) => void;
  onUpsertIncomeRule: (bucketId: string, type: 'percent' | 'fixed', value: number) => void;
  onDeleteIncomeRule: (ruleId: string) => void;
}

const SavingAssistant: React.FC<SavingAssistantProps> = ({
  planTier,
  bucketLimit,
  canUseAutoRules,
  accounts,
  buckets,
  allocations,
  incomeRules,
  onAddBucket,
  onDeleteBucket,
  onUpdateBucketTarget,
  onAddAllocation,
  onDeleteAllocation,
  onUpsertIncomeRule,
  onDeleteIncomeRule,
}) => {
  const [bucketName, setBucketName] = useState('');
  const [bucketTarget, setBucketTarget] = useState('');
  const [bucketColor, setBucketColor] = useState('#D08C70');
  const [allocBucketId, setAllocBucketId] = useState('');
  const [allocAccountId, setAllocAccountId] = useState('');
  const [allocAmount, setAllocAmount] = useState('');
  const [ruleType, setRuleType] = useState<'percent' | 'fixed'>('percent');
  const [ruleBucketId, setRuleBucketId] = useState('');
  const [ruleValue, setRuleValue] = useState('');

  const accountMap = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);
  const bucketTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    buckets.forEach((bucket) => {
      totals[bucket.id] = 0;
    });
    allocations.forEach((allocation) => {
      totals[allocation.bucketId] = (totals[allocation.bucketId] || 0) + allocation.amount;
    });
    return totals;
  }, [buckets, allocations]);

  const sortedBuckets = useMemo(
    () => [...buckets].sort((a, b) => a.priority - b.priority),
    [buckets]
  );

  const handleAddBucket = () => {
    const amount = Number(bucketTarget.replace(/,/g, ''));
    if (!bucketName.trim()) return;
    if (!Number.isFinite(amount) || amount < 0) return;
    onAddBucket(bucketName.trim(), amount, bucketColor);
    setBucketName('');
    setBucketTarget('');
  };

  const handleAddAllocation = () => {
    const amount = Number(allocAmount.replace(/,/g, ''));
    if (!allocBucketId || !allocAccountId) return;
    if (!Number.isFinite(amount) || amount <= 0) return;
    onAddAllocation(allocBucketId, allocAccountId, amount);
    setAllocAmount('');
  };

  const handleSaveRule = () => {
    const value = Number(ruleValue);
    if (!ruleBucketId || !Number.isFinite(value) || value <= 0) return;
    onUpsertIncomeRule(ruleBucketId, ruleType, value);
    setRuleValue('');
  };

  return (
    <div className="space-y-5 mb-8">
      <div className="custom-card p-6 rounded-[2.5rem]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-[#1A1A1A] text-base flex items-center gap-2">
            <PiggyBank size={18} className="text-[#D08C70]" />
            存錢助手
          </h3>
          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${planTier === 'pro' ? 'bg-[#1A1A1A] text-white' : 'bg-[#FAF7F2] text-[#6B6661]'}`}>
            {planTier.toUpperCase()}
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-[#E6DED6] bg-[#FAF7F2] p-3">
            <p className="text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest">目標池數量</p>
            <p className="text-lg font-black text-[#1A1A1A]">
              {buckets.length}
              <span className="text-xs text-[#B7ADA4]"> / {Number.isFinite(bucketLimit) ? bucketLimit : '∞'}</span>
            </p>
          </div>
          <div className="rounded-2xl border border-[#E6DED6] bg-[#FAF7F2] p-3">
            <p className="text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest">已分配總額</p>
            <p className="text-lg font-black text-[#1A1A1A]">${allocations.reduce((sum, a) => sum + a.amount, 0).toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-[#E6DED6] bg-[#FAF7F2] p-3">
            <p className="text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest">自動分配規則</p>
            <p className="text-lg font-black text-[#1A1A1A]">{incomeRules.filter((r) => r.isActive).length}</p>
          </div>
        </div>

        {!Number.isFinite(bucketLimit) || buckets.length < bucketLimit ? (
          <div className="mt-4 grid md:grid-cols-[1.2fr_0.9fr_0.6fr_auto] gap-2">
            <input
              value={bucketName}
              onChange={(e) => setBucketName(e.target.value)}
              placeholder="目標名稱，例如：旅遊基金"
              className="h-10 rounded-xl border border-[#E6DED6] px-3 text-sm font-bold outline-none"
            />
            <input
              value={bucketTarget}
              onChange={(e) => setBucketTarget(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="目標金額"
              className="h-10 rounded-xl border border-[#E6DED6] px-3 text-sm font-bold outline-none"
            />
            <input value={bucketColor} onChange={(e) => setBucketColor(e.target.value)} type="color" className="h-10 rounded-xl border border-[#E6DED6] p-1.5" />
            <button onClick={handleAddBucket} className="h-10 rounded-xl bg-[#1A1A1A] px-4 text-[10px] font-black uppercase tracking-widest text-white">
              <Plus size={14} className="inline-block mr-1" />
              新增
            </button>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-[#FAF7F2] p-3 text-xs font-bold text-[#6B6661]">MVP 版最多 2 個目標池，升級 PRO 可不限數量。</p>
        )}
      </div>

      {sortedBuckets.map((bucket) => {
        const total = bucketTotals[bucket.id] || 0;
        const progress = bucket.targetAmount > 0 ? Math.min((total / bucket.targetAmount) * 100, 100) : 0;
        const bucketAllocations = allocations.filter((a) => a.bucketId === bucket.id);
        const rule = incomeRules.find((r) => r.bucketId === bucket.id && r.isActive);
        return (
          <div key={bucket.id} className="custom-card p-5 rounded-[2rem]">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bucket.color }} />
                  <h4 className="text-sm font-black text-[#1A1A1A]">{bucket.name}</h4>
                </div>
                <p className="text-xs font-bold text-[#6B6661] mt-1">
                  ${total.toLocaleString()} / ${bucket.targetAmount.toLocaleString()}
                </p>
                <div className="mt-2 w-full h-2 rounded-full bg-[#FAF7F2] border border-[#E6DED6] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: bucket.color }} />
                </div>
              </div>
              <button onClick={() => onDeleteBucket(bucket.id)} className="p-2 rounded-xl text-[#B7ADA4] hover:text-red-500 hover:bg-red-50">
                <Trash2 size={16} />
              </button>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] font-black text-[#B7ADA4] uppercase tracking-widest">目標</span>
              <input
                value={bucket.targetAmount}
                onChange={(e) => onUpdateBucketTarget(bucket.id, Number(e.target.value.replace(/[^\d.]/g, '')) || 0)}
                className="h-8 w-32 rounded-lg border border-[#E6DED6] px-2 text-xs font-bold outline-none"
              />
            </div>

            {rule && (
              <p className="mt-2 text-[10px] font-black text-[#D08C70]">
                <Sparkles size={11} className="inline-block mr-1" />
                收入自動分配：{rule.type === 'percent' ? `${rule.value}%` : `$${rule.value.toLocaleString()}`}
              </p>
            )}

            <div className="mt-3 space-y-2">
              {bucketAllocations.map((allocation) => (
                <div key={allocation.id} className="flex items-center justify-between rounded-xl bg-[#FAF7F2] border border-[#E6DED6] px-3 py-2">
                  <span className="text-xs font-bold text-[#6B6661]">
                    {accountMap[allocation.accountId]?.name || '未知帳戶'} · ${allocation.amount.toLocaleString()}
                    <span className="ml-1 text-[10px] text-[#B7ADA4]">({allocation.source === 'auto' ? '自動' : '手動'})</span>
                  </span>
                  <button onClick={() => onDeleteAllocation(allocation.id)} className="text-[#B7ADA4] hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {!bucketAllocations.length && <p className="text-xs font-bold text-[#B7ADA4]">尚未分配資金</p>}
            </div>
          </div>
        );
      })}

      {buckets.length > 0 && (
        <div className="custom-card p-5 rounded-[2rem] space-y-3">
          <h4 className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">手動分配</h4>
          <div className="grid md:grid-cols-[1fr_1fr_0.8fr_auto] gap-2">
            <select value={allocBucketId} onChange={(e) => setAllocBucketId(e.target.value)} className="h-10 rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none">
              <option value="">選擇目標池</option>
              {sortedBuckets.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>
                  {bucket.name}
                </option>
              ))}
            </select>
            <select value={allocAccountId} onChange={(e) => setAllocAccountId(e.target.value)} className="h-10 rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none">
              <option value="">選擇來源帳戶</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <input
              value={allocAmount}
              onChange={(e) => setAllocAmount(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="金額"
              className="h-10 rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none"
            />
            <button onClick={handleAddAllocation} className="h-10 rounded-xl bg-[#D08C70] px-4 text-[10px] font-black uppercase tracking-widest text-white">
              分配
            </button>
          </div>
        </div>
      )}

      <div className="custom-card p-5 rounded-[2rem] space-y-3">
        <h4 className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">收入自動分配規則</h4>
        {canUseAutoRules ? (
          <div className="grid md:grid-cols-[1fr_0.8fr_0.8fr_auto] gap-2">
            <select value={ruleBucketId} onChange={(e) => setRuleBucketId(e.target.value)} className="h-10 rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none">
              <option value="">選擇目標池</option>
              {sortedBuckets.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>
                  {bucket.name}
                </option>
              ))}
            </select>
            <select value={ruleType} onChange={(e) => setRuleType(e.target.value as 'percent' | 'fixed')} className="h-10 rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none">
              <option value="percent">百分比</option>
              <option value="fixed">固定金額</option>
            </select>
            <input
              value={ruleValue}
              onChange={(e) => setRuleValue(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder={ruleType === 'percent' ? '例如 20' : '例如 5000'}
              className="h-10 rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none"
            />
            <button onClick={handleSaveRule} className="h-10 rounded-xl bg-[#1A1A1A] px-4 text-[10px] font-black uppercase tracking-widest text-white">
              儲存
            </button>
          </div>
        ) : (
          <p className="rounded-xl bg-[#FAF7F2] p-3 text-xs font-bold text-[#6B6661]">自動分配規則為 PRO 功能。MVP 可用手動分配。</p>
        )}

        {incomeRules.filter((r) => r.isActive).map((rule) => {
          const bucket = buckets.find((b) => b.id === rule.bucketId);
          return (
            <div key={rule.id} className="flex items-center justify-between rounded-xl border border-[#E6DED6] bg-[#FAF7F2] px-3 py-2">
              <span className="text-xs font-bold text-[#1A1A1A]">
                {bucket?.name || '未知目標'}：{rule.type === 'percent' ? `${rule.value}%` : `$${rule.value.toLocaleString()}`}
              </span>
              <button onClick={() => onDeleteIncomeRule(rule.id)} className="text-[#B7ADA4] hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SavingAssistant;

