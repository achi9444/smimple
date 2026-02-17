import React, { useState } from 'react';
import * as LucideIcons from 'lucide-react';
import type { Account, Category, SavingBucket, Transaction } from '../types';
import { SUPPORTED_CURRENCIES } from '../types';

interface TransactionListProps {
  transactions: Transaction[];
  onDelete: (tx: Transaction) => void;
  onUpdate: (tx: Transaction) => void;
  categories: Category[];
  accounts: Account[];
  savingBuckets?: SavingBucket[];
}

const TransactionList: React.FC<TransactionListProps> = ({ transactions, onDelete, onUpdate, categories, accounts, savingBuckets = [] }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Transaction>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const renderIcon = (iconName: string, color: string, size = 20) => {
    const IconComponent = (LucideIcons as any)[iconName] || LucideIcons.Layers;
    return <IconComponent size={size} strokeWidth={2} style={{ color }} />;
  };

  const startEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setEditForm({ ...tx });
  };

  const handleDeleteClick = (e: React.MouseEvent, tx: Transaction) => {
    e.stopPropagation();
    if (deleteConfirmId === tx.id) {
      onDelete(tx);
      setEditingId(null);
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(tx.id);
      setTimeout(() => setDeleteConfirmId((prev) => (prev === tx.id ? null : prev)), 3000);
    }
  };

  return (
    <div className="custom-card rounded-[2rem] overflow-hidden mb-12">
      <div className="p-6 border-b border-[#E6DED6]">
        <div className="flex justify-between items-center">
          <h3 className="text-base font-extrabold text-[#1A1A1A]">交易列表</h3>
          <span className="text-[10px] font-black text-[#B7ADA4] uppercase tracking-widest">{transactions.length} 筆資料</span>
        </div>
      </div>

      <div className="divide-y divide-[#E6DED6]">
        {transactions.length === 0 ? (
          <div className="p-16 text-center text-[#B7ADA4] font-bold italic text-sm">目前沒有交易資料</div>
        ) : (
          transactions.map((tx) => {
            const isEditing = editingId === tx.id;
            const cat = categories.find((c) => c.name === tx.category) || categories[categories.length - 1];
            const acc = accounts.find((a) => a.id === tx.accountId);
            const toAcc = tx.type === 'transfer' ? accounts.find((a) => a.id === tx.toAccountId) : null;
            const bucket = tx.bucketId ? savingBuckets.find((b) => b.id === tx.bucketId) : null;
            const cur = SUPPORTED_CURRENCIES.find((c) => c.code === tx.currencyCode) || SUPPORTED_CURRENCIES[0];
            const isConfirming = deleteConfirmId === tx.id;

            if (isEditing) {
              const availableCats = categories.filter((c) => !c.type || c.type === editForm.type);

              return (
                <div key={tx.id} className="p-5 bg-[#D08C70]/5 animate-in fade-in duration-300 relative">
                  <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#D08C70]/10">
                    <span className="text-[10px] font-black text-[#D08C70] uppercase tracking-widest">編輯交易</span>
                    <button onClick={() => setEditingId(null)} className="text-[#B7ADA4] hover:text-[#1A1A1A]">
                      <LucideIcons.X size={16} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-[#B7ADA4] uppercase">分類</label>
                      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {availableCats.map((c) => (
                          <button key={c.id} onClick={() => setEditForm({ ...editForm, category: c.name })} className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all ${editForm.category === c.name ? 'border-[#D08C70] bg-[#D08C70] text-white shadow-sm' : 'border-[#E6DED6] bg-white text-[#6B6661]'}`}>
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center ${editForm.category === c.name ? 'bg-white/20' : 'bg-[#FAF7F2]'}`}>
                              {renderIcon(c.icon, editForm.category === c.name ? '#fff' : c.color, 10)}
                            </div>
                            <span className="text-[9px] font-black whitespace-nowrap">{c.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-[#B7ADA4] uppercase">
                        {editForm.type === 'transfer' ? '來源帳戶 -> 目標帳戶' : editForm.type === 'income' ? '收入帳戶' : '支出帳戶'}
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={editForm.accountId}
                          onChange={(e) => {
                            const newAccId = e.target.value;
                            const newAcc = accounts.find((a) => a.id === newAccId);
                            setEditForm({ ...editForm, accountId: newAccId, currencyCode: newAcc?.currencyCode || editForm.currencyCode });
                          }}
                          className="flex-1 px-3 py-2 rounded-xl border border-[#D08C70]/30 font-bold text-xs bg-white focus:border-[#D08C70] outline-none"
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        {editForm.type === 'transfer' && (
                          <select value={editForm.toAccountId} onChange={(e) => setEditForm({ ...editForm, toAccountId: e.target.value })} className="flex-1 px-3 py-2 rounded-xl border border-[#D08C70]/30 font-bold text-xs bg-white focus:border-[#D08C70] outline-none">
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] font-black text-[#B7ADA4] uppercase">描述</label>
                        <input type="text" value={editForm.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-[#D08C70]/30 font-bold text-xs bg-white focus:border-[#D08C70] outline-none" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-[#B7ADA4] uppercase">金額</label>
                        <input type="number" value={editForm.amount !== undefined ? editForm.amount : ''} onChange={(e) => { const val = e.target.value; setEditForm({ ...editForm, amount: val === '' ? undefined : parseFloat(val) }); }} className="w-full px-3 py-2 rounded-xl border border-[#D08C70]/30 font-black text-xs bg-white focus:border-[#D08C70] outline-none text-right" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-[#B7ADA4] uppercase">日期</label>
                      <input type="date" value={editForm.date ? new Date(editForm.date).toISOString().split('T')[0] : ''} onChange={(e) => setEditForm({ ...editForm, date: new Date(e.target.value).toISOString() })} className="w-full px-3 py-2 rounded-xl border border-[#D08C70]/30 font-bold text-xs bg-white focus:border-[#D08C70] outline-none" />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setEditingId(null)} className="flex-1 py-2.5 bg-white border border-[#E6DED6] rounded-xl text-[10px] font-black uppercase hover:bg-[#FAF7F2]">取消</button>
                      <button onClick={() => { onUpdate(editForm as Transaction); setEditingId(null); }} className="flex-[2] py-2.5 bg-[#1A1A1A] text-white rounded-xl text-[10px] font-black uppercase shadow-md hover:bg-[#333]">儲存變更</button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={tx.id} className="group relative flex items-stretch hover:bg-[#FAF7F2] transition-colors">
                <div className="flex-1 p-5 flex items-center gap-4 cursor-pointer min-w-0" onClick={() => startEdit(tx)}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ backgroundColor: `${cat.color}15` }}>
                    {tx.type === 'transfer' ? <LucideIcons.ArrowLeftRight size={18} strokeWidth={2} style={{ color: cat.color }} /> : renderIcon(cat.icon, cat.color, 18)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-extrabold text-[#1A1A1A] truncate text-sm">{tx.type === 'transfer' ? `${acc?.name} -> ${toAcc?.name}` : tx.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[9px] font-bold text-[#B7ADA4] uppercase tracking-tighter">{new Date(tx.date).toLocaleDateString()}</p>
                          <span className="text-[9px] font-bold text-[#D08C70] bg-[#D08C70]/10 px-1.5 rounded">{tx.category}</span>
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
                          {tx.type === 'transfer' ? (
                            <>
                              {acc?.name} <LucideIcons.ArrowRight size={8} strokeWidth={3} /> {toAcc?.name}
                            </>
                          ) : (
                            acc?.name
                          )}
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
          })
        )}
      </div>
    </div>
  );
};

export default TransactionList;
