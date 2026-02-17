import React, { useMemo, useState } from 'react';
import CurrencyInput from 'react-currency-input-field';
import { PiggyBank, Plus, Trash2, Sparkles } from 'lucide-react';
import { normalizeImeNumericRaw } from '../utils/numberInput';
import type { Account, BucketAllocation, IncomeAllocationRule, PlanTier, SavingBucket } from '../types';

interface SavingAssistantProps {
  planTier: PlanTier;
  bucketLimit: number;
  canUseAutoRules: boolean;
  accounts: Account[];
  buckets: SavingBucket[];
  allocations: BucketAllocation[];
  bucketTotals: Record<string, number>;
  incomeRules: IncomeAllocationRule[];
  onAddBucket: (name: string, targetAmount: number, color: string) => void;
  onDeleteBucket: (bucketId: string) => void;
  onUpdateBucketTarget: (bucketId: string, targetAmount: number) => void;
  onDeleteAllocation: (allocationId: string) => void;
  onUpsertIncomeRule: (bucketId: string, sourceAccountId: string, type: 'percent' | 'fixed', value: number) => void;
  onDeleteIncomeRule: (ruleId: string) => void;
}

const SavingAssistant: React.FC<SavingAssistantProps> = ({
  planTier,
  bucketLimit,
  canUseAutoRules,
  accounts,
  buckets,
  allocations,
  bucketTotals,
  incomeRules,
  onAddBucket,
  onDeleteBucket,
  onUpdateBucketTarget,
  onDeleteAllocation,
  onUpsertIncomeRule,
  onDeleteIncomeRule,
}) => {
  const [bucketName, setBucketName] = useState('');
  const [bucketTarget, setBucketTarget] = useState('');
  const [bucketColor, setBucketColor] = useState('#D08C70');

  const [bucketSourceAccounts, setBucketSourceAccounts] = useState<Record<string, string>>({});
  const [bucketValueTypes, setBucketValueTypes] = useState<Record<string, 'fixed' | 'percent'>>({});
  const [bucketValues, setBucketValues] = useState<Record<string, string>>({});

  const accountMap = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);
  const sortedBuckets = useMemo(() => [...buckets].sort((a, b) => a.priority - b.priority), [buckets]);

  const handleAddBucket = () => {
    const amount = Number(bucketTarget.replace(/,/g, ''));
    if (!bucketName.trim()) return;
    if (!Number.isFinite(amount) || amount < 0) return;
    onAddBucket(bucketName.trim(), amount, bucketColor);
    setBucketName('');
    setBucketTarget('');
  };

  const getBucketValueType = (bucketId: string): 'fixed' | 'percent' => {
    const type = bucketValueTypes[bucketId] || 'fixed';
    if (type === 'percent' && !canUseAutoRules) return 'fixed';
    return type;
  };

  const handleApplyRuleForBucket = (bucketId: string, selectedSourceAccountId?: string) => {
    const sourceAccountId = selectedSourceAccountId || bucketSourceAccounts[bucketId];
    if (!sourceAccountId) return;

    const rawValue = bucketValues[bucketId] || '';
    const valueType = getBucketValueType(bucketId);
    const parsedInput = Number(rawValue.replace(/,/g, ''));
    const parsed = valueType === 'percent'
      ? Math.max(0, Math.min(100, parsedInput))
      : parsedInput;

    if (!Number.isFinite(parsed) || parsed <= 0) return;

    onUpsertIncomeRule(bucketId, sourceAccountId, valueType, parsed);
    setBucketValues((prev) => ({ ...prev, [bucketId]: '' }));
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
            <p className="text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest">自動規則</p>
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
            <CurrencyInput
              inputMode="numeric"
              value={bucketTarget}
              groupSeparator=","
              allowNegativeValue={false}
              decimalsLimit={0}
              transformRawValue={normalizeImeNumericRaw}
              onValueChange={(value) => setBucketTarget(value || '')}
              placeholder="目標金額"
              className="h-10 rounded-xl border border-[#E6DED6] px-3 text-sm font-bold outline-none"
            />
            <input value={bucketColor} onChange={(e) => setBucketColor(e.target.value)} type="color" className="h-10 rounded-xl border border-[#E6DED6] p-1.5" />
            <button onClick={handleAddBucket} className="h-10 rounded-xl bg-[#1A1A1A] px-4 text-[10px] font-black uppercase tracking-widest text-white">
              <Plus size={14} className="inline-block mr-1" />新增
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
        const bucketRules = incomeRules.filter((r) => r.bucketId === bucket.id && r.isActive);
        const valueType = getBucketValueType(bucket.id);
        const selectedSourceAccountId = bucketSourceAccounts[bucket.id] || bucketRules[0]?.sourceAccountId || '';

        return (
          <div key={bucket.id} className="custom-card p-5 rounded-[2rem]">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bucket.color }} />
                  <h4 className="text-sm font-black text-[#1A1A1A]">{bucket.name}</h4>
                </div>
                <p className="text-xs font-bold text-[#6B6661] mt-1">${total.toLocaleString()} / ${bucket.targetAmount.toLocaleString()}</p>
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
              <CurrencyInput
                inputMode="numeric"
                value={bucket.targetAmount}
                groupSeparator=","
                allowNegativeValue={false}
                decimalsLimit={0}
                transformRawValue={normalizeImeNumericRaw}
                onValueChange={(value) => onUpdateBucketTarget(bucket.id, Number(value || '0'))}
                className="h-8 w-32 rounded-lg border border-[#E6DED6] px-2 text-xs font-bold outline-none"
              />
            </div>

            <div className="mt-3 rounded-xl border border-[#E6DED6] bg-[#FAF7F2] p-3 space-y-2">
              <p className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">規則設定</p>
              <div className="grid md:grid-cols-[1fr_0.9fr_0.9fr_auto] gap-2">
                <select
                  value={selectedSourceAccountId}
                  onChange={(e) => setBucketSourceAccounts((prev) => ({ ...prev, [bucket.id]: e.target.value }))}
                  className="h-10 rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none"
                >
                  <option value="">收入來源帳戶</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
                <select
                  value={valueType}
                  onChange={(e) => setBucketValueTypes((prev) => ({ ...prev, [bucket.id]: e.target.value as 'fixed' | 'percent' }))}
                  className="h-10 rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none"
                >
                  <option value="fixed">金額</option>
                  {canUseAutoRules && <option value="percent">%</option>}
                </select>
                <CurrencyInput
                  inputMode="numeric"
                  value={bucketValues[bucket.id] || ''}
                  groupSeparator={valueType === 'percent' ? undefined : ','}
                  allowNegativeValue={false}
                  decimalsLimit={0}
                  transformRawValue={normalizeImeNumericRaw}
                  onValueChange={(value) => {
                    const raw = value || '';
                    if (valueType === 'percent') {
                      const num = Number(raw);
                      const clamped = Number.isFinite(num) ? Math.max(0, Math.min(100, num)) : 0;
                      setBucketValues((prev) => ({ ...prev, [bucket.id]: raw === '' ? '' : String(clamped) }));
                      return;
                    }
                    setBucketValues((prev) => ({ ...prev, [bucket.id]: raw }));
                  }}
                  placeholder={valueType === 'percent' ? '例如 20' : '金額'}
                  className="h-10 rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none"
                />
                <button
                  onClick={() => handleApplyRuleForBucket(bucket.id, selectedSourceAccountId)}
                  className="h-10 rounded-xl bg-[#1A1A1A] px-4 text-[10px] font-black uppercase tracking-widest text-white"
                >
                  儲存規則
                </button>
              </div>
              {!canUseAutoRules && (
                <p className="text-xs font-bold text-[#6B6661]">MVP 僅提供固定金額規則；PRO 可使用百分比規則。</p>
              )}
            </div>

            {bucketRules.map((rule) => (
              <div key={rule.id} className="mt-2 flex items-center justify-between rounded-lg bg-[#F7EEE8] px-3 py-2">
                <p className="text-[10px] font-black text-[#D08C70]"><Sparkles size={11} className="inline-block mr-1" />{(accounts.find((a) => a.id === rule.sourceAccountId)?.name || '收入帳戶')}：{rule.type === 'percent' ? `${rule.value}%` : `$${rule.value.toLocaleString()}`}</p>
                <button onClick={() => onDeleteIncomeRule(rule.id)} className="text-[#B7ADA4] hover:text-red-500"><Trash2 size={13} /></button>
              </div>
            ))}

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
    </div>
  );
};

export default SavingAssistant;
