import React, { useMemo, useState } from 'react';
import CurrencyInput from 'react-currency-input-field';
import * as LucideIcons from 'lucide-react';
import { PiggyBank, Plus, Trash2, Sparkles, X, Pencil } from 'lucide-react';
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
  onUpdateBucket: (bucketId: string, patch: Partial<Pick<SavingBucket, 'name' | 'targetAmount' | 'color'>>) => void;
  onDeleteBucket: (bucketId: string) => void;
  onDeleteAllocation: (allocationId: string) => void;
  onUpsertIncomeRule: (bucketId: string, sourceAccountId: string, type: 'percent' | 'fixed', value: number) => void;
  onDeleteIncomeRule: (ruleId: string) => void;
  onAddManualAllocation: (bucketId: string, accountId: string, amount: number) => void;
}

type ModalType = 'rule' | 'manual' | 'add' | 'edit' | null;

const presetColors = ['#D08C70', '#729B79', '#5B84B1', '#C97B63', '#E07A5F', '#B7ADA4'];

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
  onUpdateBucket,
  onDeleteBucket,
  onDeleteAllocation,
  onUpsertIncomeRule,
  onDeleteIncomeRule,
  onAddManualAllocation,
}) => {
  const [bucketName, setBucketName] = useState('');
  const [bucketTarget, setBucketTarget] = useState('');
  const [bucketColor, setBucketColor] = useState('#D08C70');

  const [modalType, setModalType] = useState<ModalType>(null);
  const [activeBucketId, setActiveBucketId] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [valueType, setValueType] = useState<'fixed' | 'percent'>('fixed');
  const [valueInput, setValueInput] = useState('');
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);

  const accountMap = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);
  const sortedBuckets = useMemo(() => [...buckets].sort((a, b) => a.priority - b.priority), [buckets]);
  const activeBucket = sortedBuckets.find((b) => b.id === activeBucketId);
  const activeRules = incomeRules.filter((r) => r.bucketId === activeBucketId && r.isActive);

  const renderAccountIcon = (iconName: string, iconColor: string) => {
    const Icon = (LucideIcons as any)[iconName] || LucideIcons.Wallet;
    return <Icon size={12} strokeWidth={2} style={{ color: iconColor }} />;
  };

  const openModal = (type: ModalType, bucketId = '') => {
    setModalType(type);
    setActiveBucketId(bucketId);
    const firstAccount = accounts[0]?.id || '';

    if (type === 'add') {
      setBucketName('');
      setBucketTarget('');
      setBucketColor('#D08C70');
      setSelectedAccountId(firstAccount);
      setValueType('fixed');
      setValueInput('');
      return;
    }

    const firstRule = incomeRules.find((r) => r.bucketId === bucketId && r.isActive);
    setSelectedAccountId(firstRule?.sourceAccountId || firstAccount);
    setValueType(firstRule?.type || 'fixed');
    setValueInput('');

    if (type === 'edit') {
      const bucket = buckets.find((b) => b.id === bucketId);
      setBucketName(bucket?.name || '');
      setBucketTarget(String(bucket?.targetAmount || 0));
      setBucketColor(bucket?.color || '#D08C70');
    }
  };

  const closeModal = () => {
    setModalType(null);
    setActiveBucketId('');
    setValueInput('');
  };

  const handleDeleteConfirm = (key: string, action: () => void) => {
    if (deleteConfirmKey === key) {
      action();
      setDeleteConfirmKey(null);
      return;
    }
    setDeleteConfirmKey(key);
    window.setTimeout(() => {
      setDeleteConfirmKey((prev) => (prev === key ? null : prev));
    }, 3000);
  };

  const handleAddBucket = () => {
    const amount = Number(bucketTarget.replace(/,/g, ''));
    if (!bucketName.trim()) return;
    if (!Number.isFinite(amount) || amount < 0) return;
    onAddBucket(bucketName.trim(), amount, bucketColor);
    setBucketName('');
    setBucketTarget('');
    closeModal();
  };

  const handleEditBucket = () => {
    if (!activeBucketId) return;
    const amount = Number(bucketTarget.replace(/,/g, ''));
    if (!bucketName.trim()) return;
    if (!Number.isFinite(amount) || amount < 0) return;
    onUpdateBucket(activeBucketId, {
      name: bucketName.trim(),
      targetAmount: amount,
      color: bucketColor,
    });
    closeModal();
  };

  const handleSaveRule = () => {
    if (!activeBucketId || !selectedAccountId) return;
    const parsedInput = Number(valueInput.replace(/,/g, ''));
    const parsed = valueType === 'percent' ? Math.max(0, Math.min(100, parsedInput)) : parsedInput;
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onUpsertIncomeRule(activeBucketId, selectedAccountId, valueType, parsed);
    setValueInput('');
  };

  const handleManualAllocate = () => {
    if (!activeBucketId || !selectedAccountId) return;
    const amount = Number(valueInput.replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return;
    onAddManualAllocation(activeBucketId, selectedAccountId, amount);
    setValueInput('');
    closeModal();
  };

  return (
    <div className="space-y-5 mb-8">
      <div className="custom-card p-6 rounded-[2.5rem] space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-extrabold text-[#1A1A1A] text-base flex items-center gap-2"><PiggyBank size={18} className="text-[#D08C70]" />錢罐</h3>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${planTier === 'pro' ? 'bg-[#1A1A1A] text-white' : 'bg-[#FAF7F2] text-[#6B6661]'}`}>{planTier.toUpperCase()}</span>
            {(!Number.isFinite(bucketLimit) || buckets.length < bucketLimit) && (
              <button onClick={() => openModal('add')} className="h-10 rounded-xl bg-[#1A1A1A] px-4 text-[10px] font-black uppercase tracking-widest text-white"><Plus size={14} className="inline-block mr-1" />新增目標</button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[#E6DED6] bg-[#FAF7F2] p-3"><p className="text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest">目標池數量</p><p className="text-lg font-black text-[#1A1A1A]">{buckets.length}<span className="text-xs text-[#B7ADA4]"> / {Number.isFinite(bucketLimit) ? bucketLimit : '∞'}</span></p></div>
          <div className="rounded-2xl border border-[#E6DED6] bg-[#FAF7F2] p-3"><p className="text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest">已分配總額</p><p className="text-lg font-black text-[#1A1A1A]">${allocations.reduce((sum, a) => sum + a.amount, 0).toLocaleString()}</p></div>
        </div>

        {(Number.isFinite(bucketLimit) && buckets.length >= bucketLimit) && (
          <p className="rounded-xl bg-[#FAF7F2] p-3 text-xs font-bold text-[#6B6661]">MVP 版最多 2 個目標池，升級 PRO 可不限數量。</p>
        )}
      </div>

      {sortedBuckets.map((bucket) => {
        const total = bucketTotals[bucket.id] || 0;
        const progress = bucket.targetAmount > 0 ? Math.min((total / bucket.targetAmount) * 100, 100) : 0;
        const bucketAllocations = allocations.filter((a) => a.bucketId === bucket.id);
        const rules = incomeRules.filter((r) => r.bucketId === bucket.id && r.isActive);

        return (
          <div key={bucket.id} className="custom-card p-5 rounded-[2rem]">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: bucket.color }} /><h4 className="text-sm font-black text-[#1A1A1A]">{bucket.name}</h4></div>
                <p className="text-xs font-bold text-[#6B6661] mt-1">${total.toLocaleString()} / ${bucket.targetAmount.toLocaleString()}（{Math.round(progress)}%）</p>
                <div className="mt-2 w-full h-2 rounded-full bg-[#FAF7F2] border border-[#E6DED6] overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: bucket.color }} /></div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {rules.map((rule) => (
                    <span key={rule.id} className="inline-flex items-center gap-1 rounded-full border border-[#D08C70]/30 bg-[#F7EEE8] px-2 py-1 text-[10px] font-black text-[#D08C70]">
                      <Sparkles size={10} />{accountMap[rule.sourceAccountId]?.name || '帳戶'}：{rule.type === 'percent' ? `${rule.value}%` : `$${rule.value.toLocaleString()}`}
                      <button onClick={() => handleDeleteConfirm(`rule_${rule.id}`, () => onDeleteIncomeRule(rule.id))} className={`ml-1 rounded px-1 py-0.5 text-[9px] font-black ${deleteConfirmKey === `rule_${rule.id}` ? 'bg-red-500 text-white' : 'text-[#B7ADA4] hover:text-red-500'}`}>
                        {deleteConfirmKey === `rule_${rule.id}` ? '確認' : <Trash2 size={10} />}
                      </button>
                    </span>
                  ))}
                  {!rules.length && <span className="text-[10px] font-bold text-[#B7ADA4]">尚未設定規則</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openModal('edit', bucket.id)} className="p-2 rounded-xl text-[#B7ADA4] hover:text-[#1A1A1A] hover:bg-[#FAF7F2]" title="編輯目標"><Pencil size={16} /></button>
                <button onClick={() => handleDeleteConfirm(`bucket_${bucket.id}`, () => onDeleteBucket(bucket.id))} className={`p-2 rounded-xl transition-all ${deleteConfirmKey === `bucket_${bucket.id}` ? 'bg-red-500 text-white px-3' : 'text-[#B7ADA4] hover:text-red-500 hover:bg-red-50'}`} title={deleteConfirmKey === `bucket_${bucket.id}` ? '再次點擊確認刪除' : '刪除目標'}>
                  {deleteConfirmKey === `bucket_${bucket.id}` ? <span className="text-[10px] font-black">確認刪除</span> : <Trash2 size={16} />}
                </button>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button onClick={() => openModal('rule', bucket.id)} className="h-10 rounded-xl bg-[#1A1A1A] px-4 text-[10px] font-black uppercase tracking-widest text-white">+ 規則設定</button>
              <button onClick={() => openModal('manual', bucket.id)} className="h-10 rounded-xl bg-[#D08C70] px-4 text-[10px] font-black uppercase tracking-widest text-white">手動分配</button>
            </div>

            <div className="mt-3 space-y-2">
              {bucketAllocations.map((allocation) => (
                <div key={allocation.id} className="flex items-center justify-between rounded-xl bg-[#FAF7F2] border border-[#E6DED6] px-3 py-2">
                  <span className="text-xs font-bold text-[#6B6661]">{accountMap[allocation.accountId]?.name || '未知帳戶'} · ${allocation.amount.toLocaleString()}<span className="ml-1 text-[10px] text-[#B7ADA4]">({allocation.source === 'auto' ? '自動' : '手動'})</span></span>
                  <button onClick={() => handleDeleteConfirm(`alloc_${allocation.id}`, () => onDeleteAllocation(allocation.id))} className={`rounded px-1.5 py-1 text-[9px] font-black ${deleteConfirmKey === `alloc_${allocation.id}` ? 'bg-red-500 text-white' : 'text-[#B7ADA4] hover:text-red-500'}`}>
                    {deleteConfirmKey === `alloc_${allocation.id}` ? '確認' : <Trash2 size={14} />}
                  </button>
                </div>
              ))}
              {!bucketAllocations.length && <p className="text-xs font-bold text-[#B7ADA4]">尚未分配資金</p>}
            </div>
          </div>
        );
      })}

      {modalType && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-[#E6DED6] bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#E6DED6] px-5 py-4">
              <h4 className="text-sm font-black text-[#1A1A1A]">
                {modalType === 'add' && '新增目標池'}
                {modalType === 'edit' && `編輯目標 · ${activeBucket?.name || ''}`}
                {modalType === 'rule' && `規則設定 · ${activeBucket?.name || ''}`}
                {modalType === 'manual' && `手動分配 · ${activeBucket?.name || ''}`}
              </h4>
              <button onClick={closeModal} className="text-[#B7ADA4] hover:text-[#1A1A1A]"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-3">
              {(modalType === 'add' || modalType === 'edit') && (
                <>
                  <input value={bucketName} onChange={(e) => setBucketName(e.target.value)} placeholder="目標名稱，例如：旅遊基金" className="h-10 w-full rounded-xl border border-[#E6DED6] px-3 text-sm font-bold outline-none" />
                  <CurrencyInput inputMode="numeric" value={bucketTarget} groupSeparator="," allowNegativeValue={false} decimalsLimit={0} transformRawValue={normalizeImeNumericRaw} onValueChange={(value) => setBucketTarget(value || '')} placeholder="目標金額" className="h-10 w-full rounded-xl border border-[#E6DED6] px-3 text-sm font-bold outline-none" />
                  <div className="flex flex-wrap gap-2.5">
                    {presetColors.map((item) => <button key={item} onClick={() => setBucketColor(item)} className={`w-7 h-7 rounded-full transition-all ${bucketColor === item ? 'ring-2 ring-[#1A1A1A] ring-offset-2' : ''}`} style={{ backgroundColor: item }} />)}
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                    <input type="text" value={bucketColor} onChange={(e) => setBucketColor(e.target.value)} className="h-10 rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none" placeholder="#D08C70" />
                    <input type="color" value={bucketColor} onChange={(e) => setBucketColor(e.target.value)} className="h-10 w-14 rounded-xl border border-[#E6DED6] p-1" />
                  </div>
                  <button onClick={modalType === 'add' ? handleAddBucket : handleEditBucket} className="w-full h-11 rounded-xl bg-[#1A1A1A] text-white text-xs font-black">{modalType === 'add' ? '新增目標' : '儲存變更'}</button>
                </>
              )}

              {(modalType === 'rule' || modalType === 'manual') && (
                <>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">來源帳戶</p>
                    <div className="rounded-xl border border-[#E6DED6] p-2 space-y-1 max-h-44 overflow-y-auto">
                      {accounts.map((account) => {
                        const active = selectedAccountId === account.id;
                        return (
                          <button key={account.id} onClick={() => setSelectedAccountId(account.id)} className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-between ${active ? 'bg-[#F7EEE8] text-[#D08C70] border-[#D08C70]/40' : 'bg-white text-[#1A1A1A] border-[#E6DED6]'}`}>
                            <span className="flex items-center gap-2">{renderAccountIcon(account.icon, account.color)}{account.name}</span>
                            <span className="text-[10px] text-[#B7ADA4]">${account.balance.toLocaleString()}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {modalType === 'rule' && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">規則型態</p>
                      <div className="flex gap-2">
                        <button onClick={() => setValueType('fixed')} className={`flex-1 h-10 rounded-xl text-xs font-black ${valueType === 'fixed' ? 'bg-[#F7EEE8] text-[#D08C70] border border-[#D08C70]/40' : 'bg-[#FAF7F2] text-[#6B6661]'}`}>金額</button>
                        {canUseAutoRules && <button onClick={() => setValueType('percent')} className={`flex-1 h-10 rounded-xl text-xs font-black ${valueType === 'percent' ? 'bg-[#F7EEE8] text-[#D08C70] border border-[#D08C70]/40' : 'bg-[#FAF7F2] text-[#6B6661]'}`}>%</button>}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">數值</p>
                    <CurrencyInput inputMode="numeric" value={valueInput} groupSeparator={valueType === 'percent' ? undefined : ','} allowNegativeValue={false} decimalsLimit={0} transformRawValue={normalizeImeNumericRaw} onValueChange={(value) => setValueInput(value || '')} placeholder={modalType === 'manual' ? '手動入金金額' : valueType === 'percent' ? '例如 20' : '固定金額'} className="h-10 w-full rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none" />
                  </div>

                  <button onClick={() => { if (modalType === 'rule') handleSaveRule(); else handleManualAllocate(); }} className="w-full h-11 rounded-xl bg-[#1A1A1A] text-white text-xs font-black">
                    {modalType === 'rule' ? '儲存規則' : '立即分配'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SavingAssistant;




