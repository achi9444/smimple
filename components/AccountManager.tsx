import React, { useEffect, useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import CurrencyInput from 'react-currency-input-field';
import { normalizeImeNumericRaw } from '../utils/numberInput';
import type { Account, Category, SpendingScope, Transaction } from '../types';
import { SUPPORTED_CURRENCIES } from '../types';

interface AccountManagerProps {
  accounts: Account[];
  reservedByAccount: Record<string, number>;
  availableByAccount: Record<string, number>;
  transactions?: Transaction[];
  categories?: Category[];
  scopes?: SpendingScope[];
  onUpdate: React.Dispatch<React.SetStateAction<Account[]>>;
  onDelete: (id: string) => void;
}

const AccountManager: React.FC<AccountManagerProps> = ({
  accounts,
  reservedByAccount,
  availableByAccount,
  onUpdate,
  onDelete,
}) => {
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [isSortMode, setIsSortMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [sortDraft, setSortDraft] = useState<Account[] | null>(null);

  const [activeCurrencyTab, setActiveCurrencyTab] = useState<string>('TWD');

  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [currency, setCurrency] = useState('TWD');
  const [icon, setIcon] = useState('Briefcase');
  const [color, setColor] = useState('#D08C70');
  const [pickerModal, setPickerModal] = useState<null | 'currency'>(null);

  const colors = ['#D08C70', '#8FB996', '#5B84B1', '#C97B63', '#9C6644', '#E07A5F', '#B7ADA4'];
  const icons = ['Briefcase', 'Wallet', 'CreditCard', 'PiggyBank', 'Landmark', 'CircleDollarSign', 'Coins', 'Building2', 'Banknote', 'BadgeDollarSign', 'CircleEllipsis', 'Vault', 'Smartphone', 'IdCard', 'Receipt', 'Ticket', 'Gem', 'Bitcoin', 'Car', 'Home'];

  const financialOverview = useMemo(() => {
    const stats: Record<string, { assets: number; liabilities: number; net: number }> = {};
    const availableCurrencies: string[] = Array.from(new Set(accounts.map((a) => a.currencyCode)));

    if (availableCurrencies.length === 0) availableCurrencies.push('TWD');

    availableCurrencies.forEach((code) => {
      const accs = accounts.filter((a) => a.currencyCode === code);
      const assets = accs.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
      const liabilities = accs.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0);
      stats[code] = { assets, liabilities, net: assets + liabilities };
    });

    return { stats, availableCurrencies };
  }, [accounts]);

  useEffect(() => {
    if (!financialOverview.availableCurrencies.includes(activeCurrencyTab)) {
      setActiveCurrencyTab(financialOverview.availableCurrencies[0] || 'TWD');
    }
  }, [financialOverview.availableCurrencies, activeCurrencyTab]);

  useEffect(() => {
    if (!isSortMode) {
      setSortDraft(null);
      setDraggingId(null);
    }
  }, [isSortMode]);

  const currentStats = financialOverview.stats[activeCurrencyTab] || { assets: 0, liabilities: 0, net: 0 };
  const currentSymbol = SUPPORTED_CURRENCIES.find((c) => c.code === activeCurrencyTab)?.symbol || '$';

  const orderedAccounts = useMemo(() => (isSortMode && sortDraft ? sortDraft : accounts), [isSortMode, sortDraft, accounts]);

  const renderIcon = (iconName: string, iconColor: string, size = 24) => {
    const IconComponent = (LucideIcons as any)[iconName] || LucideIcons.Briefcase;
    return <IconComponent size={size} strokeWidth={2} style={{ color: iconColor }} />;
  };

  const openAdd = () => {
    setName('');
    setBalance('');
    setCurrency('TWD');
    setIcon('Briefcase');
    setColor(colors[0]);
    setFormMode('add');
    setEditingId(null);
  };

  const openEdit = (acc: Account) => {
    setName(acc.name);
    setBalance(acc.balance.toString());
    setCurrency(acc.currencyCode);
    setIcon(acc.icon);
    setColor(acc.color);
    setFormMode('edit');
    setEditingId(acc.id);
  };

  const handleSave = () => {
    if (!name.trim()) return;

    if (formMode === 'add') {
      const newAcc: Account = {
        id: `acc_${Math.random().toString(36).slice(2, 7)}`,
        name: name.trim(),
        balance: parseFloat(balance) || 0,
        currencyCode: currency,
        color,
        icon,
      };
      onUpdate((prev) => [...prev, newAcc]);
    } else if (formMode === 'edit' && editingId) {
      onUpdate((prev) =>
        prev.map((a) =>
          a.id === editingId
            ? {
                ...a,
                name: name.trim(),
                balance: parseFloat(balance) || 0,
                currencyCode: currency,
                color,
                icon,
              }
            : a
        )
      );
    }

    setFormMode(null);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (deleteConfirmId === id) {
      onDelete(id);
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId((prev) => (prev === id ? null : prev)), 3000);
    }
  };

  const moveAccount = (fromId: string, toId: string) => {
    if (fromId === toId) return;

    const applyMove = (list: Account[]) => {
      const next = [...list];
      const fromIndex = next.findIndex((a) => a.id === fromId);
      const toIndex = next.findIndex((a) => a.id === toId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return list;
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    };

    if (isSortMode) {
      setSortDraft((prev) => (prev ? applyMove(prev) : prev));
      return;
    }

    onUpdate((prev) => applyMove(prev));
  };

  const beginSortMode = () => {
    setSortDraft(accounts.map((a) => ({ ...a })));
    setIsSortMode(true);
  };

  const saveSortMode = () => {
    if (sortDraft) {
      const order = new Map<string, number>(sortDraft.map((acc, idx) => [acc.id, idx]));
      onUpdate((prev) => [...prev].sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999)));
    }
    setIsSortMode(false);
    setSortDraft(null);
    setDraggingId(null);
  };

  const autoScrollWhenDragging = (event: React.DragEvent) => {
    const viewportHeight = window.innerHeight || 1;
    const topThreshold = viewportHeight * 0.28;
    const bottomThreshold = viewportHeight * 0.72;

    if (event.clientY < topThreshold) {
      const ratio = (topThreshold - event.clientY) / Math.max(topThreshold, 1);
      window.scrollBy({ top: -(6 + ratio * 28), behavior: 'auto' });
      return;
    }

    if (event.clientY > bottomThreshold) {
      const ratio = (event.clientY - bottomThreshold) / Math.max(viewportHeight - bottomThreshold, 1);
      window.scrollBy({ top: 6 + ratio * 28, behavior: 'auto' });
    }
  };
  return (
    <div className="space-y-8 pb-12">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-3xl font-black text-[#1A1A1A] tracking-tighter">帳戶管理</h2>
        <div className="flex items-center gap-2">
          {!isSortMode && (
            <button onClick={beginSortMode} className="px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg tap-active bg-[#FAF7F2] text-[#6B6661] border border-[#E6DED6]">
              編輯排序
            </button>
          )}
          <button onClick={openAdd} className="px-6 py-2.5 bg-[#1A1A1A] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg tap-active">
            + 新增
          </button>
        </div>
      </div>

      <div className="custom-card p-8 rounded-[2.5rem] bg-white animate-in fade-in slide-in-from-bottom-2">
        {financialOverview.availableCurrencies.length > 0 && (
          <div className="flex justify-center mb-6">
            <div className="flex gap-2 p-1 bg-[#FAF7F2] rounded-full overflow-x-auto no-scrollbar">
              {financialOverview.availableCurrencies.map((code) => (
                <button
                  key={code}
                  onClick={() => setActiveCurrencyTab(code)}
                  className={`px-4 py-1.5 rounded-full text-[10px] font-black transition-all whitespace-nowrap ${
                    activeCurrencyTab === code ? 'bg-[#1A1A1A] text-white shadow-md' : 'text-[#B7ADA4] hover:text-[#6B6661]'
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="text-center mb-8">
          <p className="text-[10px] font-black text-[#B7ADA4] uppercase tracking-[0.2em] mb-2">淨資產</p>
          <h2 className="text-4xl font-black text-[#D08C70] tracking-tighter">
            {currentSymbol}
            {currentStats.net.toLocaleString()}
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-[#E6DED6] pt-6">
          <div className="text-center border-r border-[#E6DED6]">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#729B79]"></div>
              <span className="text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest">資產</span>
            </div>
            <p className="text-lg font-black text-[#729B79]">
              {currentSymbol}
              {currentStats.assets.toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#D66D5B]"></div>
              <span className="text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest">負債</span>
            </div>
            <p className="text-lg font-black text-[#D66D5B]">
              {currentSymbol}
              {Math.abs(currentStats.liabilities).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {formMode && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFormMode(null)} />
          <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-[#E6DED6] bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[#E6DED6] px-5 py-4 sticky top-0 bg-white z-10">
              <span className="text-sm font-black text-[#D08C70]">{formMode === 'add' ? '新增帳戶' : '編輯帳戶'}</span>
              <button onClick={() => setFormMode(null)} className="text-[#B7ADA4] hover:text-red-500"><LucideIcons.X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest ml-1 mb-1">帳戶名稱</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-5 py-3 rounded-xl border border-[#E6DED6] outline-none font-bold text-[#1A1A1A]" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest ml-1 mb-1">餘額</label>
                  <CurrencyInput inputMode="numeric" value={balance} groupSeparator="," allowNegativeValue decimalsLimit={0} transformRawValue={normalizeImeNumericRaw} onValueChange={(value) => setBalance(value || '')} className="w-full px-5 py-3 rounded-xl border border-[#E6DED6] outline-none font-black text-[#1A1A1A]" />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest ml-1 mb-1">幣別</label>
                  <button
                    type="button"
                    onClick={() => setPickerModal('currency')}
                    className="h-[46px] w-full rounded-xl border border-[#E6DED6] bg-white px-3 text-left text-xs font-bold outline-none flex items-center justify-between"
                  >
                    <span>{SUPPORTED_CURRENCIES.find((c) => c.code === currency)?.name || currency}</span>
                    <LucideIcons.ChevronDown size={14} className="text-[#B7ADA4]" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest ml-1 mb-1">圖示</label>
                <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                  {icons.map((ic) => (
                    <button key={ic} onClick={() => setIcon(ic)} className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-all ${icon === ic ? 'bg-[#1A1A1A] text-white shadow-lg scale-110' : 'bg-[#FAF7F2] text-[#B7ADA4]'}`}>
                      {renderIcon(ic, icon === ic ? 'white' : 'currentColor', 20)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest ml-1 mb-1">顏色</label>
                <div className="flex gap-3">
                  {colors.map((c) => (
                    <button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-[#1A1A1A] ring-offset-2' : ''}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>

              {pickerModal === 'currency' && (
                <div className="fixed inset-0 z-[98] flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-black/40" onClick={() => setPickerModal(null)} />
                  <div className="relative z-10 w-full max-w-md rounded-3xl border border-[#E6DED6] bg-white shadow-2xl overflow-hidden">
                    <div className="flex items-center justify-between border-b border-[#E6DED6] px-5 py-4">
                      <h4 className="text-sm font-black text-[#1A1A1A]">選擇幣別</h4>
                      <button onClick={() => setPickerModal(null)} className="text-[#B7ADA4] hover:text-[#1A1A1A]"><LucideIcons.X size={18} /></button>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => { setCurrency(c.code); setPickerModal(null); }}
                          className={`w-full text-left px-3 py-3 rounded-xl text-xs font-bold ${currency === c.code ? 'bg-[#F7EEE8] text-[#D08C70] border border-[#D08C70]/40' : 'hover:bg-[#FAF7F2] text-[#1A1A1A]'}`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <button onClick={handleSave} className="w-full py-4 bg-[#D08C70] text-white rounded-2xl font-black uppercase shadow-lg mt-2">儲存變更</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {orderedAccounts.map((acc) => {
          const cur = SUPPORTED_CURRENCIES.find((c) => c.code === acc.currencyCode) || SUPPORTED_CURRENCIES[0];
          const isConfirming = deleteConfirmId === acc.id;

          return (
            <div
              key={acc.id}
              draggable={isSortMode}
              onDragStart={() => setDraggingId(acc.id)}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(e) => {
                if (!isSortMode || !draggingId || draggingId === acc.id) return;
                e.preventDefault();
                autoScrollWhenDragging(e);

                const dragIndex = orderedAccounts.findIndex((a) => a.id === draggingId);
                const hoverIndex = orderedAccounts.findIndex((a) => a.id === acc.id);
                if (dragIndex < 0 || hoverIndex < 0 || dragIndex === hoverIndex) return;

                const rect = e.currentTarget.getBoundingClientRect();
                const middleY = rect.top + rect.height / 2;

                if (dragIndex < hoverIndex && e.clientY < middleY) return;
                if (dragIndex > hoverIndex && e.clientY > middleY) return;

                moveAccount(draggingId, acc.id);
              }}
              onDrop={() => { if (isSortMode && draggingId) moveAccount(draggingId, acc.id); }}
              className={`custom-card p-6 rounded-[2.5rem] flex justify-between items-center bg-white group transition-all ${draggingId === acc.id ? 'border-2 border-[#D08C70] shadow-xl' : 'hover:border-[#D08C70]/30'}`}
            >
              <div className="flex items-center gap-5 cursor-pointer flex-1" onClick={() => { if (!isSortMode) openEdit(acc); }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ backgroundColor: `${acc.color}15` }}>
                  {renderIcon(acc.icon, acc.color)}
                </div>
                <div>
                  <h4 className="font-black text-[#1A1A1A] text-lg flex items-center gap-2">
                    {acc.name}
                    {isSortMode ? <LucideIcons.GripVertical size={14} className="text-[#D08C70]" /> : <LucideIcons.Edit3 size={12} className="text-[#B7ADA4] opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </h4>
                  <p className={`text-xl font-black tracking-tighter ${acc.balance < 0 ? 'text-[#D66D5B]' : ''}`}>{cur.symbol}{acc.balance.toLocaleString()}</p>
                  <div className="mt-1 space-y-0.5">
                    <p className="text-[10px] font-bold text-[#B7ADA4]">已分配: {cur.symbol}{(reservedByAccount[acc.id] || 0).toLocaleString()}</p>
                    <p className={`text-[10px] font-bold ${(availableByAccount[acc.id] || 0) < 0 ? 'text-[#D66D5B]' : 'text-[#729B79]'}`}>可用: {cur.symbol}{(availableByAccount[acc.id] || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {!isSortMode && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteClick(e, acc.id)}
                  className={`flex items-center justify-center transition-all rounded-xl ${
                    isConfirming ? 'bg-red-500 text-white px-3 py-2 shadow-md scale-105' : 'text-[#B7ADA4] hover:text-red-500 hover:bg-red-50 p-3'
                  }`}
                  title={isConfirming ? '再次點擊確認刪除' : '刪除帳戶'}
                >
                  {isConfirming ? <span className="text-[10px] font-black whitespace-nowrap">確認刪除</span> : <LucideIcons.Trash2 size={20} />}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isSortMode && (
        <button onClick={saveSortMode} className="fixed right-5 bottom-28 z-[60] h-11 px-5 rounded-2xl bg-[#D08C70] text-white text-xs font-black shadow-2xl">
          儲存排序
        </button>
      )}
    </div>
  );
};

export default AccountManager;
















































