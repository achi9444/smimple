
import React, { useEffect, useMemo, useState } from 'react';
import { Home, Wallet, PieChart, Settings, Download, Upload, RefreshCw, PiggyBank } from 'lucide-react';
import TransactionForm from '../components/TransactionForm';
import TransactionList from '../components/TransactionList';
import Dashboard from '../components/Dashboard';
import CategoryManager from '../components/CategoryManager';
import AccountManager from '../components/AccountManager';
import Analysis from '../components/Analysis';
import SavingAssistant from '../components/SavingAssistant';
import ScopeManager from '../components/ScopeManager';
import BudgetManager from '../components/BudgetManager';
import { canUse, getBucketLimit } from '../services/featureGate';
import { buildAutoAllocations, getAvailableByAccount, getBucketAccountSpendable, getBucketTotals, getReservedByAccount } from '../services/savingAllocator';
import { Transaction, Account, Category, DisplayRange, PlanTier, SavingBucket, BucketAllocation, BucketSpend, IncomeAllocationRule, SpendingScope, BudgetItem, DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, DEFAULT_SCOPES } from '../types';
import { AppStorageData, clearAppStorage, loadAppStorage, saveAppStorage, loadLearnedPrefsStorage, saveLearnedPrefsStorage } from '../services/appStorage';

