import React, { useMemo, useState } from 'react';
import { ChevronDown, Calendar } from 'lucide-react';
import type { Account, Category, DisplayRange, Transaction } from '../types';
import { SUPPORTED_CURRENCIES } from '../types';
import { getFinancialAdvice } from '../services/geminiService';

interface DashboardProps {
  transactions: Transaction[];
  accounts: Account[];
  budgets: Record<string, number>;
  categories: Category[];
  displayRange: DisplayRange;
  setDisplayRange: (range: DisplayRange) => void;
  customStart: string;
  setCustomStart: (date: string) => void;
  customEnd: string;
  setCustomEnd: (date: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  transactions,
  accounts,
  budgets,
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

  const expensesByCurrency = useMemo(() => {
    const totals: Record<string, number> = {};
    transactions.filter((t) => t.type === 'expense').forEach((t) => {
      totals[t.currencyCode] = (totals[t.currencyCode] || 0) + t.amount;
    });
    return totals;
  }, [transactions]);

  const periodStats = useMemo(() => {
    let income = 0;
    let expense = 0;

    const codes = transactions.map((t) => t.currencyCode);
    const dominant = codes.sort((a, b) => codes.filter((v) => v === a).length - codes.filter((v) => v === b).length).pop() || 'TWD';
    const symbol = SUPPORTED_CURRENCIES.find((c) => c.code === dominant)?.symbol || '$';

    transactions.forEach((t) => {
      if (t.currencyCode === dominant) {
        if (t.type === 'income') income += t.amount;
        if (t.type === 'expense') expense += t.amount;
      }
    });

    return { income, expense, net: income - expense, symbol, code: dominant };
  }, [transactions]);

  const budgetInfo = useMemo(() => {
    return Object.entries(budgets).map(([code, limit]) => {
      const expense = expensesByCurrency[code] || 0;
      const progress = limit > 0 ? Math.min((expense / limit) * 100, 100) : 0;
      const currency = SUPPORTED_CURRENCIES.find((c) => c.code === code);
      return { code, limit, expense, progress, isOver: expense > limit, symbol: currency?.symbol || '$' };
    });
  }, [budgets, expensesByCurrency]);

  const handleGetAdvice = async () => {
    setIsAnalyzing(true);
    const mainBudget = budgetInfo[0]?.limit || 15000;
    const result = await getFinancialAdvice(transactions, mainBudget);
    setAdvice(result);
    setIsAnalyzing(false);
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
              <span className="text-lg font-black text-[#729B79]">
                {periodStats.symbol}
                {periodStats.income.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#D66D5B]"></div>
                <span className="text-xs font-black text-[#B7ADA4]">支出</span>
              </div>
              <span className="text-lg font-black text-[#D66D5B]">
                {periodStats.symbol}
                {periodStats.expense.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {budgetInfo.length > 0 && (
        <div className="space-y-4">
          {budgetInfo.map((info) => (
            <div key={info.code} className="custom-card p-6 rounded-[2rem] overflow-hidden relative">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-[9px] font-extrabold text-[#D08C70] uppercase tracking-widest mb-1">{info.code} 預算進度</p>
                  <h2 className="text-2xl font-black text-[#1A1A1A]">
                    {info.symbol}
                    {info.expense.toLocaleString()} <span className="text-xs font-bold text-[#B7ADA4]">/ {info.symbol}{info.limit.toLocaleString()}</span>
                  </h2>
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

      <div className="custom-card p-8 rounded-[2.5rem] flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">AI</span>
            <h3 className="font-extrabold text-[10px] text-[#D08C70] uppercase tracking-widest">AI 理財建議</h3>
          </div>
          <p className="text-[13px] font-bold text-[#1A1A1A] opacity-90 leading-relaxed min-h-[60px]">
            {advice || '點擊下方按鈕，取得 AI 分析後的理財建議。'}
          </p>
        </div>
        <button onClick={handleGetAdvice} disabled={isAnalyzing} className="mt-6 w-full py-3 rounded-2xl border-2 border-[#D08C70] text-[#D08C70] font-extrabold text-[10px] uppercase tracking-widest hover:bg-[#D08C70] hover:text-white transition-all tap-active">
          {isAnalyzing ? '分析中...' : '取得 AI 建議'}
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
