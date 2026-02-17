import React, { useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import CurrencyInput from 'react-currency-input-field';
import { parseTransactionAI } from '../services/geminiService';
import { normalizeImeNumericRaw } from '../utils/numberInput';
import { SUPPORTED_CURRENCIES } from '../types';
import { loadLearnedPrefsStorage, saveLearnedPrefsStorage } from '../services/appStorage';
import type { LearnedPrefsMap, LearnedTransactionPref } from '../services/appStorage';
import type { Account, Category, SavingBucket, Transaction, TransactionType } from '../types';

interface TransactionFormProps {
  onAdd: (tx: Omit<Transaction, 'id'>) => void;
  categories: Category[];
  accounts: Account[];
  savingBuckets: SavingBucket[];
  bucketSpendableByAccount: Record<string, number>;
}

const getToday = () => new Date().toISOString().slice(0, 10);
const clampDateToToday = (dateValue: string) => {
  if (!dateValue) return getToday();
  return dateValue > getToday() ? getToday() : dateValue;
};
type LearnedPref = LearnedTransactionPref;
const normalizeDesc = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[.,!?，。！？、:;：；'"`~@#$%^&*()_+=\-[\]{}<>\\/|]/g, '');

const makePrefKey = (type: TransactionType, description: string) => `${type}::${normalizeDesc(description)}`;


const scoreDescriptionSimilarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aSet = new Set(a.split(''));
  const bSet = new Set(b.split(''));
  let intersect = 0;
  aSet.forEach((ch) => {
    if (bSet.has(ch)) intersect += 1;
  });
  const union = new Set([...aSet, ...bSet]).size || 1;
  const jaccard = intersect / union;
  const containsBonus = a.includes(b) || b.includes(a) ? 0.3 : 0;
  return Math.min(1, jaccard + containsBonus);
};

const findLearnedPref = (prefs: LearnedPrefsMap, type: TransactionType, description: string): LearnedPref | undefined => {
  const normalized = normalizeDesc(description);
  const exact = prefs[makePrefKey(type, description)];
  if (exact) return exact;

  let best: LearnedPref | undefined;
  let bestScore = 0;
  const now = Date.now();

  Object.entries(prefs).forEach(([key, pref]) => {
    if (!key.startsWith(`${type}::`)) return;
    const savedNormalized = key.slice(type.length + 2);
    if (!savedNormalized) return;

    const similarity = scoreDescriptionSimilarity(normalized, savedNormalized);
    const recency = Math.max(0, 1 - (now - pref.updatedAt) / (1000 * 60 * 60 * 24 * 45));
    const usage = Math.min((pref.useCount ?? 1) / 8, 1);
    const score = similarity * 0.7 + recency * 0.2 + usage * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = pref;
    }
  });

  return bestScore >= 0.55 ? best : undefined;
};

const normalizeLoose = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[.,!?，。！？、:;：；'"`~@#$%^&*()_+=\-[\]{}<>\\/|]/g, '');
const CASH_HINT_KEYWORDS = ['現金', 'cash', 'wallet'];
const BANK_HINT_KEYWORDS = ['帳戶', '账户', '戶頭', '户头', '銀行', '银行', 'bank', 'account', 'acc'];

const hasAnyToken = (text: string, tokens: string[]) => tokens.some((token) => text.includes(token));

const getAccountHintBoost = (inputNormalized: string, accountNormalized: string) => {
  const inputCash = hasAnyToken(inputNormalized, CASH_HINT_KEYWORDS);
  const inputBank = hasAnyToken(inputNormalized, BANK_HINT_KEYWORDS);
  const accountCash = hasAnyToken(accountNormalized, CASH_HINT_KEYWORDS);
  const accountBank = hasAnyToken(accountNormalized, BANK_HINT_KEYWORDS);
  let boost = 0;
  if (inputCash && accountCash) boost += 1.2;
  if (inputBank && accountBank && !accountCash) boost += 0.8;
  if (inputBank && accountCash) boost -= 0.4;
  return boost;
};

const similarityByChars = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aSet = new Set(a.split(''));
  const bSet = new Set(b.split(''));
  let overlap = 0;
  aSet.forEach((ch) => {
    if (bSet.has(ch)) overlap += 1;
  });
  const denom = Math.max(aSet.size, bSet.size) || 1;
  return overlap / denom;
};

