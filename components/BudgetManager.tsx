import React, { useMemo, useState } from 'react';
import CurrencyInput from 'react-currency-input-field';
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react';
import { normalizeImeNumericRaw } from '../utils/numberInput';
import type { BudgetItem, SpendingScope } from '../types';
import { SUPPORTED_CURRENCIES } from '../types';

interface BudgetManagerProps {
  budgets: BudgetItem[];
  scopes: SpendingScope[];
  onChange: (next: BudgetItem[]) => void;
}

type EditState = {
  id?: string;
  name: string;
  currencyCode: string;
  amount: string;
  period: 'week' | 'month' | 'year';
  scopeIds: Array<'all' | string>;
};

const defaultState: EditState = {
  name: '',
  currencyCode: 'TWD',
  amount: '',
  period: 'month',
  scopeIds: ['all'],
};

const periodLabel: Record<EditState['period'], string> = {
  week: '每週',
  month: '每月',
  year: '每年',
};

const BudgetManager: React.FC<BudgetManagerProps> = ({ budgets, scopes, onChange }) => {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [pickerModal, setPickerModal] = useState<'currency' | 'scope' | 'period' | null>(null);

  const scopeLabel = useMemo(() => {
    const map: Record<string, string> = { all: '全部用途' };
    scopes.forEach((s) => {
      map[s.id] = s.name;
    });
    return map;
  }, [scopes]);

  const openAdd = () => setEditing(defaultState);

  const openEdit = (item: BudgetItem) => {
    const normalizedScopeIds = item.scopeIds?.length ? item.scopeIds : ['all'];
    const expandedScopeIds = normalizedScopeIds.includes('all')
      ? Array.from(new Set(['all', ...scopes.map((s) => s.id)]))
      : normalizedScopeIds;
    setEditing({
      id: item.id,
      name: item.name,
      currencyCode: item.currencyCode,
      amount: String(item.amount),
      period: item.period || 'month',
      scopeIds: expandedScopeIds,
    });
  };

  const closeModal = () => {
    setEditing(null);
    setPickerModal(null);
  };

  const toggleScope = (scopeId: 'all' | string) => {
    if (!editing) return;

    const selectableScopeIds = scopes.map((s) => s.id);
    const currentSet = new Set(editing.scopeIds.filter((id) => id !== 'all'));
    const currentlyAllSelected =
      editing.scopeIds.includes('all') ||
      (selectableScopeIds.length > 0 && selectableScopeIds.every((id) => currentSet.has(id)));

    if (scopeId === 'all') {
      if (currentlyAllSelected) {
        setEditing({ ...editing, scopeIds: [] });
      } else {
        setEditing({ ...editing, scopeIds: ['all', ...selectableScopeIds] });
      }
      return;
    }

    if (currentlyAllSelected && currentSet.size === 0) {
      selectableScopeIds.forEach((id) => currentSet.add(id));
    }

    if (currentSet.has(scopeId)) {
      currentSet.delete(scopeId);
    } else {
      currentSet.add(scopeId);
    }

    const nextAllSelected =
      selectableScopeIds.length > 0 && selectableScopeIds.every((id) => currentSet.has(id));

    setEditing({
      ...editing,
      scopeIds: nextAllSelected ? ['all', ...selectableScopeIds] : Array.from(currentSet),
    });
  };

  const save = () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    const amountNum = Number(editing.amount || '0');
    const normalized: BudgetItem = {
      id: editing.id || `budget_${Date.now().toString(36)}`,
      name,
      currencyCode: editing.currencyCode,
      amount: Number.isFinite(amountNum) ? Math.max(0, amountNum) : 0,
      period: editing.period,
      scopeIds: Array.from(new Set(editing.scopeIds.filter((id) => id === 'all' || scopes.some((s) => s.id === id)))),
    };

    if (editing.id) {
      onChange(budgets.map((b) => (b.id === editing.id ? normalized : b)));
    } else {
      onChange([...budgets, normalized]);
    }
    closeModal();
  };

  const handleDelete = (id: string) => {
    if (deleteConfirmId === id) {
      onChange(budgets.filter((b) => b.id !== id));
      setDeleteConfirmId(null);
      return;
    }
    setDeleteConfirmId(id);
    window.setTimeout(() => {
      setDeleteConfirmId((prev) => (prev === id ? null : prev));
    }, 3000);
  };

  const renderScopeSummary = (scopeIds: Array<'all' | string>) => {
    if (!scopeIds.length) return '未選擇用途';
    const selectedSet = new Set(scopeIds.filter((id) => id !== 'all'));
    const allSelected =
      scopeIds.includes('all') ||
      (scopes.length > 0 && scopes.every((s) => selectedSet.has(s.id)));
    if (allSelected) return '全部用途';
    return scopeIds.filter((id) => id !== 'all').map((id) => scopeLabel[id] || id).join('、');
  };

  return (
    <div className="custom-card p-6 md:p-8 rounded-[2.5rem] mb-12 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-extrabold text-[#1A1A1A] text-base flex items-center gap-2">
          <span className="w-1.5 h-6 bg-[#D08C70] rounded-full"></span>
          預算管理
        </h3>
        <button onClick={openAdd} className="px-4 h-10 rounded-xl bg-[#1A1A1A] text-white text-xs font-black flex items-center gap-1.5">
          <Plus size={14} /> 新增預算
        </button>
      </div>

      <div className="space-y-3">
        {budgets.length === 0 && (
          <div className="p-6 text-center text-[#B7ADA4] text-xs font-bold bg-[#FAF7F2] rounded-2xl border border-dashed border-[#E6DED6]">
            目前沒有任何預算項目
          </div>
        )}
        {budgets.map((item) => {
          const currency = SUPPORTED_CURRENCIES.find((c) => c.code === item.currencyCode);
          const isConfirming = deleteConfirmId === item.id;
          return (
            <div key={item.id} className="custom-card p-5 rounded-2xl flex items-center justify-between bg-white border border-[#E6DED6]">
              <div className="min-w-0">
                <p className="text-sm font-black text-[#1A1A1A] truncate">{item.name}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#FAF7F2] text-[#6B6661]">{currency?.name || item.currencyCode}</span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#FAF7F2] text-[#6B6661]">{periodLabel[item.period || 'month']}</span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#FAF7F2] text-[#6B6661]">{renderScopeSummary(item.scopeIds || ['all'])}</span>
                </div>
                <p className="text-lg font-black text-[#1A1A1A] mt-1">{currency?.symbol || '$'}{item.amount.toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(item)} className="p-2.5 rounded-xl text-[#B7ADA4] hover:text-[#1A1A1A] hover:bg-[#FAF7F2]">
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className={`flex items-center justify-center transition-all rounded-xl ${
                    isConfirming ? 'bg-red-500 text-white px-3 py-2 shadow-md scale-105' : 'text-[#B7ADA4] hover:text-red-500 hover:bg-red-50 p-2.5'
                  }`}
                >
                  {isConfirming ? <span className="text-[10px] font-black whitespace-nowrap">確認刪除</span> : <Trash2 size={16} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-lg rounded-3xl border border-[#E6DED6] bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#E6DED6] px-5 py-4">
              <h4 className="text-sm font-black text-[#1A1A1A]">{editing.id ? '編輯預算' : '新增預算'}</h4>
              <button onClick={closeModal} className="text-[#B7ADA4] hover:text-[#1A1A1A]"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-[11px] font-black text-[#6B6661] mb-1">名稱</p>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl border border-[#E6DED6] outline-none font-bold text-sm"
                  placeholder="例如：個人生活預算"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-black text-[#6B6661] mb-1">幣別</p>
                  <button
                    type="button"
                    onClick={() => setPickerModal('currency')}
                    className="h-11 w-full rounded-xl border border-[#E6DED6] bg-white px-3 text-left text-xs font-bold outline-none flex items-center justify-between"
                  >
                    <span>{SUPPORTED_CURRENCIES.find((c) => c.code === editing.currencyCode)?.name || editing.currencyCode}</span>
                    <ChevronDown size={14} className="text-[#B7ADA4]" />
                  </button>
                </div>
                <div>
                  <p className="text-[11px] font-black text-[#6B6661] mb-1">金額</p>
                  <CurrencyInput
                    inputMode="numeric"
                    value={editing.amount}
                    groupSeparator="," 
                    allowNegativeValue={false}
                    decimalsLimit={0}
                    transformRawValue={normalizeImeNumericRaw}
                    onValueChange={(value) => setEditing({ ...editing, amount: value || '' })}
                    className="w-full h-11 px-4 rounded-xl border border-[#E6DED6] outline-none font-black text-sm"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-black text-[#6B6661] mb-1">預算週期</p>
                  <button
                    type="button"
                    onClick={() => setPickerModal('period')}
                    className="h-11 w-full rounded-xl border border-[#E6DED6] bg-white px-3 text-left text-xs font-bold outline-none flex items-center justify-between"
                  >
                    <span>{periodLabel[editing.period]}</span>
                    <ChevronDown size={14} className="text-[#B7ADA4]" />
                  </button>
                </div>
                <div>
                  <p className="text-[11px] font-black text-[#6B6661] mb-1">計入用途</p>
                  <button
                    type="button"
                    onClick={() => setPickerModal('scope')}
                    className="h-11 w-full rounded-xl border border-[#E6DED6] bg-white px-3 text-left text-xs font-bold outline-none flex items-center justify-between"
                  >
                    <span className="truncate">{renderScopeSummary(editing.scopeIds)}</span>
                    <ChevronDown size={14} className="text-[#B7ADA4]" />
                  </button>
                </div>
              </div>

              <button onClick={save} className="w-full h-11 bg-[#D08C70] text-white rounded-xl font-black">儲存</button>
            </div>

            {pickerModal && (
              <div className="fixed inset-0 z-[98] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/40" onClick={() => setPickerModal(null)} />
                <div className="relative z-10 w-full max-w-md rounded-3xl border border-[#E6DED6] bg-white shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between border-b border-[#E6DED6] px-5 py-4">
                    <h4 className="text-sm font-black text-[#1A1A1A]">
                      {pickerModal === 'currency' ? '選擇幣別' : pickerModal === 'period' ? '選擇預算週期' : '選擇計入用途'}
                    </h4>
                    <button onClick={() => setPickerModal(null)} className="text-[#B7ADA4] hover:text-[#1A1A1A]"><X size={18} /></button>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
                    {pickerModal === 'currency' && SUPPORTED_CURRENCIES.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => { setEditing({ ...editing, currencyCode: c.code }); setPickerModal(null); }}
                        className={`w-full text-left px-3 py-3 rounded-xl text-xs font-bold ${editing.currencyCode === c.code ? 'bg-[#F7EEE8] text-[#D08C70] border border-[#D08C70]/40' : 'hover:bg-[#FAF7F2] text-[#1A1A1A]'}`}
                      >
                        {c.name}
                      </button>
                    ))}
                    {pickerModal === 'period' && (['week', 'month', 'year'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { setEditing({ ...editing, period: p }); setPickerModal(null); }}
                        className={`w-full text-left px-3 py-3 rounded-xl text-xs font-bold ${editing.period === p ? 'bg-[#F7EEE8] text-[#D08C70] border border-[#D08C70]/40' : 'hover:bg-[#FAF7F2] text-[#1A1A1A]'}`}
                      >
                        {periodLabel[p]}
                      </button>
                    ))}
                    {pickerModal === 'scope' && (
                      <>
                        {(() => {
                          const allSelected =
                            editing.scopeIds.includes('all') ||
                            (scopes.length > 0 && scopes.every((s) => editing.scopeIds.includes(s.id)));
                          return (
                            <button
                              type="button"
                              onClick={() => toggleScope('all')}
                              className={`w-full text-left px-3 py-3 rounded-xl text-xs font-bold flex items-center justify-between ${allSelected ? 'bg-[#F7EEE8] text-[#D08C70] border border-[#D08C70]/40' : 'hover:bg-[#FAF7F2] text-[#1A1A1A]'}`}
                            >
                              <span>全部用途</span>
                              {allSelected && <Check size={14} />}
                            </button>
                          );
                        })()}
                        {scopes.map((scope) => {
                          const allSelected = editing.scopeIds.includes('all') || (scopes.length > 0 && scopes.every((s) => editing.scopeIds.includes(s.id)));
                          const selected = allSelected || editing.scopeIds.includes(scope.id);
                          return (
                            <button
                              key={scope.id}
                              type="button"
                              onClick={() => toggleScope(scope.id)}
                              className={`w-full text-left px-3 py-3 rounded-xl text-xs font-bold flex items-center justify-between ${selected ? 'bg-[#F7EEE8] text-[#D08C70] border border-[#D08C70]/40' : 'hover:bg-[#FAF7F2] text-[#1A1A1A]'}`}
                            >
                              <span>{scope.name}</span>
                              {selected && <Check size={14} />}
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetManager;


