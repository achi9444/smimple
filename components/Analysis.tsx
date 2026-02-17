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
import type { Category, Transaction } from '../types';

interface AnalysisProps {
  transactions: Transaction[];
  categories: Category[];
}

const Analysis: React.FC<AnalysisProps> = ({ transactions, categories }) => {
  const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    return { start: formatDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  });

  const [viewMode, setViewMode] = useState<'trend' | 'efficiency'>('trend');

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

  useEffect(() => {
    if (daysDiff > 28) setViewMode('efficiency');
  }, [daysDiff]);

  const isEfficiencyView = viewMode === 'efficiency';

  const stats = useMemo(() => {
    const income = filteredData.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = filteredData.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const days = Math.max(1, daysDiff);
    return { income, expense, balance: income - expense, dailyAvg: Math.round(expense / days), savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : 0 };
  }, [filteredData, daysDiff]);

  const toPieData = (type: 'income' | 'expense') => {
    const totals: Record<string, number> = {};
    filteredData.filter((t) => t.type === type).forEach((tx) => {
      totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
    });

    const totalAmount = type === 'income' ? stats.income : stats.expense;

    return Object.entries(totals).map(([name, value]) => {
      const cat = categories.find((c) => c.name === name);
      const percentage = totalAmount > 0 ? Math.round((value / totalAmount) * 100) : 0;
      return { name, value, percentage, icon: cat?.icon || 'Layers', color: cat?.color || (type === 'income' ? '#729B79' : '#B7ADA4') };
    }).sort((a, b) => b.value - a.value);
  };

  const expensePieData = useMemo(() => toPieData('expense'), [filteredData, categories, stats.expense]);
  const incomePieData = useMemo(() => toPieData('income'), [filteredData, categories, stats.income]);

  const dailyTrendData = useMemo(() => {
    if (isEfficiencyView) return [];

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
  }, [filteredData, dateRange, isEfficiencyView]);

  const efficiencyData = useMemo(() => {
    if (!isEfficiencyView) return [];

    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);

    if (daysDiff > 28) {
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

        data.push({ date: monthKey, amount: Math.round(expense / daysInMonth), savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : 0, income, expense });
        current.setMonth(current.getMonth() + 1);
      }

      return data;
    }

    const daily: Record<string, { income: number; expense: number }> = {};
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) daily[formatDate(d)] = { income: 0, expense: 0 };

    filteredData.forEach((tx) => {
      const d = tx.date.split('T')[0];
      if (daily[d]) {
        if (tx.type === 'income') daily[d].income += tx.amount;
        if (tx.type === 'expense') daily[d].expense += tx.amount;
      }
    });

    return Object.entries(daily).map(([date, values]) => ({ date, amount: values.expense, savingsRate: values.income > 0 ? Math.round(((values.income - values.expense) / values.income) * 100) : 0, income: values.income, expense: values.expense })).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredData, isEfficiencyView, dateRange, daysDiff]);

  const renderIcon = (iconName: string, iconColor: string, size = 18) => {
    const IconComponent = (LucideIcons as any)[iconName] || LucideIcons.Layers;
    return <IconComponent size={size} strokeWidth={2.5} style={{ color: iconColor }} />;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
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
          { label: '總支出', val: stats.expense, color: 'text-[#D66D5B]' },
          { label: '日均支出', val: stats.dailyAvg, color: 'text-[#1A1A1A]' },
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
          <div className="flex bg-[#FAF7F2] p-1.5 rounded-2xl border border-[#E6DED6]">
            <button onClick={() => setViewMode('trend')} className={`h-10 w-20 rounded-xl text-[10px] font-black leading-none transition-all flex items-center justify-center ${!isEfficiencyView ? 'bg-[#1A1A1A] text-white shadow-md' : 'text-[#B7ADA4] hover:text-[#6B6661]'}`}>趨勢</button>
            <button onClick={() => setViewMode('efficiency')} className={`h-10 w-20 rounded-xl text-[10px] font-black leading-none transition-all flex items-center justify-center ${isEfficiencyView ? 'bg-[#1A1A1A] text-white shadow-md' : 'text-[#B7ADA4] hover:text-[#6B6661]'}`}>儲蓄率</button>
          </div>

          <div className="flex flex-col items-center gap-2 text-center">
            <h4 className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">{isEfficiencyView ? (daysDiff > 28 ? '儲蓄率分析（月）' : '儲蓄率分析（日）') : '收支趨勢圖'}</h4>
            <div className="flex gap-4">
              {isEfficiencyView ? (
                <>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded bg-[#D08C70]"></div><span className="text-[9px] font-black text-[#B7ADA4]">{daysDiff > 28 ? '日均支出' : '支出'}</span></div>
                  {daysDiff > 28 && <div className="flex items-center gap-1.5"><div className="w-2 h-0.5 bg-[#1A1A1A]"></div><span className="text-[9px] font-black text-[#B7ADA4]">儲蓄率</span></div>}
                </>
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
              <ComposedChart data={efficiencyData} margin={{ left: -20, right: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6DED6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#B7ADA4' }} tickFormatter={(val) => (daysDiff > 28 ? `${String(val).slice(5)}月` : String(val).slice(5).replace('-', '/'))} interval={daysDiff > 28 ? 0 : 'preserveStartEnd'} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#B7ADA4' }} tickFormatter={(val) => `$${val}`} />
                {daysDiff > 28 && <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#1A1A1A' }} tickFormatter={(val) => `${val}%`} />}
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', padding: '12px' }} itemStyle={{ fontSize: '11px', fontWeight: 'bold' }} formatter={(value: number, name: string) => {
                  if (name === 'savingsRate' && daysDiff <= 28) return [];
                  return [name === 'amount' ? `$${value.toLocaleString()}` : `${value}%`, name === 'amount' ? (daysDiff > 28 ? '日均支出' : '支出') : '儲蓄率'];
                }} labelFormatter={(label) => (daysDiff > 28 ? String(label).replace('-', '年 ') + '月' : String(label).replace(/-/g, '/'))} />
                <Bar yAxisId="left" dataKey="amount" fill="#D08C70" radius={[4, 4, 0, 0]} barSize={daysDiff > 28 ? 12 : 8} />
                {daysDiff > 28 && (
                  <>
                    <ReferenceLine yAxisId="right" y={20} stroke="#1A1A1A" strokeDasharray="3 3" strokeOpacity={0.2} />
                    <Line yAxisId="right" type="monotone" dataKey="savingsRate" stroke="#1A1A1A" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: '#1A1A1A' }} activeDot={{ r: 5 }} />
                  </>
                )}
              </ComposedChart>
            ) : (
              <AreaChart data={dailyTrendData} margin={{ left: -20, right: 10 }}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#729B79" stopOpacity={0.2} /><stop offset="95%" stopColor="#729B79" stopOpacity={0} /></linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#D66D5B" stopOpacity={0.2} /><stop offset="95%" stopColor="#D66D5B" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6DED6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#B7ADA4' }} tickFormatter={(val) => String(val).slice(5).replace('-', '/')} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 'bold', fill: '#B7ADA4' }} tickFormatter={(val) => `$${val}`} />
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
          <h4 className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest mb-8">支出結構</h4>
          <div className="relative w-full h-64">
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <span className="text-[9px] font-black text-[#B7ADA4] uppercase tracking-[0.2em] mb-1">總支出</span>
              <span className="text-2xl font-black text-[#1A1A1A]">${stats.expense.toLocaleString()}</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expensePieData} innerRadius={70} outerRadius={90} paddingAngle={6} dataKey="value" cx="50%" cy="50%" stroke="none">
                  {expensePieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-3 custom-card p-8 rounded-[2.5rem]">
          <h4 className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest mb-6">支出分類明細</h4>
          <div className="space-y-5 max-h-[320px] overflow-y-auto no-scrollbar pr-2">
            {expensePieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[#B7ADA4] font-bold italic text-sm py-12">此區間沒有支出資料</div>
            ) : (
              expensePieData.map((item, idx) => (
                <div key={idx} className="group">
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#FAF7F2]">{renderIcon(item.icon, item.color, 18)}</div>
                      <span className="text-xs font-black text-[#1A1A1A]">{item.name}</span>
                      <span className="text-[9px] font-bold text-[#B7ADA4]">{item.percentage}%</span>
                    </div>
                    <span className="text-xs font-black text-[#1A1A1A]">${item.value.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#FAF7F2] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${item.percentage}%`, backgroundColor: item.color }} /></div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 custom-card p-8 rounded-[2.5rem] flex flex-col items-center">
          <h4 className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest mb-8">收入結構</h4>
          <div className="relative w-full h-64">
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <span className="text-[9px] font-black text-[#B7ADA4] uppercase tracking-[0.2em] mb-1">總收入</span>
              <span className="text-2xl font-black text-[#1A1A1A]">${stats.income.toLocaleString()}</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={incomePieData} innerRadius={70} outerRadius={90} paddingAngle={6} dataKey="value" cx="50%" cy="50%" stroke="none">
                  {incomePieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-3 custom-card p-8 rounded-[2.5rem]">
          <h4 className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest mb-6">收入分類明細</h4>
          <div className="space-y-5 max-h-[320px] overflow-y-auto no-scrollbar pr-2">
            {incomePieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[#B7ADA4] font-bold italic text-sm py-12">此區間沒有收入資料</div>
            ) : (
              incomePieData.map((item, idx) => (
                <div key={idx} className="group">
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#FAF7F2]">{renderIcon(item.icon, item.color, 18)}</div>
                      <span className="text-xs font-black text-[#1A1A1A]">{item.name}</span>
                      <span className="text-[9px] font-bold text-[#B7ADA4]">{item.percentage}%</span>
                    </div>
                    <span className="text-xs font-black text-[#729B79]">+${item.value.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#FAF7F2] rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${item.percentage}%`, backgroundColor: item.color }} /></div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analysis;
