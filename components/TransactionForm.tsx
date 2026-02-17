import React, { useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { parseTransactionAI } from '../services/geminiService';
import type { Account, Category, Transaction, TransactionType } from '../types';

interface TransactionFormProps {
  onAdd: (tx: Omit<Transaction, 'id'>) => void;
  categories: Category[];
  accounts: Account[];
}

const getToday = () => new Date().toISOString().slice(0, 10);
const LEARNED_PREFS_KEY = 'ss_learned_transaction_prefs_v1';

type LearnedPref = {
  type: TransactionType;
  accountId?: string;
  toAccountId?: string;
  category?: string;
  updatedAt: number;
  useCount?: number;
};

const normalizeDesc = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .replace(/[.,!?，。！？、:;：；'"`~@#$%^&*()_+=\-[\]{}<>\\/|]/g, '');

const makePrefKey = (type: TransactionType, description: string) => `${type}::${normalizeDesc(description)}`;

const formatAmountDisplay = (raw: string) => {
  if (!raw) return '';
  const hasTrailingDot = raw.endsWith('.');
  const [intPartRaw, decimalPart] = raw.split('.');
  const intPart = intPartRaw.replace(/^0+(?=\d)/, '') || '0';
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (hasTrailingDot) return `${withCommas}.`;
  if (decimalPart !== undefined) return `${withCommas}.${decimalPart}`;
  return withCommas;
};

const loadLearnedPrefs = (): Record<string, LearnedPref> => {
  try {
    return JSON.parse(localStorage.getItem(LEARNED_PREFS_KEY) || '{}');
  } catch {
    return {};
  }
};

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

const findLearnedPref = (type: TransactionType, description: string): LearnedPref | undefined => {
  const prefs = loadLearnedPrefs();
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
  result = result.replace(/(現金|cash|帳戶|账户|戶頭|银行|銀行|bank|acc|account)/gi, ' ');
  return result.replace(/\s+/g, ' ').trim();
};

const saveLearnedPref = (key: string, pref: LearnedPref) => {
  const current = loadLearnedPrefs();
  const prev = current[key];
  current[key] = {
    ...pref,
    useCount: (prev?.useCount ?? 0) + 1,
  };
  localStorage.setItem(LEARNED_PREFS_KEY, JSON.stringify(current));
};

const TransactionForm: React.FC<TransactionFormProps> = ({ onAdd, categories, accounts }) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(getToday());
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? '');
  const [aiInput, setAiInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiHint, setAiHint] = useState('');
  const [userAdjustedCategory, setUserAdjustedCategory] = useState(false);
  const [userAdjustedAccount, setUserAdjustedAccount] = useState(false);
  const [userAdjustedToAccount, setUserAdjustedToAccount] = useState(false);

  const toneByType: Record<TransactionType, string> = {
    expense: '#D66D5B',
    income: '#729B79',
    transfer: '#5B84B1',
  };
  const activeTone = toneByType[type];

  const filteredCategories = useMemo(
    () => categories.filter((c) => !c.type || c.type === type),
    [categories, type]
  );
  const displayedAmount = useMemo(() => formatAmountDisplay(amount), [amount]);

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
  const currentCategory = filteredCategories.find((c) => c.name === category);
  const fromAccount = accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);

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
    const desc = description.trim();
    if (desc.length < 2 || accounts.length === 0) return;

    const learned = findLearnedPref(type, desc);

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
  ]);

  const addTransaction = (
    txType: TransactionType,
    txAmount: number,
    txDescription: string,
    txCategory: string,
    fromAccountId: string,
    txDateIso: string,
    targetAccountId?: string
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
      date: txDateIso,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !accountId) {
      return;
    }

    const finalCategory = type === 'transfer' ? '轉帳' : category || '其他';
    const cleanedDescription = sanitizeDescription(description.trim(), accounts);
    const finalDescription = cleanedDescription || (type === 'transfer' ? '帳戶轉帳' : finalCategory);

    addTransaction(type, parsedAmount, finalDescription, finalCategory, accountId, new Date(date).toISOString(), toAccountId);

    if (description.trim()) {
      saveLearnedPref(makePrefKey(type, description), {
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
      if (result.date) setDate(result.date);
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
        const parsedDate = result.date ? new Date(result.date) : new Date(date);
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
          finalTargetAccount?.id
        );

        saveLearnedPref(makePrefKey(nextType, txDescription), {
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
    <form onSubmit={handleSubmit} className="mb-6 rounded-3xl border border-[#E6DED6] bg-white p-4 space-y-3">
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
        <input
          type="text"
          inputMode="decimal"
          value={displayedAmount}
          onChange={(e) => {
            const next = e.target.value.replace(/,/g, '').trim();
            if (!next) {
              setAmount('');
              return;
            }
            if (!/^\d*\.?\d*$/.test(next)) return;
            setAmount(next.startsWith('.') ? `0${next}` : next);
          }}
          placeholder="金額"
          className="h-11 rounded-xl border border-[#E6DED6] px-3 focus:outline-none focus:ring-2"
          style={{ borderColor: `${activeTone}40` }}
          required
        />

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 rounded-xl border border-[#E6DED6] px-3 focus:outline-none focus:ring-2"
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
        <select
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value);
            setUserAdjustedAccount(true);
          }}
          className="h-11 rounded-xl border border-[#E6DED6] px-3 focus:outline-none focus:ring-2"
          style={{ borderColor: `${activeTone}40` }}
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name}
            </option>
          ))}
        </select>

        {type === 'transfer' ? (
          <select
            value={toAccountId}
            onChange={(e) => {
              setToAccountId(e.target.value);
              setUserAdjustedToAccount(true);
            }}
            className="h-11 rounded-xl border border-[#E6DED6] px-3 focus:outline-none focus:ring-2"
            style={{ borderColor: `${activeTone}40` }}
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="space-y-2 min-w-0">
            <button type="button" className="h-11 w-full rounded-xl border px-3 text-left text-sm font-bold bg-white" style={{ borderColor: `${activeTone}40` }}>
              {currentCategory?.name || '選擇分類'}
            </button>
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