const App: React.FC = () => {
  // --- Single Source of Truth for All Data ---
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>(DEFAULT_ACCOUNTS);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [scopes, setScopes] = useState<SpendingScope[]>(DEFAULT_SCOPES);
  const [budgets, setBudgets] = useState<BudgetItem[]>([{ id: 'budget_TWD', name: '每月預算', currencyCode: 'TWD', amount: 15000, period: 'month', scopeIds: ['all'] }]);
  const [planTier, setPlanTier] = useState<PlanTier>('mvp');
  const [savingBuckets, setSavingBuckets] = useState<SavingBucket[]>([]);
  const [bucketAllocations, setBucketAllocations] = useState<BucketAllocation[]>([]);
  const [bucketSpends, setBucketSpends] = useState<BucketSpend[]>([]);
  const [incomeRules, setIncomeRules] = useState<IncomeAllocationRule[]>([]);
  
  // Date Filter State
  const [displayRange, setDisplayRange] = useState<DisplayRange>('month');
  
  const [storageReady, setStorageReady] = useState(false);
  // Helper to get local date string YYYY-MM-DD
  const getLocalDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
const normalizeLearnedDesc = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '')
      .replace(/[.,!?，。！？、:;：；'"`~@#$%^&*()_+=\-[\]{}<>\\/|]/g, '');

  const makeLearnedPrefKey = (type: Transaction['type'], description: string) => `${type}::${normalizeLearnedDesc(description)}`;

  const persistLearnedPrefFromTransaction = (tx: Transaction) => {
    const desc = (tx.description || '').trim();
    if (!desc) return;
    const key = makeLearnedPrefKey(tx.type, desc);
    void loadLearnedPrefsStorage()
      .then((prev) => {
        const before = prev[key];
        const next = {
          ...prev,
          [key]: {
            type: tx.type,
            category: tx.category,
            accountId: tx.accountId,
            toAccountId: tx.toAccountId,
            updatedAt: Date.now(),
            useCount: (before?.useCount ?? 0) + 1,
          },
        };
        return saveLearnedPrefsStorage(next);
      })
      .catch((err) => {
        console.error('Failed to persist learned pref from edited transaction.', err);
      });
  };


  const normalizeBudgetItems = (raw: unknown): BudgetItem[] => {
    if (Array.isArray(raw)) {
      return raw
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          id: typeof item.id === 'string' && item.id ? item.id : `budget_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : '每月預算',
          currencyCode: typeof item.currencyCode === 'string' && item.currencyCode ? item.currencyCode : 'TWD',
          amount: Number.isFinite(Number(item.amount)) ? Math.max(0, Number(item.amount)) : 0,
          period: item.period === 'week' || item.period === 'year' ? item.period : 'month',
          scopeIds:
            Array.isArray(item.scopeIds) && item.scopeIds.length
              ? (item.scopeIds.filter((id) => id === 'all' || typeof id === 'string') as Array<'all' | string>)
              : item.scopeId === 'all' || typeof item.scopeId === 'string'
                ? [item.scopeId as 'all' | string]
                : ['all'],
        }));
    }

    if (raw && typeof raw === 'object') {
      return Object.entries(raw as Record<string, unknown>).map(([currencyCode, amount]) => ({
        id: `budget_${currencyCode}`,
        name: '每月預算',
        currencyCode,
        amount: Number.isFinite(Number(amount)) ? Math.max(0, Number(amount)) : 0,
        period: 'month',
        scopeIds: ['all'],
      }));
    }

    return [];
  };
  const [customStart, setCustomStart] = useState(() => {
    const now = new Date();
    return getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [customEnd, setCustomEnd] = useState(() => getLocalDateString(new Date()));

  const [activeTab, setActiveTab] = useState<'home' | 'accounts' | 'jar' | 'charts' | 'settings'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  
  const bucketLimit = getBucketLimit(planTier);
  const canUseAutoRules = canUse('auto_income_rules', planTier);

  const reservedByAccount = useMemo(
    () => getReservedByAccount(accounts, bucketAllocations, bucketSpends),
    [accounts, bucketAllocations, bucketSpends]
  );
  const availableByAccount = useMemo(
    () => getAvailableByAccount(accounts, bucketAllocations, bucketSpends),
    [accounts, bucketAllocations, bucketSpends]
  );
  const bucketTotals = useMemo(
    () => getBucketTotals(savingBuckets, bucketAllocations, bucketSpends),
    [savingBuckets, bucketAllocations, bucketSpends]
  );
  const bucketSpendableByAccount = useMemo(
    () => getBucketAccountSpendable(savingBuckets, accounts, bucketAllocations, bucketSpends),
    [savingBuckets, accounts, bucketAllocations, bucketSpends]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const defaults: AppStorageData = {
        transactions: [],
        accounts: DEFAULT_ACCOUNTS,
        categories: DEFAULT_CATEGORIES,
        scopes: DEFAULT_SCOPES,
        budgets: [{ id: 'budget_TWD', name: '每月預算', currencyCode: 'TWD', amount: 15000, period: 'month', scopeIds: ['all'] }],
        displayRange: 'month',
        planTier: 'mvp',
        savingBuckets: [],
        bucketAllocations: [],
        bucketSpends: [],
        incomeRules: [],
      };

      try {
        const loaded = await loadAppStorage(defaults);
        if (cancelled) return;
        setTransactions(loaded.transactions);
        setAccounts(loaded.accounts);
        setCategories(loaded.categories);
        setScopes(loaded.scopes);
        setBudgets(normalizeBudgetItems(loaded.budgets));
        setDisplayRange(loaded.displayRange);
        setPlanTier(loaded.planTier);
        setSavingBuckets(loaded.savingBuckets);
        setBucketAllocations(loaded.bucketAllocations);
        setBucketSpends(loaded.bucketSpends);
        setIncomeRules(loaded.incomeRules);
      } catch (err) {
        console.error('Failed to load local database, fallback to defaults.', err);
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist Data
  useEffect(() => {
    if (!storageReady) return;

    void saveAppStorage({
      transactions,
      accounts,
      categories,
      scopes,
      budgets,
      displayRange,
      planTier,
      savingBuckets,
      bucketAllocations,
      bucketSpends,
      incomeRules,
    });
  }, [storageReady, transactions, accounts, categories, scopes, budgets, displayRange, planTier, savingBuckets, bucketAllocations, bucketSpends, incomeRules]);

  const addManualBucketAllocation = (bucketId: string, accountId: string, amount: number) => {
    if (!savingBuckets.some((b) => b.id === bucketId) || !accounts.some((a) => a.id === accountId)) return;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const accountAvailable = availableByAccount[accountId] ?? 0;
    if (amount > accountAvailable) return;

    setBucketAllocations((prev) => [
      ...prev,
      {
        id: `ba_manual_${Date.now().toString(36)}`,
        bucketId,
        accountId,
        amount,
        source: 'manual',
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const removeLinkedAutoAllocations = (transactionId: string) => {
    setBucketAllocations((prev) => prev.filter((a) => a.linkedTransactionId !== transactionId));
  };
  const removeLinkedBucketSpends = (transactionId: string) => {
    setBucketSpends((prev) => prev.filter((s) => s.linkedTransactionId !== transactionId));
  };

  const getBucketSpendableAmount = (bucketId: string) => {
    return bucketTotals[bucketId] || 0;
  };

  // --- Core Logic: Add ---

  const handleAddTransaction = (newTx: Omit<Transaction, 'id'>) => {
    if (newTx.type === 'expense' && newTx.bucketId) {
      const spendable = getBucketSpendableAmount(newTx.bucketId);
      if (spendable < newTx.amount) {
        console.warn('Bucket has insufficient balance for this expense.');
        return;
      }
    }

    const tx: Transaction = { ...newTx, id: Date.now().toString(36) };
    
    // Update accounts with explicit logic ensuring source is deducted
    setAccounts(prev => prev.map(acc => {
      let newBalance = acc.balance;

      // 1. Handle Source Account (Income, Expense, Transfer Out)
      if (acc.id === tx.accountId) {
        if (tx.type === 'income') {
          newBalance += tx.amount;
        } else {
          // Both 'expense' and 'transfer' (source) deduct money
          newBalance -= tx.amount;
        }
      }

      // 2. Handle Target Account (Transfer In)
      // Note: We use separate if statements to support self-transfers correctly (though rare)
      if (tx.type === 'transfer' && tx.toAccountId === acc.id) {
        newBalance += tx.amount;
      }

      return { ...acc, balance: newBalance };
    }));

    setTransactions(prev => [tx, ...prev].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

    if (tx.type === 'income' && canUseAutoRules) {
      const auto = buildAutoAllocations(tx.id, tx.accountId, tx.amount, incomeRules, savingBuckets);
      if (auto.length > 0) {
        const accountAvailable = availableByAccount[tx.accountId] ?? 0;
        const totalAuto = auto.reduce((sum, a) => sum + a.amount, 0);
        if (totalAuto <= accountAvailable + tx.amount) {
          setBucketAllocations((prev) => [...prev, ...auto]);
        }
      }
    }
    if (tx.type === 'expense' && tx.bucketId) {
      setBucketSpends((prev) => [
        ...prev,
        {
          id: `bs_${tx.id}`,
          bucketId: tx.bucketId as string,
          accountId: tx.accountId,
          amount: tx.amount,
          linkedTransactionId: tx.id,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  };

  // --- Core Logic: Delete (Single Source of Truth) ---

  const handleDeleteTransaction = (tx: Transaction) => {
    if (!tx || typeof tx !== 'object' || !tx.id) {
      console.error('Invalid transaction object passed to delete handler', tx);
      return;
    }
    
    setAccounts(prevAccounts => {
      return prevAccounts.map(acc => {
        let newBalance = acc.balance;

        // Revert Source Account
        if (acc.id === tx.accountId) {
          if (tx.type === 'income') {
            // Reverting income means subtracting
            newBalance -= tx.amount;
          } else {
            // Reverting expense or transfer out means adding back
            newBalance += tx.amount;
          }
        }

        // Revert Target Account (for transfers)
        if (tx.type === 'transfer' && tx.toAccountId && acc.id === tx.toAccountId) {
          // Reverting transfer in means subtracting
          newBalance -= tx.amount;
        }

        return { ...acc, balance: newBalance };
      });
    });

    setTransactions(prev => prev.filter(t => t.id !== tx.id));
    removeLinkedAutoAllocations(tx.id);
    removeLinkedBucketSpends(tx.id);
  };

  const handleDeleteAccount = (id: string) => {
    if (!id) return;

    const hasDependencies = transactions.some(t => t.accountId === id || t.toAccountId === id);
    if (hasDependencies) {
      console.warn('Cannot delete account because it is used by existing transactions.');
      return;
    }

    setAccounts(prev => {
      if (prev.length <= 1) {
        console.warn('Cannot delete the last remaining account.');
        return prev;
      }
      return prev.filter(a => a.id !== id);
    });
    setBucketAllocations((prev) => prev.filter((a) => a.accountId !== id));
    setBucketSpends((prev) => prev.filter((s) => s.accountId !== id));
  };

  // NEW: Centralized Category Deletion Logic
  const handleDeleteCategory = (id: string) => {
    if (!id) return;
    setCategories(prev => prev.filter(c => c.id !== id));
  };
  const handleDeleteScope = (id: string) => {
    if (!id || id === 'scope_personal') return;
    setScopes((prev) => prev.filter((s) => s.id !== id));
    setTransactions((prev) =>
      prev.map((tx) => (tx.scopeId === id ? { ...tx, scopeId: 'scope_personal' } : tx))
    );
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => {
    const oldTx = transactions.find((t) => t.id === updatedTx.id);
    if (!oldTx) return;

    setAccounts((currentAccounts) =>
      currentAccounts.map((acc) => {
        let newBalance = acc.balance;

        if (acc.id === oldTx.accountId) {
          if (oldTx.type === 'income') newBalance -= oldTx.amount;
          else newBalance += oldTx.amount;
        }
        if (oldTx.type === 'transfer' && oldTx.toAccountId === acc.id) {
          newBalance -= oldTx.amount;
        }

        if (acc.id === updatedTx.accountId) {
          if (updatedTx.type === 'income') newBalance += updatedTx.amount;
          else newBalance -= updatedTx.amount;
        }
        if (updatedTx.type === 'transfer' && updatedTx.toAccountId === acc.id) {
          newBalance += updatedTx.amount;
        }

        return { ...acc, balance: newBalance };
      })
    );

    setTransactions((currentTransactions) =>
      currentTransactions
        .map((t) => (t.id === updatedTx.id ? updatedTx : t))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    );

    persistLearnedPrefFromTransaction(updatedTx);

    removeLinkedAutoAllocations(updatedTx.id);
    removeLinkedBucketSpends(updatedTx.id);
    if (updatedTx.type === 'income' && canUseAutoRules) {
      const auto = buildAutoAllocations(updatedTx.id, updatedTx.accountId, updatedTx.amount, incomeRules, savingBuckets);
      if (auto.length > 0) {
        setBucketAllocations((prev) => [...prev, ...auto]);
      }
    }
    if (updatedTx.type === 'expense' && updatedTx.bucketId) {
      const isSameBucketAccount =
        oldTx.type === 'expense' &&
        oldTx.bucketId === updatedTx.bucketId &&
        oldTx.accountId === updatedTx.accountId;
      const spendable = getBucketSpendableAmount(updatedTx.bucketId) + (isSameBucketAccount ? oldTx.amount : 0);
      if (spendable >= updatedTx.amount) {
        setBucketSpends((prev) => [
          ...prev,
          {
            id: `bs_${updatedTx.id}`,
            bucketId: updatedTx.bucketId as string,
            accountId: updatedTx.accountId,
            amount: updatedTx.amount,
            linkedTransactionId: updatedTx.id,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    }
  };

  const handleAddBucket = (name: string, targetAmount: number, color: string) => {
    if (!name.trim()) return;
    if (Number.isFinite(bucketLimit) && savingBuckets.length >= bucketLimit) return;
    const newBucket: SavingBucket = {
      id: `bucket_${Date.now().toString(36)}`,
      name: name.trim(),
      targetAmount: Math.max(0, targetAmount),
      color,
      priority: savingBuckets.length + 1,
    };
    setSavingBuckets((prev) => [...prev, newBucket]);
  };

  const handleDeleteBucket = (bucketId: string) => {
    setSavingBuckets((prev) => prev.filter((b) => b.id !== bucketId));
    setBucketAllocations((prev) => prev.filter((a) => a.bucketId !== bucketId));
    setBucketSpends((prev) => prev.filter((s) => s.bucketId !== bucketId));
    setIncomeRules((prev) => prev.filter((r) => r.bucketId !== bucketId));
  };

  const handleUpdateBucketTarget = (bucketId: string, targetAmount: number) => {
    setSavingBuckets((prev) =>
      prev.map((bucket) => (bucket.id === bucketId ? { ...bucket, targetAmount: Math.max(0, targetAmount) } : bucket))
    );
  };

  const handleDeleteAllocation = (allocationId: string) => {
    setBucketAllocations((prev) => prev.filter((a) => a.id !== allocationId));
  };

  const handleUpsertIncomeRule = (bucketId: string, sourceAccountId: string, type: 'percent' | 'fixed', value: number) => {
    if (!canUseAutoRules) return;
    if (!accounts.some((acc) => acc.id === sourceAccountId)) return;
    const normalizedValue = type === 'percent' ? Math.min(100, Math.max(0, value)) : Math.max(0, value);
    setIncomeRules((prev) => {
      const existing = prev.find(
        (rule) => rule.bucketId === bucketId && rule.sourceAccountId === sourceAccountId && rule.type === type
      );
      if (existing) {
        return prev.map((rule) =>
          rule.id === existing.id
            ? { ...rule, sourceAccountId, type, value: normalizedValue, isActive: true }
            : rule
        );
      }
      return [
        ...prev,
        {
          id: `rule_${Date.now().toString(36)}`,
          bucketId,
          sourceAccountId,
          type,
          value: normalizedValue,
          isActive: true,
        },
      ];
    });
  };

  const handleDeleteIncomeRule = (ruleId: string) => {
    setIncomeRules((prev) => prev.filter((rule) => rule.id !== ruleId));
  };

  const handleExportData = () => {
    const data = {
      transactions,
      accounts,
      categories,
      scopes,
      budgets,
      planTier,
      savingBuckets,
      bucketAllocations,
      bucketSpends,
      incomeRules,
      version: '1.1',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smimple_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.transactions && data.accounts) {
          // Removed confirm/alert for sandbox compatibility
          setTransactions(data.transactions);
          setAccounts(data.accounts);
          if (data.categories) setCategories(data.categories);
          if (Array.isArray(data.scopes)) setScopes(data.scopes);
          if (data.budgets) setBudgets(normalizeBudgetItems(data.budgets));
          if (data.planTier) setPlanTier(data.planTier);
          if (data.savingBuckets) setSavingBuckets(data.savingBuckets);
          if (data.bucketAllocations) setBucketAllocations(data.bucketAllocations);
          if (data.bucketSpends) setBucketSpends(data.bucketSpends);
          if (data.incomeRules) setIncomeRules(data.incomeRules);
          console.log('Import success');
        } else {
          console.error('Import data format error');
        }
      } catch (err) {
        console.error('Import failed, please verify JSON file.');
      }
    };
    reader.readAsText(file);
  };

  // Centralized Filtering Logic
  const filteredTransactions = useMemo(() => {
    let list = transactions;
    const now = new Date();
    const todayStr = getLocalDateString(now);

    if (displayRange === 'week') {
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(now.getDate() - 7);
      const weekStr = getLocalDateString(oneWeekAgo);
      list = list.filter(t => {
        const d = t.date.split('T')[0];
        return d >= weekStr && d <= todayStr;
      });
    } else if (displayRange === 'month') {
      const startOfMonth = getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
      const endOfMonth = getLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      list = list.filter(t => {
        const d = t.date.split('T')[0];
        return d >= startOfMonth && d <= endOfMonth;
      });
    } else if (displayRange === 'custom') {
      list = list.filter(t => {
        const d = t.date.split('T')[0];
        return d >= customStart && d <= customEnd;
      });
    }

    const q = searchQuery.toLowerCase().trim();
    return q ? list.filter(t => t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) : list;
  }, [transactions, searchQuery, displayRange, customStart, customEnd]);
  const navItems = [
    { id: 'home', icon: Home, label: '首頁' },
    { id: 'accounts', icon: Wallet, label: '帳戶' },
    { id: 'jar', icon: PiggyBank, label: '錢罐' },
    { id: 'charts', icon: PieChart, label: '分析' },
    { id: 'settings', icon: Settings, label: '設定' }
  ];

  return (
    <div className="min-h-screen pb-24 pt-safe pb-safe-nav bg-[#FAF7F2]">
      <header className="bg-white/80 backdrop-blur-md border-b border-[#E6DED6] sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-[#D08C70] rounded-xl flex items-center justify-center shadow-lg shadow-[#D08C70]/20">
              <span className="text-white"><Wallet size={18} strokeWidth={2.5} /></span>
            </div>
            <h1 className="text-lg font-black tracking-tighter">Smimple</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-6">
        {activeTab === 'home' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <TransactionForm
              onAdd={handleAddTransaction}
              categories={categories}
              scopes={scopes}
              accounts={accounts}
              savingBuckets={savingBuckets}
              bucketSpendableByAccount={bucketSpendableByAccount}
            />
            
            <Dashboard 
              transactions={filteredTransactions} 
              allTransactions={transactions}
              accounts={accounts} 
              budgets={budgets} 
              categories={categories}
              scopes={scopes}
              displayRange={displayRange}
              setDisplayRange={setDisplayRange}
              customStart={customStart}
              setCustomStart={setCustomStart}
              customEnd={customEnd}
              setCustomEnd={setCustomEnd}
            />

            <div className="relative mb-4">
              <input type="text" placeholder="搜尋描述或分類..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full px-12 py-4 bg-white border border-[#E6DED6] rounded-2xl focus:ring-2 focus:ring-[#D08C70] outline-none font-bold text-sm" />
              <svg className="w-5 h-5 text-[#B7ADA4] absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            
            <TransactionList 
              transactions={filteredTransactions} 
              onDelete={handleDeleteTransaction} 
              onUpdate={handleUpdateTransaction} 
              categories={categories} 
              scopes={scopes}
              accounts={accounts} 
              savingBuckets={savingBuckets}
            />
          </div>
        )}
        {activeTab === 'accounts' && (
          <AccountManager 
            accounts={accounts} 
            reservedByAccount={reservedByAccount}
            availableByAccount={availableByAccount}
            transactions={transactions}
            categories={categories}
            scopes={scopes}
            onUpdate={setAccounts} 
            onDelete={handleDeleteAccount} 
          />
        )}
        {activeTab === 'jar' && canUse('saving_assistant', planTier) && (
          <SavingAssistant
            planTier={planTier}
            bucketLimit={bucketLimit}
            canUseAutoRules={canUseAutoRules}
            accounts={accounts}
            buckets={savingBuckets}
            allocations={bucketAllocations}
            bucketTotals={bucketTotals}
            incomeRules={incomeRules}
            onAddBucket={handleAddBucket}
            onDeleteBucket={handleDeleteBucket}
            onUpdateBucketTarget={handleUpdateBucketTarget}
            onDeleteAllocation={handleDeleteAllocation}
            onUpsertIncomeRule={handleUpsertIncomeRule}
            onDeleteIncomeRule={handleDeleteIncomeRule}
          />
        )}
        {activeTab === 'charts' && <Analysis transactions={transactions} categories={categories} scopes={scopes} accounts={accounts} />}
        {activeTab === 'settings' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
             <div className="custom-card p-6 md:p-8 rounded-[2.5rem]">
               <h3 className="font-extrabold text-[#1A1A1A] text-base mb-4 flex items-center gap-2">
                 <span className="w-1.5 h-6 bg-[#1A1A1A] rounded-full"></span>
                 方案模式
               </h3>
               <div className="grid grid-cols-2 gap-3">
                 <button
                   onClick={() => setPlanTier('mvp')}
                   className={`h-11 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${planTier === 'mvp' ? 'bg-[#1A1A1A] text-white' : 'bg-[#FAF7F2] text-[#6B6661] border border-[#E6DED6]'}`}
                 >
                   MVP
                 </button>
                 <button
                   onClick={() => setPlanTier('pro')}
                   className={`h-11 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${planTier === 'pro' ? 'bg-[#D08C70] text-white' : 'bg-[#FAF7F2] text-[#6B6661] border border-[#E6DED6]'}`}
                 >
                   PRO
                 </button>
               </div>
               <p className="text-[10px] font-bold text-[#B7ADA4] mt-3">目前為本機開關，正式上架時可改為後端訂閱權限。</p>
             </div>

             <BudgetManager budgets={budgets} scopes={scopes} onChange={setBudgets} />

             <CategoryManager 
               categories={categories} 
               onUpdateCategories={setCategories} 
               onDelete={handleDeleteCategory} // Pass the delete handler
             />
             <ScopeManager
               scopes={scopes}
               onUpdateScopes={setScopes}
               onDelete={handleDeleteScope}
             />
             
             <div className="custom-card p-6 md:p-8 rounded-[2.5rem] mb-12">
               <h3 className="font-extrabold text-[#1A1A1A] text-base mb-6 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-[#1A1A1A] rounded-full"></span>
                  資料備份與重置               </h3>
               <div className="grid grid-cols-2 gap-4">
                  <button onClick={handleExportData} className="flex flex-col items-center justify-center p-6 bg-[#FAF7F2] border-2 border-[#E6DED6] rounded-2xl hover:border-[#D08C70] transition-all gap-2 group">
                     <Download className="text-[#B7ADA4] group-hover:text-[#D08C70]" />
                     <span className="text-xs font-black text-[#6B6661]">匯出資料 (JSON)</span>
                  </button>
                  <label className="flex flex-col items-center justify-center p-6 bg-[#FAF7F2] border-2 border-[#E6DED6] rounded-2xl hover:border-[#729B79] transition-all gap-2 cursor-pointer group">
                     <Upload className="text-[#B7ADA4] group-hover:text-[#729B79]" />
                     <span className="text-xs font-black text-[#6B6661]">匯入資料</span>
                     <input type="file" accept=".json" className="hidden" onChange={handleImportData} />
                  </label>
               </div>
               <div className="mt-6 pt-6 border-t border-[#E6DED6]">
                 <button onClick={async () => { await clearAppStorage(); window.location.reload(); }} className="text-[#D66D5B] text-xs font-bold flex items-center gap-2 hover:opacity-70">
                    <RefreshCw size={14} /> 清除本機資料                 </button>
               </div>
             </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-safe">
        <div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-xl border border-[#E6DED6] rounded-2xl px-4 py-3 pb-safe flex justify-around items-center shadow-lg">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id as any);
              }}
              id={item.id === 'settings' ? 'manage-cats-btn' : undefined}
              className={`flex flex-col items-center gap-1 transition-all tap-active ${activeTab === item.id ? 'text-[#D08C70] scale-110' : 'text-[#B7ADA4]'}`}
            >
              <item.icon size={22} strokeWidth={activeTab === item.id ? 2.5 : 2} />
              <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default App;









































