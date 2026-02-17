import React, { useEffect, useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import CurrencyInput from 'react-currency-input-field';
import { normalizeImeNumericRaw } from '../utils/numberInput';
import type { Account } from '../types';
import { SUPPORTED_CURRENCIES } from '../types';

interface AccountManagerProps {
  accounts: Account[];
  reservedByAccount: Record<string, number>;
  availableByAccount: Record<string, number>;
  onUpdate: React.Dispatch<React.SetStateAction<Account[]>>;
  onDelete: (id: string) => void;
}

const AccountManager: React.FC<AccountManagerProps> = ({ accounts, reservedByAccount, availableByAccount, onUpdate, onDelete }) => {
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [activeCurrencyTab, setActiveCurrencyTab] = useState<string>('TWD');

  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [currency, setCurrency] = useState('TWD');
  const [icon, setIcon] = useState('Briefcase');
  const [color, setColor] = useState('#D08C70');

  const colors = ['#D08C70', '#8FB996', '#5B84B1', '#C97B63', '#9C6644', '#E07A5F', '#B7ADA4'];
  const icons = ['Briefcase', 'Wallet', 'CreditCard', 'PiggyBank', 'Landmark', 'CircleDollarSign', 'Coins'];

  const financialOverview = useMemo(() => {
    const stats: Record<string, { assets: number; liabilities: number; net: number }> = {};
    const availableCurrencies = Array.from(new Set(accounts.map((a) => a.currencyCode)));

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

  const currentStats = financialOverview.stats[activeCurrencyTab] || { assets: 0, liabilities: 0, net: 0 };
  const currentSymbol = SUPPORTED_CURRENCIES.find((c) => c.code === activeCurrencyTab)?.symbol || '$';

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

  return (
    <div className="space-y-8 pb-12">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-[#1A1A1A] tracking-tighter">帳戶管理</h2>
        <button onClick={openAdd} className="px-6 py-2.5 bg-[#1A1A1A] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg tap-active">
          + 新增
        </button>
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
        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border-2 border-[#D08C70]/20 space-y-6 animate-in zoom-in-95 shadow-xl relative">
          <button onClick={() => setFormMode(null)} className="absolute top-6 right-6 text-[#B7ADA4] hover:text-[#1A1A1A]">
            關閉
          </button>
          <h3 className="text-lg font-black text-[#1A1A1A]">{formMode === 'add' ? '新增帳戶' : '編輯帳戶'}</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest ml-1 mb-1">帳戶名稱</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-5 py-3 rounded-xl border border-[#E6DED6] outline-none font-bold text-[#1A1A1A]" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest ml-1 mb-1">餘額</label>
                <CurrencyInput
                  inputMode="numeric"
                  value={balance}
                  groupSeparator=","
                  allowNegativeValue
                  decimalsLimit={0}
                  transformRawValue={normalizeImeNumericRaw}
                  onValueChange={(value) => setBalance(value || '')}
                  className="w-full px-5 py-3 rounded-xl border border-[#E6DED6] outline-none font-black text-[#1A1A1A]"
                />
              </div>
              <div>
                <label className="block text-[9px] font-black text-[#B7ADA4] uppercase tracking-widest ml-1 mb-1">幣別</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-[#E6DED6] outline-none font-bold bg-white text-[#1A1A1A]">
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
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
                <div className="relative w-8 h-8">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div className={`w-full h-full rounded-full transition-all border-2 border-dashed border-[#B7ADA4] flex items-center justify-center ${!colors.includes(color) ? 'ring-2 ring-[#1A1A1A] ring-offset-2' : ''}`} style={{ backgroundColor: !colors.includes(color) ? color : 'transparent' }}>
                    <LucideIcons.Plus size={16} className={!colors.includes(color) ? 'text-white mix-blend-difference' : 'text-[#B7ADA4]'} />
                  </div>
                </div>
              </div>
            </div>

            <button onClick={handleSave} className="w-full py-4 bg-[#D08C70] text-white rounded-2xl font-black uppercase shadow-lg mt-2">
              儲存變更
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {accounts.map((acc) => {
          const cur = SUPPORTED_CURRENCIES.find((c) => c.code === acc.currencyCode) || SUPPORTED_CURRENCIES[0];
          const isConfirming = deleteConfirmId === acc.id;

          return (
            <div key={acc.id} className="custom-card p-6 rounded-[2.5rem] flex justify-between items-center bg-white group hover:border-[#D08C70]/30 transition-all">
              <div className="flex items-center gap-5 cursor-pointer flex-1" onClick={() => openEdit(acc)}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ backgroundColor: `${acc.color}15` }}>
                  {renderIcon(acc.icon, acc.color)}
                </div>
                <div>
                  <h4 className="font-black text-[#1A1A1A] text-lg flex items-center gap-2">
                    {acc.name}
                    <LucideIcons.Edit3 size={12} className="text-[#B7ADA4] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h4>
                  <p className={`text-xl font-black tracking-tighter ${acc.balance < 0 ? 'text-[#D66D5B]' : ''}`}>
                    {cur.symbol}
                    {acc.balance.toLocaleString()}
                  </p>
                  <div className="mt-1 space-y-0.5">
                    <p className="text-[10px] font-bold text-[#B7ADA4]">
                      已分配: {cur.symbol}
                      {(reservedByAccount[acc.id] || 0).toLocaleString()}
                    </p>
                    <p className={`text-[10px] font-bold ${(availableByAccount[acc.id] || 0) < 0 ? 'text-[#D66D5B]' : 'text-[#729B79]'}`}>
                      可用: {cur.symbol}
                      {(availableByAccount[acc.id] || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

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
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AccountManager;