const accountAliases = (name: string) => {
  const normalized = normalizeLoose(name);
  const noSuffix = normalized.replace(/(帳戶|账户|戶頭|户头|銀行|银行|bank|acc|account|wallet|card|卡)$/g, '');
  const aliases = new Set<string>();
  if (normalized) aliases.add(normalized);
  if (noSuffix) aliases.add(noSuffix);
  noSuffix
    .split(/[\s_\-]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)
    .forEach((p) => aliases.add(p));
  const base = noSuffix || normalized;
  if (base.length >= 2) aliases.add(base.slice(0, 2));
  if (base.length >= 3) aliases.add(base.slice(0, 3));
  if (base.length >= 4) aliases.add(base.slice(0, 4));
  return Array.from(aliases);
};

const buildFlexibleAccountRegex = (name: string) => {
  const escapedChars = Array.from(name.trim())
    .filter((ch) => ch.trim().length > 0)
    .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!escapedChars.length) return null;
  return new RegExp(escapedChars.join('\\s*'), 'gi');
};

const sanitizeDescription = (text: string, accounts: Account[]) => {
  if (!text) return '';
  let result = text;
  result = result.replace(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g, ' ');
  result = result.replace(/\d+(?:\.\d+)?/g, ' ');
  result = result.replace(/今天|昨日|昨天|前天|today|yesterday/gi, ' ');
  accounts.forEach((acc) => {
    const flexible = buildFlexibleAccountRegex(acc.name);
    if (flexible) result = result.replace(flexible, ' ');
    accountAliases(acc.name)
      .filter((alias) => alias.length >= 2)
      .forEach((alias) => {
        const safeAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(safeAlias, 'gi'), ' ');
      });
  });
  result = result.replace(/(現金|cash|帳戶|账户|戶頭|户头|銀行|银行|bank|acc|account)/gi, ' ');
  return result.replace(/\s+/g, ' ').trim();
};

const upsertLearnedPref = (prefs: LearnedPrefsMap, key: string, pref: LearnedPref): LearnedPrefsMap => {
  const prev = prefs[key];
  return {
    ...prefs,
    [key]: {
      ...pref,
      useCount: (prev?.useCount ?? 0) + 1,
    },
  };
};

