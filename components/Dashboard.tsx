import React, { useMemo, useState } from 'react';
import { ChevronDown, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Account, BudgetItem, Category, DisplayRange, SpendingScope, Transaction } from '../types';
import { SUPPORTED_CURRENCIES } from '../types';

interface DashboardProps {
  transactions: Transaction[];
  allTransactions: Transaction[];
  accounts: Account[];
  budgets: BudgetItem[];
  categories: Category[];
  scopes: SpendingScope[];
  displayRange: DisplayRange;
  setDisplayRange: (range: DisplayRange) => void;
  customStart: string;
  setCustomStart: (date: string) => void;
  customEnd: string;
  setCustomEnd: (date: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  transactions,
  allTransactions,
  budgets,
  scopes,
  displayRange,
  setDisplayRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
}) => {
  const [showDateMenu, setShowDateMenu] = useState(false);

  const scopeMap = useMemo(() => {
    const m: Record<string, string> = { all: '全部用途', scope_personal: '個人' };
    scopes.forEach((s) => {
      m[s.id] = s.name;
    });
    return m;
  }, [scopes]);

  const periodLabel = useMemo(
    () => ({ week: '每週', month: '每月', year: '每年' } as const),
    []
  );

  const periodStats = useMemo(() => {
    let income = 0;
    let expense = 0;

    const codes = transactions.map((t) => t.currencyCode);
    const dominant =
      codes.sort((a, b) => codes.filter((v) => v === a).length - codes.filter((v) => v === b).length).pop() || 'TWD';
    const symbol = SUPPORTED_CURRENCIES.find((c) => c.code === dominant)?.symbol || '$';

    transactions.forEach((t) => {
      if (t.currencyCode === dominant) {
        if (t.type === 'income') income += t.amount;
        if (t.type === 'expense') expense += t.amount;
      }
    });

    return { income, expense, net: income - expense, symbol, code: dominant };
  }, [transactions]);

  const formatDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const parseYearMonth = (value: string): { year: number; month: number } | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 0 || month > 11) return null;
    return { year, month };
  };

  const resolveActiveMonth = () => {
    if (displayRange === 'custom') {
      const parsed = parseYearMonth(customStart);
      if (parsed) return parsed;
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  };

  const shiftNaturalMonth = (delta: number) => {
    const base = resolveActiveMonth();
    const firstDay = new Date(base.year, base.month + delta, 1);
    const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
    setCustomStart(formatDate(firstDay));
    setCustomEnd(formatDate(lastDay));
    setDisplayRange('custom');
    setShowDateMenu(false);
  };

  const getPeriodRange = (period: BudgetItem['period']) => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (period === 'week') {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(now.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    if (period === 'year') {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  const budgetInfo = useMemo(() => {
    return budgets.map((budget) => {
      const scopeIds = budget.scopeIds?.length ? budget.scopeIds : ['all'];
      const { start, end } = getPeriodRange(budget.period || 'month');

      const expense = allTransactions
        .filter((t) => t.type === 'expense' && t.currencyCode === budget.currencyCode)
        .filter((t) => {
          const txDate = new Date(t.date);
          return txDate >= start && txDate <= end;
        })
        .filter((t) => {
          if (scopeIds.includes('all')) return true;
          const txScope = t.scopeId || 'scope_personal';
          return scopeIds.includes(txScope);
        })
        .reduce((sum, t) => sum + t.amount, 0);

      const progress = budget.amount > 0 ? Math.min((expense / budget.amount) * 100, 100) : 0;
      const currency = SUPPORTED_CURRENCIES.find((c) => c.code === budget.currencyCode);
      const scopeSummary =
        scopeIds.includes('all')
          ? '全部用途'
          : scopeIds.map((id) => scopeMap[id] || id).join('、');

      return {
        ...budget,
        expense,
        progress,
        isOver: expense > budget.amount,
        symbol: currency?.symbol || '$',
        scopeSummary,
      };
    });
  }, [allTransactions, budgets, scopeMap]);

  const getRangeLabel = () => {
    const monthLabel = (year: number, month: number) => `${year}/${String(month + 1).padStart(2, '0')}`;
    const parseYmd = (value: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!m) return null;
      const year = Number(m[1]);
      const month = Number(m[2]) - 1;
      const day = Number(m[3]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
      return { year, month, day };
    };
    const isNaturalMonthRange = (start: string, end: string) => {
      const s = parseYmd(start);
      const e = parseYmd(end);
      if (!s || !e) return null;
      if (s.year !== e.year || s.month !== e.month || s.day !== 1) return null;
      const lastDay = new Date(s.year, s.month + 1, 0).getDate();
      if (e.day !== lastDay) return null;
      return { year: s.year, month: s.month };
    };

    switch (displayRange) {
      case 'all':
        return '全部';
      case 'week':
        return '近 7 天';
      case 'month': {
        const now = new Date();
        return monthLabel(now.getFullYear(), now.getMonth());
      }
      case 'custom': {
        const naturalMonth = isNaturalMonthRange(customStart, customEnd);
        return naturalMonth ? monthLabel(naturalMonth.year, naturalMonth.month) : '自訂區間';
      }
      default:
        return '近 7 天';
    }
  };

  return (
    <div className="space-y-6 mb-8">
      <div className="bg-[#1A1A1A] p-6 md:p-8 rounded-[2.5rem] text-[#FAF7F2] shadow-xl shadow-black/10 relative overflow-visible group z-20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#D08C70] opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

        <div className="relative z-10 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-[10px] font-black text-[#B7ADA4] uppercase tracking-[0.2em] flex items-center gap-2 mb-1">
                <Calendar size={12} className="text-[#D08C70]" />
                本期統計
              </h2>
              <p className="text-xs font-bold text-[#6B6661]">{periodStats.code}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => shiftNaturalMonth(-1)}
                className="h-8 w-8 rounded-xl text-white/80 hover:text-white transition-all"
                title="上一個月"
              >
                <ChevronLeft size={14} className="mx-auto" />
              </button>

              <div className="relative">
                <button onClick={() => setShowDateMenu(!showDateMenu)} className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-xl border border-white/10 text-xs font-black text-white hover:bg-white/20 transition-all backdrop-blur-sm">
                  {getRangeLabel()}
                  <ChevronDown size={14} className={`text-white/50 transition-transform ${showDateMenu ? 'rotate-180' : ''}`} />
                </button>

                {showDateMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowDateMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-[#E6DED6] p-2 z-20 animate-in zoom-in-95 origin-top-right text-[#1A1A1A]">
                      {(['month', 'week', 'all', 'custom'] as DisplayRange[]).map((r) => (
                        <button key={r} onClick={() => { setDisplayRange(r); if (r !== 'custom') setShowDateMenu(false); }} className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-black transition-all ${displayRange === r ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6661] hover:bg-[#FAF7F2]'}`}>
                          {r === 'all' ? '全部' : r === 'week' ? '近 7 天' : r === 'month' ? '本月' : '自訂區間'}
                        </button>
                      ))}

                      {displayRange === 'custom' && (
                        <div className="mt-2 pt-2 border-t border-[#E6DED6] space-y-2 p-1">
                          <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-full text-[10px] p-2 bg-[#FAF7F2] rounded-lg border border-[#E6DED6] font-bold" />
                          <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-full text-[10px] p-2 bg-[#FAF7F2] rounded-lg border border-[#E6DED6] font-bold" />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => shiftNaturalMonth(1)}
                className="h-8 w-8 rounded-xl text-white/80 hover:text-white transition-all"
                title="下一個月"
              >
                <ChevronRight size={14} className="mx-auto" />
              </button>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center pb-4 border-b border-white/10">
              <span className="text-sm font-black text-[#B7ADA4]">結餘</span>
              <span className={`text-3xl font-black tracking-tighter ${periodStats.net >= 0 ? 'text-white' : 'text-[#D66D5B]'}`}>
                {periodStats.symbol}
                {periodStats.net.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#729B79]"></div>
                <span className="text-xs font-black text-[#B7ADA4]">收入</span>
              </div>
              <span className="text-lg font-black text-[#729B79]">{periodStats.symbol}{periodStats.income.toLocaleString()}</span>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#D66D5B]"></div>
                <span className="text-xs font-black text-[#B7ADA4]">支出</span>
              </div>
              <span className="text-lg font-black text-[#D66D5B]">{periodStats.symbol}{periodStats.expense.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {budgetInfo.length > 0 && (
        <div className="space-y-4">
          {budgetInfo.map((info) => (
            <div key={info.id} className="custom-card p-6 rounded-[2rem] overflow-hidden relative">
              <div className="flex justify-between items-end mb-4 gap-3">
                <div>
                  <p className="text-[9px] font-extrabold text-[#D08C70] uppercase tracking-widest mb-1">{info.name}</p>
                  <h2 className="text-2xl font-black text-[#1A1A1A]">
                    {info.symbol}{info.expense.toLocaleString()} <span className="text-xs font-bold text-[#B7ADA4]">/ {info.symbol}{info.amount.toLocaleString()}</span>
                  </h2>
                  <p className="text-[10px] font-black text-[#B7ADA4] mt-1">{periodLabel[info.period]} · {info.scopeSummary} · {info.currencyCode}</p>
                </div>
                <div className={`text-[10px] font-black px-3 py-1 rounded-full ${info.isOver ? 'bg-red-100 text-red-500' : 'bg-green-100 text-green-600'}`}>
                  {info.isOver ? '超支' : `${Math.round(info.progress)}%`}
                </div>
              </div>
              <div className="w-full h-2 bg-[#FAF7F2] rounded-full overflow-hidden border border-[#E6DED6]">
                <div className={`h-full transition-all duration-1000 ease-out rounded-full ${info.isOver ? 'bg-red-400' : 'bg-[#D08C70]'}`} style={{ width: `${info.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};

export default Dashboard;




