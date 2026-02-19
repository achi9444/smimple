import React, { useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import type { Account, Category, SavingBucket, SpendingScope, Transaction } from '../types';
import { SUPPORTED_CURRENCIES } from '../types';

interface TransactionListProps {
  transactions: Transaction[];
  onDelete: (tx: Transaction) => void;
  onUpdate: (tx: Transaction) => void;
  categories: Category[];
  scopes: SpendingScope[];
  accounts: Account[];
  savingBuckets?: SavingBucket[];
}

type PickerType = 'category' | 'scope' | 'account' | 'toAccount' | null;

const toDateKey = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
};

const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  onDelete,
  onUpdate,
  categories,
  scopes,
  accounts,
  savingBuckets = [],
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Transaction>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [pickerType, setPickerType] = useState<PickerType>(null);

  const renderIcon = (iconName: string, color: string, size = 20) => {
    const IconComponent = (LucideIcons as any)[iconName] || LucideIcons.Layers;
    return <IconComponent size={size} strokeWidth={2} style={{ color }} />;
  };

  const groupedByDay = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    transactions.forEach((tx) => {
      const key = toDateKey(tx.date);
      if (!map[key]) map[key] = [];
      map[key].push(tx);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [transactions]);

  const startEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setEditForm({ ...tx, scopeId: tx.scopeId || scopes?.[0]?.id || 'scope_personal' });
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditForm({});
    setPickerType(null);
  };

  const handleDeleteClick = (e: React.MouseEvent, tx: Transaction) => {
    e.stopPropagation();
    if (deleteConfirmId === tx.id) {
      onDelete(tx);
      if (editingId === tx.id) closeEdit();
      setDeleteConfirmId(null);
      return;
    }
    setDeleteConfirmId(tx.id);
    setTimeout(() => setDeleteConfirmId((prev) => (prev === tx.id ? null : prev)), 3000);
  };

  const getPickerOptions = () => {
    if (!pickerType) return [] as Array<{ value: string; label: string; color?: string; icon?: string }>; 
    if (pickerType === 'category') {
      return categories
        .filter((c) => !c.type || c.type === editForm.type)
        .map((c) => ({ value: c.name, label: c.name, color: c.color, icon: c.icon }));
    }
    if (pickerType === 'scope') {
      return scopes.map((s) => ({ value: s.id, label: s.name, color: s.color }));
    }
    return accounts.map((a) => ({ value: a.id, label: a.name, color: a.color, icon: a.icon }));
  };

  const setPickerValue = (value: string) => {
    if (pickerType === 'category') setEditForm((prev) => ({ ...prev, category: value }));
    if (pickerType === 'scope') setEditForm((prev) => ({ ...prev, scopeId: value }));
    if (pickerType === 'account') {
      const newAcc = accounts.find((a) => a.id === value);
      setEditForm((prev) => ({ ...prev, accountId: value, currencyCode: newAcc?.currencyCode || prev.currencyCode }));
    }
    if (pickerType === 'toAccount') setEditForm((prev) => ({ ...prev, toAccountId: value }));
    setPickerType(null);
  };

  const currentCategory = categories.find((c) => c.name === editForm.category) || categories[categories.length - 1];
  const currentScope = scopes.find((s) => s.id === (editForm.scopeId || 'scope_personal')) || scopes?.[0];
  const currentScopeName = currentScope?.name || '個人';
  const currentAccount = accounts.find((a) => a.id === editForm.accountId);
  const currentAccountName = currentAccount?.name || '選擇帳戶';
  const currentToAccountName = accounts.find((a) => a.id === editForm.toAccountId)?.name || '選擇目標帳戶';
  const renderAccountIcon = (iconName?: string, iconColor?: string) => {
    const Icon = (LucideIcons as any)[iconName || 'Wallet'] || LucideIcons.Wallet;
    return <Icon size={12} strokeWidth={2} style={{ color: iconColor || '#B7ADA4' }} />;
  };
  const renderPickerLeadIcon = (opt: { color?: string; icon?: string }) => {
    if (pickerType === 'account' || pickerType === 'toAccount') {
      return renderAccountIcon(opt.icon, opt.color);
    }
    if (pickerType === 'category') {
      const Icon = (LucideIcons as any)[opt.icon || 'Layers'] || LucideIcons.Layers;
      return <Icon size={13} strokeWidth={2} style={{ color: opt.color || '#B7ADA4' }} />;
    }
    return null;
  };

  return (
    <div className="custom-card rounded-[2rem] overflow-hidden mb-12">
      <div className="p-6 border-b border-[#E6DED6]">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-extrabold text-[#1A1A1A]">交易列表</h3>
          <span className="text-[10px] font-black text-[#B7ADA4] uppercase tracking-widest">{transactions.length} 筆資料</span>
        </div>
      </div>

      <div>
        {groupedByDay.length === 0 ? (
          <div className="p-16 text-center text-[#B7ADA4] font-bold italic text-sm">目前沒有交易資料</div>
        ) : (
          groupedByDay.map(([day, rows]) => {
            const collapsed = !!collapsedDays[day];
            return (
              <div key={day} className="border-b border-[#E6DED6] last:border-b-0">
                <button
                  type="button"
                  onClick={() => setCollapsedDays((prev) => ({ ...prev, [day]: !prev[day] }))}
                  className="w-full px-5 py-3 flex items-center justify-between bg-[#FAF7F2]"
                >
                  <span className="text-xs font-black text-[#1A1A1A]">{day.replace(/-/g, '/')}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[#B7ADA4]">{rows.length} 筆</span>
                    <LucideIcons.ChevronDown size={14} className={`text-[#B7ADA4] transition-transform ${collapsed ? '' : 'rotate-180'}`} />
                  </div>
                </button>

                {!collapsed && rows.map((tx) => {
                  const cat = categories.find((c) => c.name === tx.category) || categories[categories.length - 1] || { name: tx.category || '未分類', color: '#B7ADA4', icon: 'Layers' }; 
                  const scope = scopes.find((s) => s.id === (tx.scopeId || 'scope_personal'));
                  const acc = accounts.find((a) => a.id === tx.accountId);
                  const toAcc = tx.type === 'transfer' ? accounts.find((a) => a.id === tx.toAccountId) : null;
                  const bucket = tx.bucketId ? savingBuckets.find((b) => b.id === tx.bucketId) : null;
                  const cur = SUPPORTED_CURRENCIES.find((c) => c.code === tx.currencyCode) || SUPPORTED_CURRENCIES[0];
                  const isConfirming = deleteConfirmId === tx.id;

                  return (
                    <div key={tx.id} className="group relative flex items-stretch hover:bg-[#FAF7F2] transition-colors">
                      <div className="flex-1 p-5 flex items-center gap-4 cursor-pointer min-w-0" onClick={() => startEdit(tx)}>
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ backgroundColor: `${cat.color}15` }}>
                          {tx.type === 'transfer' ? <LucideIcons.ArrowLeftRight size={18} strokeWidth={2} style={{ color: cat.color }} /> : renderIcon(cat.icon, cat.color, 18)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-extrabold text-[#1A1A1A] truncate text-sm">{tx.type === 'transfer' ? (tx.description || '帳戶轉帳') : tx.description}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-[9px] font-bold px-1.5 rounded border" style={{ color: cat.color, backgroundColor: `${cat.color}1A`, borderColor: `${cat.color}55` }}>{tx.category}</span>
                                {scope && <span className="text-[9px] font-bold px-1.5 rounded border" style={{ color: scope.color, backgroundColor: `${scope.color}1A`, borderColor: `${scope.color}55` }}>{scope.name}</span>}
                                {bucket && <span className="text-[9px] font-bold text-[#5B84B1] bg-[#EAF1FA] px-1.5 rounded">{bucket.name}</span>}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <p className={`font-black text-sm tracking-tight shrink-0 ml-2 ${tx.type === 'expense' ? 'text-[#D66D5B]' : tx.type === 'income' ? 'text-[#729B79]' : 'text-[#5B84B1]'}`}>
                                {tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''}
                                {cur.symbol}
                                {tx.amount.toLocaleString()}
                              </p>
                              <span className="text-[10px] font-bold text-[#B7ADA4] bg-[#FAF7F2] px-1.5 py-0.5 rounded border border-[#E6DED6] flex items-center gap-1">
                                {tx.type === 'transfer' ? `${acc?.name || '未知'} -> ${toAcc?.name || '未知'}` : acc?.name}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center pr-4 pl-2">
                        <button type="button" onClick={(e) => handleDeleteClick(e, tx)} className={`flex items-center justify-center transition-all rounded-lg ${isConfirming ? 'bg-red-500 text-white px-3 py-1.5 shadow-md scale-105' : 'text-[#E6DED6] hover:bg-red-50 hover:text-red-500 p-2'}`} title={isConfirming ? '確認刪除?' : '刪除'}>
                          {isConfirming ? <span className="text-[10px] font-black whitespace-nowrap">確認刪除</span> : <LucideIcons.Trash2 size={16} className="text-[#B7ADA4]" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {editingId && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeEdit} />
          <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-[#E6DED6] bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E6DED6] px-5 py-4 sticky top-0 bg-white z-10">
              <h4 className="text-sm font-black text-[#1A1A1A]">編輯交易</h4>
              <button onClick={closeEdit} className="text-[#B7ADA4] hover:text-[#1A1A1A]"><LucideIcons.X size={18} /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <p className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">基本欄位</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPickerType('category')}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black"
                    style={{
                      color: currentCategory?.color || '#B7ADA4',
                      backgroundColor: `${currentCategory?.color || '#B7ADA4'}14`,
                      borderColor: `${currentCategory?.color || '#B7ADA4'}55`,
                    }}
                  >
                    {currentCategory ? renderIcon(currentCategory.icon, currentCategory.color, 12) : <LucideIcons.Layers size={12} />}
                    <span>{editForm.category || '未設定分類'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPickerType('scope')}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black"
                    style={{
                      color: currentScope?.color || '#B7ADA4',
                      backgroundColor: `${currentScope?.color || '#B7ADA4'}14`,
                      borderColor: `${currentScope?.color || '#B7ADA4'}55`,
                    }}
                  >
                    <span>{currentScopeName}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPickerType('account')}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-black"
                    style={{
                      color: currentAccount?.color || '#6B6661',
                      backgroundColor: `${currentAccount?.color || '#B7ADA4'}14`,
                      borderColor: `${currentAccount?.color || '#B7ADA4'}55`,
                    }}
                  >
                    {renderAccountIcon(currentAccount?.icon, currentAccount?.color)}
                    <span>{currentAccountName}</span>
                  </button>
                </div>
              </div>

              {editForm.type === 'transfer' && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">目標帳戶</p>
                  <button type="button" onClick={() => setPickerType('toAccount')} className="w-full h-11 rounded-xl border border-[#E6DED6] px-3 text-left text-xs font-bold bg-[#FAF7F2]">{currentToAccountName}</button>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">描述</p>
                <input type="text" value={editForm.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="h-11 w-full rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none" placeholder="輸入描述" />
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">金額(元)</p>
                <input type="number" value={editForm.amount !== undefined ? editForm.amount : ''} onChange={(e) => { const v = e.target.value; setEditForm({ ...editForm, amount: v === '' ? undefined : parseFloat(v) }); }} className="h-11 w-full rounded-xl border border-[#E6DED6] px-3 text-xs font-black outline-none text-right" placeholder="金額" />
              </div>

              <input type="date" value={editForm.date ? new Date(editForm.date).toISOString().split('T')[0] : ''} onChange={(e) => setEditForm({ ...editForm, date: new Date(e.target.value).toISOString() })} className="h-11 w-full rounded-xl border border-[#E6DED6] px-3 text-xs font-bold outline-none" />

              <div className="flex gap-2 pt-1">
                <button onClick={closeEdit} className="flex-1 h-11 rounded-xl border border-[#E6DED6] text-xs font-black">取消</button>
                <button onClick={() => { onUpdate(editForm as Transaction); closeEdit(); }} className="flex-[2] h-11 rounded-xl bg-[#1A1A1A] text-white text-xs font-black">儲存變更</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pickerType && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPickerType(null)} />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-[#E6DED6] bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#E6DED6] px-5 py-4">
              <h4 className="text-sm font-black text-[#1A1A1A]">選擇項目</h4>
              <button onClick={() => setPickerType(null)} className="text-[#B7ADA4] hover:text-[#1A1A1A]"><LucideIcons.X size={18} /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
              {getPickerOptions().map((opt) => {
                const active =
                  (pickerType === 'category' && editForm.category === opt.value) ||
                  (pickerType === 'scope' && editForm.scopeId === opt.value) ||
                  (pickerType === 'account' && editForm.accountId === opt.value) ||
                  (pickerType === 'toAccount' && editForm.toAccountId === opt.value);

                return (
                  <button
                    key={opt.value}
                    onClick={() => setPickerValue(opt.value)}
                    className={`w-full text-left px-3.5 py-3.5 rounded-xl flex items-center justify-between gap-3 text-xs font-bold border ${active ? 'bg-[#F7EEE8] text-[#D08C70] border-[#D08C70]/40' : 'bg-white border-[#E6DED6] hover:bg-[#FAF7F2] text-[#1A1A1A]'}`}
                  >
                    <span className="flex items-center gap-2.5">
                      {renderPickerLeadIcon(opt)}
                      <span>{opt.label}</span>
                    </span>
                    {(pickerType === 'account' || pickerType === 'toAccount') && (
                      <span className="text-[10px] text-[#B7ADA4]">${(accounts.find((a) => a.id === opt.value)?.balance ?? 0).toLocaleString()}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionList;