const TransactionForm: React.FC<TransactionFormProps> = ({ onAdd, categories, accounts, savingBuckets, bucketSpendableByAccount }) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(getToday());
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? '');
  const [aiInput, setAiInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiHint, setAiHint] = useState('');
  const [spendBucketId, setSpendBucketId] = useState('');
  const [userAdjustedCategory, setUserAdjustedCategory] = useState(false);
  const [userAdjustedAccount, setUserAdjustedAccount] = useState(false);
  const [userAdjustedToAccount, setUserAdjustedToAccount] = useState(false);
  const [sourceAccountMenuOpen, setSourceAccountMenuOpen] = useState(false);
  const [targetAccountMenuOpen, setTargetAccountMenuOpen] = useState(false);
  const [learnedPrefs, setLearnedPrefs] = useState<LearnedPrefsMap>({});

  const toneByType: Record<TransactionType, string> = {
    expense: '#D66D5B',
    income: '#729B79',
    transfer: '#5B84B1',
  };
  const activeTone = toneByType[type];
  const sourceTone = type === 'transfer' ? toneByType.expense : activeTone;
  const targetTone = type === 'transfer' ? toneByType.income : activeTone;

  const filteredCategories = useMemo(
    () => categories.filter((c) => !c.type || c.type === type),
    [categories, type]
  );

  const getAllowedCategoryNames = React.useCallback(
    (txType: TransactionType) => categories.filter((c) => !c.type || c.type === txType).map((c) => c.name),
    [categories]
  );

  const ensureCategoryForType = React.useCallback(
    (txType: TransactionType, candidate?: string) => {
      if (txType === 'transfer') return '轉帳';
      const allowed = getAllowedCategoryNames(txType);
      if (!allowed.length) return txType === 'income' ? '其他收入' : '其他';
      if (candidate && allowed.includes(candidate)) return candidate;
      if (candidate) {
        const fuzzy = allowed.find((name) => name.includes(candidate) || candidate.includes(name));
        if (fuzzy) return fuzzy;
      }
      return allowed[0];
    },
    [getAllowedCategoryNames]
  );

  const resolveAccount = React.useCallback(
    (name?: string) => {
      if (!name) return undefined;
      const exact = accounts.find((a) => a.name === name);
      if (exact) return exact;

      const target = normalizeLoose(name);
      if (!target) return undefined;
      let best: Account | undefined;
      let bestScore = 0;
      accounts.forEach((acc) => {
        const accountNormalized = normalizeLoose(acc.name);
        const hintBoost = getAccountHintBoost(target, accountNormalized);
        const aliases = accountAliases(acc.name);
        aliases.forEach((alias) => {
          if (!alias) return;
          let score = 0;
          if (target.includes(alias) || alias.includes(target)) {
            score = Math.max(score, Math.min(target.length, alias.length) + 1);
          }
          score = Math.max(score, similarityByChars(target, alias));
          score = Math.max(score, hintBoost);
          if (score > bestScore) {
            bestScore = score;
            best = acc;
          }
        });
      });
      return bestScore >= 0.55 ? best : undefined;
    },
    [accounts]
  );
  const persistLearnedPref = React.useCallback((key: string, pref: LearnedPref) => {
    setLearnedPrefs((prev) => {
      const next = upsertLearnedPref(prev, key, pref);
      void saveLearnedPrefsStorage(next);
      return next;
    });
  }, []);

  const resolveAccountsFromText = React.useCallback(
    (text: string) => {
      const target = normalizeLoose(text);
      if (!target) return [] as Account[];
      const scored = accounts
        .map((acc) => {
          const accountNormalized = normalizeLoose(acc.name);
          const hintBoost = getAccountHintBoost(target, accountNormalized);
          const aliases = accountAliases(acc.name);
          let score = 0;
          aliases.forEach((alias) => {
            if (!alias) return;
            if (target.includes(alias)) score = Math.max(score, alias.length + 1);
            score = Math.max(score, similarityByChars(target, alias));
          });
          score = Math.max(score, hintBoost);
          return { acc, score };
        })
        .filter((item) => item.score >= 0.55)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.acc);
      return Array.from(new Map(scored.map((acc) => [acc.id, acc])).values());
    },
    [accounts]
  );

  const [category, setCategory] = useState('');
  const fromAccount = accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const selectedSourceAccount = fromAccount || accounts[0];
  const selectedTargetAccount = toAccount || accounts[0];
  const parsedAmount = Number(amount) || 0;
  const getCurrencySymbol = (currencyCode: string) =>
    SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode)?.symbol || '$';
  const getProjectedBalance = (account: Account, role: 'source' | 'target') => {
    const delta =
      role === 'target'
        ? parsedAmount
        : type === 'income'
          ? parsedAmount
          : -parsedAmount;
    return {
      delta,
      nextBalance: account.balance + delta,
      symbol: getCurrencySymbol(account.currencyCode),
    };
  };
  const expenseBuckets = useMemo(() => {
    if (type !== 'expense') return [];
    return savingBuckets
      .map((bucket) => {
        const key = `${bucket.id}::${accountId}`;
        const spendable = bucketSpendableByAccount[key] || 0;
        return { ...bucket, spendable };
      })
      .filter((bucket) => bucket.spendable > 0);
  }, [type, savingBuckets, accountId, bucketSpendableByAccount]);
  const selectedBucketSpendable = useMemo(() => {
    if (!spendBucketId) return 0;
    return bucketSpendableByAccount[`${spendBucketId}::${accountId}`] || 0;
  }, [spendBucketId, accountId, bucketSpendableByAccount]);

  React.useEffect(() => {
    if (!filteredCategories.some((c) => c.name === category)) {
      setCategory(filteredCategories[0]?.name ?? '');
    }
  }, [filteredCategories, category]);

  React.useEffect(() => {
    if (!accounts.some((a) => a.id === accountId)) {
      setAccountId(accounts[0]?.id ?? '');
    }
    if (!accounts.some((a) => a.id === toAccountId)) {
      setToAccountId(accounts[1]?.id ?? accounts[0]?.id ?? '');
    }
  }, [accounts, accountId, toAccountId]);

  React.useEffect(() => {
    if (type !== 'expense') {
      setSpendBucketId('');
      return;
    }
    if (spendBucketId && !expenseBuckets.some((bucket) => bucket.id === spendBucketId)) {
      setSpendBucketId('');
    }
  }, [type, spendBucketId, expenseBuckets]);
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await loadLearnedPrefsStorage();
        if (!cancelled) setLearnedPrefs(loaded);
      } catch (err) {
        console.error('Failed to load learned prefs from local database.', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const desc = description.trim();
    if (desc.length < 2 || accounts.length === 0) return;

    const learned = findLearnedPref(learnedPrefs, type, desc);

    if (learned) {
      if (!userAdjustedCategory && learned.category) {
        setCategory(ensureCategoryForType(type, learned.category));
      }
      if (!userAdjustedAccount && learned.accountId) setAccountId(learned.accountId);
      if (!userAdjustedToAccount && learned.toAccountId) setToAccountId(learned.toAccountId);
      return;
    }

    const timer = setTimeout(async () => {
      const result = await parseTransactionAI(
        desc,
        accounts.map((a) => a.name),
        categories
      );
      if (!result) return;

      if (!userAdjustedCategory && result.categoryName) {
        setCategory(ensureCategoryForType(type, result.categoryName));
      }
      if (!userAdjustedAccount && result.accountName) {
        const match = resolveAccount(result.accountName);
        if (match) setAccountId(match.id);
      }
      if (!userAdjustedToAccount && result.toAccountName) {
        const match = resolveAccount(result.toAccountName);
        if (match) setToAccountId(match.id);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [
    description,
    type,
    accounts,
    categories,
    ensureCategoryForType,
    resolveAccount,
    userAdjustedCategory,
    userAdjustedAccount,
    userAdjustedToAccount,
    learnedPrefs,
  ]);

  const addTransaction = (
    txType: TransactionType,
    txAmount: number,
    txDescription: string,
    txCategory: string,
    fromAccountId: string,
    txDateIso: string,
    targetAccountId?: string,
    expenseBucketId?: string
  ) => {
    const sourceAccount = accounts.find((a) => a.id === fromAccountId);
    if (!sourceAccount) return;

    onAdd({
      type: txType,
      amount: txAmount,
      currencyCode: sourceAccount.currencyCode,
      description: txDescription,
      category: txCategory,
      accountId: fromAccountId,
      toAccountId: txType === 'transfer' ? targetAccountId : undefined,
      bucketId: txType === 'expense' && expenseBucketId ? expenseBucketId : undefined,
      date: txDateIso,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(amount);
    const safeDate = clampDateToToday(date);
    if (safeDate !== date) setDate(safeDate);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !accountId) {
      return;
    }
    if (type === 'expense' && spendBucketId && selectedBucketSpendable < parsedAmount) {
      setAiHint('此目標池可扣用金額不足，請調整金額或改用一般支出。');
      return;
    }

    const finalCategory = type === 'transfer' ? '轉帳' : category || '其他';
    const cleanedDescription = sanitizeDescription(description.trim(), accounts);
    const finalDescription = cleanedDescription || (type === 'transfer' ? '帳戶轉帳' : finalCategory);

    addTransaction(type, parsedAmount, finalDescription, finalCategory, accountId, new Date(safeDate).toISOString(), toAccountId, spendBucketId || undefined);

    if (description.trim()) {
      persistLearnedPref(makePrefKey(type, description), {
        type,
        accountId,
        toAccountId: type === 'transfer' ? toAccountId : undefined,
        category: type === 'transfer' ? '轉帳' : category,
        updatedAt: Date.now(),
      });
    }

    setAmount('');
    setDescription('');
    setUserAdjustedCategory(false);
    setUserAdjustedAccount(false);
    setUserAdjustedToAccount(false);
    setSpendBucketId('');
  };

  const handleAiParse = async () => {
    if (!aiInput.trim() || accounts.length === 0) return;

    setIsAnalyzing(true);
    setAiHint('');

    try {
      const result = await parseTransactionAI(
        aiInput,
        accounts.map((a) => a.name),
        categories
      );

      if (!result) {
        setAiHint('AI 解析失敗，請改用手動輸入。');
        return;
      }

      const nextType = result.type || type;
      if (result.type) setType(result.type);
      if (result.description) setDescription(result.description);
      if (result.date) setDate(clampDateToToday(result.date));
      if (nextType !== 'transfer') {
        setCategory(ensureCategoryForType(nextType, result.categoryName || category));
      }

      const sourceAccount = result.accountName
        ? resolveAccount(result.accountName)
        : accounts.find((a) => a.id === accountId);
      const targetAccount = result.toAccountName
        ? resolveAccount(result.toAccountName)
        : accounts.find((a) => a.id === toAccountId);

      const explicitAccounts = resolveAccountsFromText(aiInput);
      const forcedSourceAccount = explicitAccounts[0];
      const forcedTargetAccount = nextType === 'transfer'
        ? explicitAccounts.find((a) => a.id !== forcedSourceAccount?.id)
        : undefined;

      const finalSourceAccount = forcedSourceAccount || sourceAccount;
      const finalTargetAccount = forcedTargetAccount || targetAccount;

      if (finalSourceAccount) setAccountId(finalSourceAccount.id);
      if (finalTargetAccount) setToAccountId(finalTargetAccount.id);

      if (result.amount !== undefined) {
        setAmount(String(result.amount));
      }

      const parsedAmount = result.amount ?? Number(amount);
      if (Number.isFinite(parsedAmount) && parsedAmount > 0 && finalSourceAccount) {
        const parsedDate = result.date ? new Date(clampDateToToday(result.date)) : new Date(clampDateToToday(date));
        const txDateIso = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
        const txCategory = ensureCategoryForType(nextType, result.categoryName || category);
        const rawTxDescription = (result.description || description || txCategory).trim();
        const txDescription = sanitizeDescription(rawTxDescription, accounts) || txCategory;

        addTransaction(
          nextType,
          parsedAmount,
          txDescription,
          txCategory,
          finalSourceAccount.id,
          txDateIso,
          finalTargetAccount?.id,
          undefined
        );

        persistLearnedPref(makePrefKey(nextType, txDescription), {
          type: nextType,
          accountId: finalSourceAccount.id,
          toAccountId: nextType === 'transfer' ? finalTargetAccount?.id : undefined,
          category: txCategory,
          updatedAt: Date.now(),
        });

        setAmount('');
        setDescription('');
        setAiHint('已依欄位解析並新增交易。');
      } else {
        setAiHint('已解析欄位，但缺少有效金額，請手動確認。');
      }

      setAiInput('');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (accounts.length === 0) {
    return <div className="mb-6 rounded-xl border border-[#E6DED6] bg-white p-4 text-sm">請先新增至少一個帳戶。</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="relative z-40 mb-6 rounded-3xl border border-[#E6DED6] bg-white p-4 space-y-3">
      <div className="rounded-2xl bg-[#1A1A1A] p-3 text-white space-y-2">
        <label className="block text-[10px] font-black uppercase tracking-widest text-[#D08C70]">AI 記帳輸入</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAiParse();
              }
            }}
            placeholder="例如：午餐 180 現金，今天"
            className="h-10 flex-1 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-bold outline-none placeholder:text-white/40"
          />
          <button
            type="button"
            onClick={() => void handleAiParse()}
            disabled={isAnalyzing || !aiInput.trim()}
            className="rounded-xl bg-[#D08C70] px-4 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
          >
            {isAnalyzing ? '分析中' : '解析'}
          </button>
        </div>
        {aiHint && <p className="text-[11px] font-bold text-[#E6DED6]">{aiHint}</p>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(['expense', 'income', 'transfer'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${type === t ? 'text-white' : 'bg-[#FAF7F2] text-[#6B6661]'}`}
            style={type === t ? { backgroundColor: toneByType[t] } : undefined}
          >
            {t === 'expense' ? '支出' : t === 'income' ? '收入' : '轉帳'}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <CurrencyInput
          inputMode="numeric"
          value={amount}
          groupSeparator=","
          allowNegativeValue={false}
          decimalsLimit={0}
          transformRawValue={normalizeImeNumericRaw}
          onValueChange={(value) => setAmount(value || '')}
          placeholder="金額"
          className="h-11 w-full rounded-xl border border-[#E6DED6] px-3 focus:outline-none focus:ring-2"
          style={{ borderColor: `${activeTone}40` }}
          required
        />

        <input
          type="date"
          value={date}
          max={getToday()}
          onChange={(e) => setDate(clampDateToToday(e.target.value))}
          className="h-11 w-full rounded-xl border border-[#E6DED6] px-3 focus:outline-none focus:ring-2"
          style={{ borderColor: `${activeTone}40` }}
          required
        />
      </div>

      <input
        type="text"
        value={description}
        onChange={(e) => {
          setDescription(e.target.value);
          setUserAdjustedCategory(false);
          setUserAdjustedAccount(false);
          setUserAdjustedToAccount(false);
        }}
        placeholder="描述（可留空）"
        className="h-11 w-full rounded-xl border border-[#E6DED6] px-3 focus:outline-none focus:ring-2"
        style={{ borderColor: `${activeTone}40` }}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">
            {type === 'transfer' ? '來源帳戶' : '帳戶'}
          </p>
          <div className="relative">
            {selectedSourceAccount && (
                <button
                  type="button"
                  onClick={() => setSourceAccountMenuOpen((prev) => !prev)}
                  className="w-full rounded-xl border bg-[#FAF7F2] px-3 py-2 text-left shadow-sm"
                  style={{ borderColor: sourceTone }}
                >
                {(() => {
                  const projection = getProjectedBalance(selectedSourceAccount, 'source');
                  const isIncrease = projection.delta >= 0;
                  const TrendIcon = isIncrease ? LucideIcons.TrendingUp : LucideIcons.TrendingDown;
                  const showDelta = parsedAmount > 0;
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-[#1A1A1A]">{selectedSourceAccount.name}</span>
                        <div className="flex items-center gap-2">
                          <LucideIcons.ChevronDown
                            size={14}
                            className={`text-[#6B6661] transition-transform ${sourceAccountMenuOpen ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </div>
                        <div className="mt-1 flex items-center justify-between">
                          {showDelta ? (
                          <div className="flex items-center gap-1.5" style={{ color: sourceTone }}>
                              <TrendIcon size={15} />
                              <span className="text-[11px] font-bold">
                                {projection.delta >= 0 ? '+' : '-'}
                              {projection.symbol}
                              {Math.abs(projection.delta).toLocaleString()}
                            </span>
                          </div>
                        ) : (
                          <div />
                        )}
                        <span className="text-[11px] font-bold text-[#6B6661]">
                          {projection.symbol}
                          {projection.nextBalance.toLocaleString()}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </button>
            )}
            {sourceAccountMenuOpen && (
              <div className="absolute z-[70] mt-2 max-h-64 w-full overflow-auto rounded-xl border border-[#E6DED6] bg-white p-2 shadow-xl">
                <div className="grid grid-cols-1 gap-2">
                  {accounts.map((acc) => {
                    const active = accountId === acc.id;
                    const projection = getProjectedBalance(acc, 'source');
                    const isIncrease = projection.delta >= 0;
                    const DeltaIcon = isIncrease ? LucideIcons.ArrowUpRight : LucideIcons.ArrowDownRight;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          setAccountId(acc.id);
                          setUserAdjustedAccount(true);
                          setSourceAccountMenuOpen(false);
                        }}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${active ? 'bg-[#FAF7F2] shadow-sm' : 'bg-white'}`}
                        style={{ borderColor: active ? sourceTone : '#E6DED6' }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-[#1A1A1A]">{acc.name}</span>
                          <span className="text-[10px] font-bold text-[#B7ADA4]">
                            {projection.symbol}
                            {acc.balance.toLocaleString()}
                          </span>
                        </div>
                        <div className={`mt-1 flex items-center gap-1 text-[10px] font-bold ${isIncrease ? 'text-[#729B79]' : 'text-[#D66D5B]'}`}>
                          <DeltaIcon size={12} />
                          <span>
                            {projection.delta >= 0 ? '+' : ''}
                            {projection.symbol}
                            {Math.abs(projection.delta).toLocaleString()} {'->'} {projection.symbol}
                            {projection.nextBalance.toLocaleString()}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {type === 'transfer' ? (
          <div className="space-y-2">
            <p className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">目標帳戶</p>
            <div className="relative">
              {selectedTargetAccount && (
                <button
                  type="button"
                  onClick={() => setTargetAccountMenuOpen((prev) => !prev)}
                  className="w-full rounded-xl border bg-[#FAF7F2] px-3 py-2 text-left shadow-sm"
                  style={{ borderColor: targetTone }}
                >
                  {(() => {
                    const projection = getProjectedBalance(selectedTargetAccount, 'target');
                    const showDelta = parsedAmount > 0;
                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-[#1A1A1A]">{selectedTargetAccount.name}</span>
                          <div className="flex items-center gap-2">
                            <LucideIcons.ChevronDown
                              size={14}
                              className={`text-[#6B6661] transition-transform ${targetAccountMenuOpen ? 'rotate-180' : ''}`}
                            />
                          </div>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          {showDelta ? (
                            <div className="flex items-center gap-1.5" style={{ color: targetTone }}>
                              <LucideIcons.TrendingUp size={15} />
                              <span className="text-[11px] font-bold">
                                +{projection.symbol}
                                {projection.delta.toLocaleString()}
                              </span>
                            </div>
                          ) : (
                            <div />
                          )}
                          <span className="text-[11px] font-bold text-[#6B6661]">
                            {projection.symbol}
                            {projection.nextBalance.toLocaleString()}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </button>
              )}
              {targetAccountMenuOpen && (
                <div className="absolute z-[70] mt-2 max-h-64 w-full overflow-auto rounded-xl border border-[#E6DED6] bg-white p-2 shadow-xl">
                  <div className="grid grid-cols-1 gap-2">
                    {accounts.map((acc) => {
                      const active = toAccountId === acc.id;
                      const projection = getProjectedBalance(acc, 'target');
                      const showDelta = parsedAmount > 0;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => {
                            setToAccountId(acc.id);
                            setUserAdjustedToAccount(true);
                            setTargetAccountMenuOpen(false);
                          }}
                          className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${active ? 'bg-[#FAF7F2] shadow-sm' : 'bg-white'}`}
                          style={{ borderColor: active ? targetTone : '#E6DED6' }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-[#1A1A1A]">{acc.name}</span>
                            <span className="text-[10px] font-bold text-[#B7ADA4]">
                              {projection.symbol}
                              {acc.balance.toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            {showDelta ? (
                              <div className="flex items-center gap-1 text-[10px] font-bold" style={{ color: targetTone }}>
                                <LucideIcons.TrendingUp size={12} />
                                <span>
                                  +{projection.symbol}
                                  {projection.delta.toLocaleString()}
                                </span>
                              </div>
                            ) : (
                              <div />
                            )}
                            <span className="text-[10px] font-bold text-[#6B6661]">
                              {projection.symbol}
                              {projection.nextBalance.toLocaleString()}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2 w-full max-w-full">
              {filteredCategories.map((cat) => {
                const Icon = (LucideIcons as any)[cat.icon] || LucideIcons.Layers;
                const active = category === cat.name;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setCategory(cat.name);
                      setUserAdjustedCategory(true);
                    }}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-black transition-all ${active ? 'text-white shadow-sm' : 'bg-white text-[#6B6661]'}`}
                    style={{ borderColor: active ? cat.color : '#E6DED6', backgroundColor: active ? cat.color : 'white' }}
                  >
                    <Icon size={12} />
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {type === 'expense' && (
        <div className="rounded-xl border border-[#E6DED6] bg-[#FAF7F2] p-3 space-y-2">
          <p className="text-[10px] font-black text-[#6B6661] uppercase tracking-widest">目標池扣款（可選）</p>
          <select
            value={spendBucketId}
            onChange={(e) => setSpendBucketId(e.target.value)}
            className="h-10 w-full rounded-xl border border-[#E6DED6] bg-white px-3 text-xs font-bold outline-none"
          >
            <option value="">一般支出（不扣目標池）</option>
            {expenseBuckets.map((bucket) => (
              <option key={bucket.id} value={bucket.id}>
                {bucket.name} · 可扣 ${bucket.spendable.toLocaleString()}
              </option>
            ))}
          </select>
          {spendBucketId && (
            <p className="text-[10px] font-bold text-[#5B84B1]">
              目前可扣：${selectedBucketSpendable.toLocaleString()}
            </p>
          )}
        </div>
      )}

      <button type="submit" className="h-11 w-full rounded-xl text-white transition-colors flex items-center justify-center gap-1.5" style={{ backgroundColor: activeTone }}>
        {type === 'expense' && (
          <>
            <span className="text-[11px] font-bold">由</span>
            <span className="text-[13px] font-black">{fromAccount?.name || ''}</span>
            <span className="text-[11px] font-bold">支出</span>
          </>
        )}
        {type === 'income' && (
          <>
            <span className="text-[11px] font-bold">存入</span>
            <span className="text-[13px] font-black">{fromAccount?.name || ''}</span>
          </>
        )}
        {type === 'transfer' && (
          <>
            <span className="text-[11px] font-bold">由</span>
            <span className="text-[13px] font-black">{fromAccount?.name || ''}</span>
            <span className="text-[11px] font-bold">轉入</span>
            <span className="text-[13px] font-black">{toAccount?.name || ''}</span>
          </>
        )}
      </button>
    </form>
  );
};

export default TransactionForm;



















