import React, { useEffect, useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Account, Category, SpendingScope, Transaction } from '../types';

interface AnalysisProps {
  transactions: Transaction[];
  categories: Category[];
  scopes: SpendingScope[];
  accounts: Account[];
}

const Analysis: React.FC<AnalysisProps> = ({
  transactions = [],
  categories = [],
  scopes = [],
  accounts = [],
}) => {
  const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    return { start: formatDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  });

  const [viewMode, setViewMode] = useState<'trend' | 'efficiency' | 'assets'>('trend');
  const [expenseStructureBy, setExpenseStructureBy] = useState<'category' | 'account' | 'scope'>('category');
  const [incomeStructureBy, setIncomeStructureBy] = useState<'category' | 'account' | 'scope'>('category');
  const [showExpenseStructureMenu, setShowExpenseStructureMenu] = useState(false);
  const [showIncomeStructureMenu, setShowIncomeStructureMenu] = useState(false);
  const [detailCategory, setDetailCategory] = useState<{
    type: 'income' | 'expense';
    name: string;
    structureBy: 'category' | 'account' | 'scope';
  } | null>(null);

  const filteredData = useMemo(() => transactions.filter((t) => {
    const d = t.date.split('T')[0];
    return d >= dateRange.start && d <= dateRange.end;
  }), [transactions, dateRange]);

  const daysDiff = useMemo(() => {
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [dateRange]);

  const isEfficiencyView = viewMode === 'efficiency';
  const isAssetView = viewMode === 'assets';
  const isTrendView = viewMode === 'trend';

  const stats = useMemo(() => {
    const income = filteredData.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = filteredData.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const personalExpense = filteredData.filter((t) => t.type === 'expense' && (!t.scopeId || t.scopeId === 'scope_personal')).reduce((s, t) => s + t.amount, 0);
    const days = Math.max(1, daysDiff);
    return { income, expense: totalExpense, balance: income - totalExpense, dailyAvg: Math.round(personalExpense / days), savingsRate: income > 0 ? Math.round(((income - totalExpense) / income) * 100) : 0 };
  }, [filteredData, daysDiff]);

  const toPieData = (
    type: 'income' | 'expense',
    structureBy: 'category' | 'account' | 'scope'
  ) => {
    const totals: Record<string, number> = {};
    filteredData.filter((t) => t.type === type).forEach((tx) => {
      const txScopeId = tx.scopeId || 'scope_personal';
      const key =
        structureBy === 'category'
          ? tx.category
          : structureBy === 'account'
            ? (accounts.find((a) => a.id === tx.accountId)?.name || '未知帳戶')
            : (scopes.find((s) => s.id === txScopeId)?.name || '個人');
      totals[key] = (totals[key] || 0) + tx.amount;
    });

    const totalAmount = type === 'income' ? filteredData.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0) : filteredData.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    return Object.entries(totals).map(([name, value]) => {
      const cat = categories.find((c) => c.name === name);
      const acc = accounts.find((a) => a.name === name);
      const scope = scopes.find((s) => s.name === name);
      const percentage = totalAmount > 0 ? Math.round((value / totalAmount) * 100) : 0;
      const icon =
        structureBy === 'category'
          ? (cat?.icon || 'Layers')
          : structureBy === 'account'
            ? (acc?.icon || 'Wallet')
            : 'Layers';
      const color =
        structureBy === 'category'
          ? (cat?.color || (type === 'income' ? '#729B79' : '#B7ADA4'))
          : structureBy === 'account'
            ? (acc?.color || '#B7ADA4')
            : (scope?.color || '#B7ADA4');
      return { name, value, percentage, icon, color };
    }).sort((a, b) => b.value - a.value);
  };

  const expensePieData = useMemo(
    () => toPieData('expense', expenseStructureBy),
    [filteredData, categories, accounts, scopes, expenseStructureBy]
  );
  const incomePieData = useMemo(
    () => toPieData('income', incomeStructureBy),
    [filteredData, categories, accounts, scopes, incomeStructureBy]
  );

  const detailTransactions = useMemo(() => {
    if (!detailCategory) return [] as Transaction[];
    return filteredData
      .filter((t) => {
        if (t.type !== detailCategory.type) return false;
        const txScopeId = t.scopeId || 'scope_personal';
        const key =
          detailCategory.structureBy === 'category'
            ? t.category
            : detailCategory.structureBy === 'account'
              ? (accounts.find((a) => a.id === t.accountId)?.name || '未知帳戶')
              : (scopes.find((s) => s.id === txScopeId)?.name || '個人');
        return key === detailCategory.name;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [detailCategory, filteredData, accounts, scopes]);

  const getStructureLabel = (value: 'category' | 'account' | 'scope') =>
    value === 'category' ? '分類' : value === 'account' ? '帳戶' : '用途';

  const dailyTrendData = useMemo(() => {
    if (!isTrendView) return [];

    const daily: Record<string, { income: number; expense: number }> = {};
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) daily[formatDate(d)] = { income: 0, expense: 0 };

    filteredData.forEach((tx) => {
      const fullDate = tx.date.split('T')[0];
      if (daily[fullDate]) {
        if (tx.type === 'income') daily[fullDate].income += tx.amount;
        if (tx.type === 'expense') daily[fullDate].expense += tx.amount;
      }
    });

    return Object.entries(daily).map(([date, values]) => ({ date, ...values })).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredData, dateRange, isTrendView]);

  const isMonthlyEfficiency = useMemo(() => {
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const monthGap = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (monthGap > 1) return true;
    if (monthGap < 1) return false;
    // monthGap === 1: switch only when range is strictly more than one natural month.
    return end.getDate() > start.getDate();
  }, [dateRange]);

  const efficiencyData = useMemo(() => {
    if (!isEfficiencyView) return [];

    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);

    if (isMonthlyEfficiency) {
      const data: Array<{ date: string; amount: number; savingsRate: number; income: number; expense: number }> = [];
      let current = new Date(start.getFullYear(), start.getMonth(), 1);
      const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);

      while (current <= lastMonth) {
        const y = current.getFullYear();
        const m = current.getMonth() + 1;
        const monthKey = `${y}-${String(m).padStart(2, '0')}`;
        const daysInMonth = new Date(y, m, 0).getDate();
        const txsInMonth = filteredData.filter((t) => t.date.startsWith(monthKey));
        const income = txsInMonth.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const expense = txsInMonth.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

        data.push({
          date: monthKey,
          amount: Math.round(expense / daysInMonth),
          savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : 0,
          income,
          expense,
        });
        current.setMonth(current.getMonth() + 1);
      }

      return data;
    }

    const daily: Record<string, { income: number; expense: number }> = {};
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      daily[formatDate(d)] = { income: 0, expense: 0 };
    }

    filteredData.forEach((tx) => {
      const d = tx.date.split('T')[0];
      if (daily[d]) {
        if (tx.type === 'income') daily[d].income += tx.amount;
        if (tx.type === 'expense') daily[d].expense += tx.amount;
      }
    });

    const rows = Object.entries(daily)
      .map(([date, values]) => ({
        date,
        amount: values.expense,
        income: values.income,
        expense: values.expense,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    let cumulativeIncome = 0;
    let cumulativeExpense = 0;
    return rows.map((row) => {
      cumulativeIncome += row.income;
      cumulativeExpense += row.expense;
      const rawSavingsRate =
        cumulativeIncome > 0
          ? Math.round(((cumulativeIncome - cumulativeExpense) / cumulativeIncome) * 100)
          : 0;
      return {
        ...row,
        savingsRate: rawSavingsRate,
        savingsRateDisplay: Math.max(0, rawSavingsRate),
      };
    });
  }, [filteredData, isEfficiencyView, dateRange, isMonthlyEfficiency]);

  const isMonthlyAsset = isMonthlyEfficiency;
  const assetTrendData = useMemo(() => {
    if (!isAssetView) return [];
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    const currentTotal = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const allChangesByDate = transactions.reduce((acc, tx) => {
      const d = tx.date.split('T')[0];
      let delta = 0;
      if (tx.type === 'income') delta = tx.amount;
      if (tx.type === 'expense') delta = -tx.amount;
      acc[d] = (acc[d] || 0) + delta;
      return acc;
    }, {} as Record<string, number>);

    const datesAfterStart = Object.keys(allChangesByDate).filter((d) => d >= dateRange.start);
    const baseBeforeStart = currentTotal - datesAfterStart.reduce((sum, d) => sum + (allChangesByDate[d] || 0), 0);

    const dailySeries: Array<{ date: string; amount: number }> = [];
    let running = baseBeforeStart;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateKey = formatDate(d);
      running += allChangesByDate[dateKey] || 0;
      dailySeries.push({ date: dateKey, amount: running });
    }

    if (!isMonthlyAsset) return dailySeries;

    const byMonth = new Map<string, { date: string; amount: number }>();
    dailySeries.forEach((row) => {
      const key = row.date.slice(0, 7);
      byMonth.set(key, { date: key, amount: row.amount });
    });
    return Array.from(byMonth.values());
  }, [isAssetView, daysDiff, dateRange, accounts, transactions]);

  const renderIcon = (iconName: string, iconColor: string, size = 18) => {
    const IconComponent = (LucideIcons as any)[iconName] || LucideIcons.Layers;
    return <IconComponent size={size} strokeWidth={2.5} style={{ color: iconColor }} />;
  };

  const renderPiePercentLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
    fill,
  }: any) => {
    const pct = Math.round((percent || 0) * 100);
    // Small slices are unreadable inside donut; rely on legend/details instead.
    if (pct < 6) return null;
    const radius = (Number(innerRadius) + Number(outerRadius)) / 2;
    const x = Number(cx) + radius * Math.cos((-midAngle * Math.PI) / 180);
    const y = Number(cy) + radius * Math.sin((-midAngle * Math.PI) / 180);
    const hex = typeof fill === 'string' ? fill.replace('#', '') : '';
    const r = parseInt(hex.slice(0, 2) || '00', 16);
    const g = parseInt(hex.slice(2, 4) || '00', 16);
    const b = parseInt(hex.slice(4, 6) || '00', 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const textColor = luminance > 0.6 ? '#1A1A1A' : '#FFFFFF';
    const strokeColor = luminance > 0.6 ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.45)';
    return (
      <text
        x={x}
        y={y}
        fill={textColor}
        stroke={strokeColor}
        strokeWidth={2}
        paintOrder="stroke"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontWeight={900}
      >
        {pct}%
      </text>
    );
  };

  const renderCategoryDetail = (
    item: { name: string; value: number; percentage: number; icon: string; color: string },
    type: 'income' | 'expense',
    structureBy: 'category' | 'account' | 'scope'
  ) => (
    <button
      key={`${type}_${item.name}`}
      className="group w-full text-left"
      onClick={() => setDetailCategory({ type, name: item.name, structureBy })}
    >
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#FAF7F2]">{renderIcon(item.icon, item.color, 18)}</div>
          <span className="text-xs font-black text-[#1A1A1A]">{item.name}</span>
          <span className="text-[9px] font-bold text-[#B7ADA4]">{item.percentage}%</span>
        </div>
        <span className="text-xs font-black text-[#1A1A1A]">${item.value.toLocaleString()}</span>
      </div>
      <div className="w-full h-1.5 bg-[#FAF7F2] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${item.percentage}%`, backgroundColor: item.color }} />
      </div>
    </button>
  );

  return (
    <div className="analysis-view space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
      <div className="custom-card p-6 rounded-[2rem] flex flex-col sm:flex-row gap-4 items-center justify-between">
        <h3 className="font-black text-xs uppercase tracking-widest text-[#D08C70]">分析區間</h3>
        <div className="flex items-center gap-2">
          <input type="date" value={dateRange.start} onChange={(e) => { const newStart = e.target.value; setDateRange((prev) => ({ start: newStart, end: prev.end < newStart ? newStart : prev.end })); }} className="px-2 py-2 rounded-xl border border-[#E6DED6] text-xs font-bold outline-none bg-[#FAF7F2]" />
          <span className="text-[#B7ADA4] font-bold">~</span>
          <input type="date" value={dateRange.end} onChange={(e) => { const newEnd = e.target.value; setDateRange((prev) => ({ start: prev.start > newEnd ? newEnd : prev.start, end: newEnd })); }} className="px-2 py-2 rounded-xl border border-[#E6DED6] text-xs font-bold outline-none bg-[#FAF7F2]" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '總收入', val: stats.income, color: 'text-[#729B79]' },
          { label: '總支出', val: filteredData.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0), color: 'text-[#D66D5B]' },
          { label: '日均支出(個人)', val: stats.dailyAvg, color: 'text-[#1A1A1A]' },
          { label: '儲蓄率', val: `${stats.savingsRate}%`, color: 'text-[#D08C70]' },
        ].map((s) => (
          <div key={s.label} className="custom-card p-4 rounded-2xl text-center">
            <p className="text-[8px] font-black text-[#B7ADA4] uppercase mb-1 tracking-widest">{s.label}</p>
            <p className={`text-sm font-black ${s.color}`}>{typeof s.val === 'number' ? `$${s.val.toLocaleString()}` : s.val}</p>
          </div>
        ))}
      </div>

      <div className="custom-card p-6 md:p-8 rounded-[2.5rem]">
        <div className="mb-8 flex flex-col items-center gap-5">
          <div className="w-full grid grid-cols-3 gap-2 items-center">
            <div className="flex justify-center">
              <button
                onClick={() => setViewMode('trend')}
                className={`relative h-11 rounded-full border transition-all ${
                  isTrendView ? 'w-[148px] bg-[#1A1A1A] border-[#1A1A1A] text-white pl-12 pr-4' : 'w-11 bg-[#FAF7F2] border-[#E6DED6] text-[#1A1A1A]'
                }`}
              >
                <span className={`absolute left-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full shadow-md flex items-center justify-center ${isTrendView ? 'bg-white text-[#1A1A1A]' : 'bg-[#1A1A1A] text-white'}`}>
                  <LucideIcons.LineChart size={16} />
                </span>
                {isTrendView && <span className="text-[11px] font-black whitespace-nowrap">收支趨勢圖</span>}
              </button>
            </div>
            <div className="flex justify-center">
              <button
                onClick={() => setViewMode('efficiency')}
                className={`relative h-11 rounded-full border transition-all ${
                  isEfficiencyView ? 'w-[148px] bg-[#1A1A1A] border-[#1A1A1A] text-white pl-12 pr-4' : 'w-11 bg-[#FAF7F2] border-[#E6DED6] text-[#1A1A1A]'
                }`}
              >
                <span className={`absolute left-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full shadow-md flex items-center justify-center ${isEfficiencyView ? 'bg-[#D08C70] text-white' : 'bg-[#1A1A1A] text-white'}`}>
                  <LucideIcons.PiggyBank size={16} />
                </span>
                {isEfficiencyView && <span className="text-[11px] font-black whitespace-nowrap">儲蓄率分析</span>}
              </button>
            </div>
            <div className="flex justify-center">
              <button
                onClick={() => setViewMode('assets')}
                className={`relative h-11 rounded-full border transition-all ${
                  isAssetView ? 'w-[148px] bg-[#1A1A1A] border-[#1A1A1A] text-white pl-12 pr-4' : 'w-11 bg-[#FAF7F2] border-[#E6DED6] text-[#1A1A1A]'
                }`}
              >
                <span className={`absolute left-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full shadow-md flex items-center justify-center ${isAssetView ? 'bg-[#5B84B1] text-white' : 'bg-[#1A1A1A] text-white'}`}>
                  <LucideIcons.Wallet size={16} />
                </span>
                {isAssetView && <span className="text-[11px] font-black whitespace-nowrap">資產趨勢</span>}
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex gap-4">
              {isEfficiencyView ? (
                <>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded bg-[#D08C70]"></div><span className="text-[9px] font-black text-[#B7ADA4]">{isMonthlyEfficiency ? '日均支出' : '支出'}</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-0.5 bg-[#1A1A1A]"></div><span className="text-[9px] font-black text-[#B7ADA4]">{isMonthlyEfficiency ? '儲蓄率' : '累積儲蓄率'}</span></div>
                </>
              ) : isAssetView ? (
                <div className="flex items-center gap-1.5"><div className="w-2 h-0.5 bg-[#5B84B1]"></div><span className="text-[9px] font-black text-[#B7ADA4]">淨資產</span></div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#729B79]"></div><span className="text-[9px] font-black text-[#B7ADA4]">收入</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#D66D5B]"></div><span className="text-[9px] font-black text-[#B7ADA4]">支出</span></div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {isEfficiencyView ? (
              <ComposedChart data={efficiencyData} margin={{ left: 6, right: 6 }} accessibilityLayer={false}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6DED6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#B7ADA4' }} tickFormatter={(val) => (isMonthlyEfficiency ? `${String(val).slice(5)}月` : String(val).slice(5).replace('-', '/'))} interval={isMonthlyEfficiency ? 0 : 'preserveStartEnd'} />
                <YAxis width={48} yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#B7ADA4' }} tickFormatter={(val) => `$${val}`} />
                <YAxis width={40} yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#1A1A1A' }} tickFormatter={(val) => `${val}%`} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', padding: '12px' }} itemStyle={{ fontSize: '11px', fontWeight: 'bold' }} formatter={(value: number, name: string, payload: any) => {
                  if (name === 'amount') return [`$${value.toLocaleString()}`, isMonthlyEfficiency ? '日均支出' : '支出'];
                  if (!isMonthlyEfficiency) {
                    const raw = payload?.payload?.savingsRate ?? value;
                    return [`${raw}%`, '累積儲蓄率'];
                  }
                  return [`${value}%`, '儲蓄率'];
                }} labelFormatter={(label) => (isMonthlyEfficiency ? String(label).replace('-', '年 ') + '月' : String(label).replace(/-/g, '/'))} />
                <Bar yAxisId="left" dataKey="amount" fill="#D08C70" radius={[4, 4, 0, 0]} barSize={isMonthlyEfficiency ? 12 : 8} />
                <ReferenceLine yAxisId="right" y={20} stroke="#1A1A1A" strokeDasharray="3 3" strokeOpacity={0.2} />
                <Line yAxisId="right" type="monotone" dataKey={isMonthlyEfficiency ? 'savingsRate' : 'savingsRateDisplay'} stroke="#1A1A1A" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: '#1A1A1A' }} activeDot={{ r: 5 }} />
              </ComposedChart>
            ) : isAssetView ? (
              <AreaChart data={assetTrendData} margin={{ left: 6, right: 6 }} accessibilityLayer={false}>
                <defs>
                  <linearGradient id="colorAsset" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#5B84B1" stopOpacity={0.25} /><stop offset="95%" stopColor="#5B84B1" stopOpacity={0.02} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6DED6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#B7ADA4' }} tickFormatter={(val) => (isMonthlyAsset ? `${String(val).slice(5)}月` : String(val).slice(5).replace('-', '/'))} interval={isMonthlyAsset ? 0 : 'preserveStartEnd'} />
                <YAxis width={52} axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#B7ADA4' }} tickFormatter={(val) => `$${Math.round(Number(val)).toLocaleString()}`} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', padding: '12px' }} itemStyle={{ fontSize: '11px', fontWeight: 'bold' }} formatter={(value: number) => [`$${Math.round(value).toLocaleString()}`, '淨資產']} labelFormatter={(label) => (isMonthlyAsset ? String(label).replace('-', '年 ') + '月' : String(label).replace(/-/g, '/'))} />
                <Area type="monotone" dataKey="amount" stroke="#5B84B1" strokeWidth={3} fillOpacity={1} fill="url(#colorAsset)" />
              </AreaChart>
            ) : (
              <AreaChart data={dailyTrendData} margin={{ left: 6, right: 6 }} accessibilityLayer={false}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#729B79" stopOpacity={0.2} /><stop offset="95%" stopColor="#729B79" stopOpacity={0} /></linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#D66D5B" stopOpacity={0.2} /><stop offset="95%" stopColor="#D66D5B" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6DED6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#B7ADA4' }} tickFormatter={(val) => String(val).slice(5).replace('-', '/')} />
                <YAxis width={48} axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#B7ADA4' }} tickFormatter={(val) => `$${val}`} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', padding: '12px' }} itemStyle={{ fontSize: '11px', fontWeight: 'bold' }} formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name === 'income' ? '收入' : name === 'expense' ? '支出' : name]} labelFormatter={(label) => String(label).replace(/-/g, '/')} />
                <Area type="monotone" dataKey="income" name="income" stroke="#729B79" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                <Area type="monotone" dataKey="expense" name="expense" stroke="#D66D5B" strokeWidth={3} fillOpacity={1} fill="url(#colorExpense)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 custom-card p-8 rounded-[2.5rem] flex flex-col items-center">
          <div className="w-full mb-8 flex items-center justify-between gap-3">
            <h4 className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">支出結構</h4>
            <div className="relative">
              <button
                onClick={() => setShowExpenseStructureMenu((v) => !v)}
                className="h-9 min-w-[96px] px-3 rounded-xl border border-[#E6DED6] bg-[#FAF7F2] text-xs font-black text-[#1A1A1A] flex items-center justify-between gap-2"
              >
                {getStructureLabel(expenseStructureBy)}
                <LucideIcons.ChevronDown size={14} className={`text-[#B7ADA4] transition-transform ${showExpenseStructureMenu ? 'rotate-180' : ''}`} />
              </button>
              {showExpenseStructureMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowExpenseStructureMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-2xl shadow-xl border border-[#E6DED6] p-2 z-20">
                    {(['category', 'account', 'scope'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => {
                          setExpenseStructureBy(v);
                          setShowExpenseStructureMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-black transition-all ${
                          expenseStructureBy === v ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6661] hover:bg-[#FAF7F2]'
                        }`}
                      >
                        {getStructureLabel(v)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="relative w-full h-64">
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <span className="text-[9px] font-black text-[#B7ADA4] uppercase tracking-[0.2em] mb-1">總支出</span>
              <span className="text-2xl font-black text-[#1A1A1A]">${filteredData.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0).toLocaleString()}</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart accessibilityLayer={false}>
                <Pie
                  data={expensePieData}
                  innerRadius={70}
                  outerRadius={90}
                  paddingAngle={6}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  stroke="none"
                  label={renderPiePercentLabel}
                  labelLine={false}
                >
                  {expensePieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 w-full flex flex-wrap gap-2 justify-center">
            {expensePieData.map((item) => (
              <div key={`exp_legend_${item.name}`} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[10px] font-black text-[#6B6661]">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 custom-card p-8 rounded-[2.5rem]">
          <h4 className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest mb-6">支出{getStructureLabel(expenseStructureBy)}明細</h4>
          <div className="space-y-5 max-h-[320px] overflow-y-auto no-scrollbar pr-2">
            {expensePieData.length === 0 ? <div className="h-full flex items-center justify-center text-[#B7ADA4] font-bold italic text-sm py-12">此區間沒有支出資料</div> : expensePieData.map((item) => renderCategoryDetail(item, 'expense', expenseStructureBy))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 custom-card p-8 rounded-[2.5rem] flex flex-col items-center">
          <div className="w-full mb-8 flex items-center justify-between gap-3">
            <h4 className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">收入結構</h4>
            <div className="relative">
              <button
                onClick={() => setShowIncomeStructureMenu((v) => !v)}
                className="h-9 min-w-[96px] px-3 rounded-xl border border-[#E6DED6] bg-[#FAF7F2] text-xs font-black text-[#1A1A1A] flex items-center justify-between gap-2"
              >
                {getStructureLabel(incomeStructureBy)}
                <LucideIcons.ChevronDown size={14} className={`text-[#B7ADA4] transition-transform ${showIncomeStructureMenu ? 'rotate-180' : ''}`} />
              </button>
              {showIncomeStructureMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowIncomeStructureMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-2xl shadow-xl border border-[#E6DED6] p-2 z-20">
                    {(['category', 'account', 'scope'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => {
                          setIncomeStructureBy(v);
                          setShowIncomeStructureMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-black transition-all ${
                          incomeStructureBy === v ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6661] hover:bg-[#FAF7F2]'
                        }`}
                      >
                        {getStructureLabel(v)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="relative w-full h-64">
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <span className="text-[9px] font-black text-[#B7ADA4] uppercase tracking-[0.2em] mb-1">總收入</span>
              <span className="text-2xl font-black text-[#1A1A1A]">${filteredData.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0).toLocaleString()}</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart accessibilityLayer={false}>
                <Pie
                  data={incomePieData}
                  innerRadius={70}
                  outerRadius={90}
                  paddingAngle={6}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  stroke="none"
                  label={renderPiePercentLabel}
                  labelLine={false}
                >
                  {incomePieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 w-full flex flex-wrap gap-2 justify-center">
            {incomePieData.map((item) => (
              <div key={`inc_legend_${item.name}`} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[10px] font-black text-[#6B6661]">{item.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 custom-card p-8 rounded-[2.5rem]">
          <h4 className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest mb-6">收入{getStructureLabel(incomeStructureBy)}明細</h4>
          <div className="space-y-5 max-h-[320px] overflow-y-auto no-scrollbar pr-2">
            {incomePieData.length === 0 ? <div className="h-full flex items-center justify-center text-[#B7ADA4] font-bold italic text-sm py-12">此區間沒有收入資料</div> : incomePieData.map((item) => renderCategoryDetail(item, 'income', incomeStructureBy))}
          </div>
        </div>
      </div>

      {detailCategory && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailCategory(null)} />
          <div className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-3xl border border-[#E6DED6] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E6DED6] px-5 py-4">
              <h4 className="text-sm font-black text-[#1A1A1A]">{detailCategory.name} 交易明細</h4>
              <button onClick={() => setDetailCategory(null)} className="text-[#B7ADA4] hover:text-[#1A1A1A]"><LucideIcons.X size={18} /></button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-[#E6DED6]">
              {detailTransactions.length === 0 ? (
                <div className="p-10 text-center text-sm font-bold text-[#B7ADA4]">此分類在所選區間沒有交易</div>
              ) : (
                detailTransactions.map((tx) => {
                  const cat = categories.find((c) => c.name === tx.category);
                  const acc = accounts.find((a) => a.id === tx.accountId);
                  const scope = scopes.find((s) => s.id === tx.scopeId);
                  return (
                    <div key={tx.id} className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[#1A1A1A] truncate">{tx.description || tx.category}</p>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-[#B7ADA4]">{new Date(tx.date).toLocaleDateString()}</span>
                          {cat && <span className="text-[10px] font-bold px-1.5 rounded border" style={{ color: cat.color, backgroundColor: `${cat.color}1A`, borderColor: `${cat.color}55` }}>{cat.name}</span>}
                          {scope && <span className="text-[10px] font-bold px-1.5 rounded border" style={{ color: scope.color, backgroundColor: `${scope.color}1A`, borderColor: `${scope.color}55` }}>{scope.name}</span>}
                          {acc && <span className="text-[10px] font-bold text-[#B7ADA4]">{acc.name}</span>}
                        </div>
                      </div>
                      <p className={`text-sm font-black ${tx.type === 'expense' ? 'text-[#D66D5B]' : 'text-[#729B79]'}`}>
                        {tx.type === 'expense' ? '-' : '+'}${tx.amount.toLocaleString()}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analysis;







