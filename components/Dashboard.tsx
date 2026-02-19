import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown, Calendar, Sparkles, X } from 'lucide-react';
import type { Account, BudgetItem, Category, DisplayRange, SpendingScope, Transaction } from '../types';
import { SUPPORTED_CURRENCIES } from '../types';
import { getFinancialAdvice } from '../services/geminiService';

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
  const [advice, setAdvice] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showDateMenu, setShowDateMenu] = useState(false);
  const [showAdviceModal, setShowAdviceModal] = useState(false);
  const adviceCacheRef = useRef<{ key: string; text: string } | null>(null);

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

  const getCurrentAdvice = useCallback(async () => {
    const expenseTransactions = transactions.filter((tx) => tx.type === 'expense');
    const expenseCurrencyCount = expenseTransactions.reduce((acc, tx) => {
      acc[tx.currencyCode] = (acc[tx.currencyCode] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const currencyEntries = Object.entries(expenseCurrencyCount) as Array<[string, number]>;
    const dominantExpenseCode = currencyEntries.sort((a, b) => b[1] - a[1])[0]?.[0] || periodStats.code;

    const dominantBudget = budgetInfo
      .filter((b) => b.currencyCode === dominantExpenseCode)
      .reduce((sum, b) => sum + b.amount, 0);

    const budgetContexts = budgetInfo.map((b) => ({
      name: b.name,
      currencyCode: b.currencyCode,
      amount: b.amount,
      expense: b.expense,
      progress: b.progress,
      isOver: b.isOver,
      scopeNames: b.scopeSummary,
      scopeIds: b.scopeIds,
      period: b.period,
    }));

    const cacheKey = JSON.stringify({
      tx: expenseTransactions.map((tx) => [tx.id, tx.amount, tx.category, tx.scopeId || 'scope_personal', tx.currencyCode]),
      budgets: budgetContexts.map((b) => [b.name, b.currencyCode, b.amount, Math.round(b.expense), Math.round(b.progress), b.scopeIds.join(','), b.period]),
      dominantBudget,
    });

    if (adviceCacheRef.current?.key === cacheKey) {
      setAdvice(adviceCacheRef.current.text);
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await getFinancialAdvice(expenseTransactions, dominantBudget, budgetContexts);
      adviceCacheRef.current = { key: cacheKey, text: result };
      setAdvice(result);
    } catch {
      setAdvice('目前無法分析，請稍後再試。');
    } finally {
      setIsAnalyzing(false);
    }
  }, [budgetInfo, periodStats.code, transactions]);

  const handleGetAdvice = async () => {
    await getCurrentAdvice();
  };

  const getRangeLabel = () => {
    switch (displayRange) {
      case 'all':
        return '全部';
      case 'week':
        return '近 7 天';
      case 'month':
        return '本月';
      case 'custom':
        return '自訂區間';
      default:
        return '本月';
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

      <button
        type="button"
        onClick={() => setShowAdviceModal(true)}
        className="fixed right-5 bottom-[calc(3.4rem+env(safe-area-inset-bottom))] z-[45] h-12 w-12 rounded-full bg-[#1A1A1A] text-white shadow-2xl flex items-center justify-center"
        title="AI 理財分析"
      >
        <Sparkles size={18} />
      </button>

      {showAdviceModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pt-safe pb-safe">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAdviceModal(false)} />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-[#E6DED6] bg-white shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E6DED6] px-5 py-4">
              <h3 className="font-extrabold text-sm text-[#1A1A1A] flex items-center gap-2"><Sparkles size={16} className="text-[#D08C70]" />AI 理財建議</h3>
              <button onClick={() => setShowAdviceModal(false)} className="text-[#B7ADA4] hover:text-[#1A1A1A]"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[13px] font-bold text-[#1A1A1A] whitespace-pre-line min-h-[78px]">
                {advice || '點下方按鈕，取得 AI 分析後的理財建議。'}
              </p>
              <button onClick={handleGetAdvice} disabled={isAnalyzing} className="w-full h-11 rounded-xl bg-[#1A1A1A] text-white text-xs font-black">
                {isAnalyzing ? '分析中...' : '重新分析'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

