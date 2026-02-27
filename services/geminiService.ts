import { GoogleGenAI, Type } from '@google/genai';
import type { Category, Transaction, TransactionType } from '../types';

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || typeof apiKey !== 'string') return null;
  try {
    return new GoogleGenAI({ apiKey });
  } catch {
    return null;
  }
};
const FAST_MODEL = 'gemini-2.0-flash-lite';
const TRANSFER_KEYWORDS = ['轉帳', '轉賬', '轉到', '轉入', '轉出', '匯款', '匯入', '匯出'];
const INCOME_KEYWORDS = ['薪水', '薪資', '收入', '進帳', '入帳', '獎金', '退款', '紅包', '股利', '股息', '配息', '分紅', '回饋'];
const FOOD_KEYWORDS = ['早餐', '午餐', '晚餐', '餐', '便當', '飲料', '咖啡', '宵夜', '吃飯'];
const TRANSPORT_KEYWORDS = ['交通', '車資', '車錢', '捷運', '公車', '計程車', 'taxi', 'uber', '高鐵', '火車', '停車', '過路費', '油錢', '加油'];
const DAILY_KEYWORDS = ['超商', '全聯', '家樂福', '日用品', '文具', '用品', '購物', '生活'];
const HOUSE_KEYWORDS = ['房租', '租金', '水費', '電費', '瓦斯', '家電', '家具', '修繕'];
const PLAY_KEYWORDS = ['電影', '遊戲', 'ktv', '唱歌', '聚餐', '旅遊', '娛樂', '演唱會', '串流'];
const HEALTH_KEYWORDS = ['看醫生', '診所', '醫院', '藥', '掛號', '健檢', '牙醫', '醫療'];
const SALARY_KEYWORDS = ['薪水', '薪資', '月薪', '年終'];
const BONUS_KEYWORDS = ['獎金', '紅包', '分紅'];
const INVEST_KEYWORDS = ['股利', '利息', '投資', '基金', '股票', '配息'];
const CASH_HINT_KEYWORDS = ['現金', 'cash', 'wallet'];
const BANK_HINT_KEYWORDS = ['帳戶', '账户', '戶頭', '户头', '銀行', '银行', 'bank', 'account', 'acc'];

type ParsedInput = {
  amount?: number;
  description?: string;
  type?: TransactionType;
  accountName?: string;
  toAccountName?: string;
  categoryName?: string;
  date?: string;
};

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeLoose = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[.,!?，。！？、:;：；'"`~@#$%^&*()_+=\-[\]{}<>\\/|]/g, '');

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

  // Split by removed punctuation/space remnants and keep meaningful parts.
  noSuffix
    .split(/[\s_\-]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)
    .forEach((p) => aliases.add(p));

  // Add short prefixes so custom accounts can be matched by shorthand input.
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

const findAccountMentionsInText = (text: string, accounts: string[]) => {
  const normalizedText = normalizeLoose(text);
  const scored = accounts
    .map((name) => {
      const accountNormalized = normalizeLoose(name);
      const hintBoost = getAccountHintBoost(normalizedText, accountNormalized);
      const aliases = accountAliases(name);
      let score = 0;
      aliases.forEach((alias) => {
        if (!alias) return;
        if (normalizedText.includes(alias)) {
          score = Math.max(score, alias.length + 1);
        }
        score = Math.max(score, similarityByChars(normalizedText, alias));
      });
      score = Math.max(score, hintBoost);
      return { name, score };
    })
    .filter((item) => item.score >= 0.55)
    .sort((a, b) => b.score - a.score);

  return Array.from(new Set(scored.map((s) => s.name)));
};

const findBestAccountMatch = (text: string, accounts: string[]) => {
  return findAccountMentionsInText(text, accounts)[0];
};
const findAccountHitsInText = (text: string, accounts: string[]) => {
  const normalizedText = normalizeLoose(text);
  const hits: Array<{ name: string; index: number }> = [];

  accounts.forEach((name) => {
    const aliases = accountAliases(name).filter((alias) => alias.length >= 2);
    let bestIndex = Number.POSITIVE_INFINITY;

    aliases.forEach((alias) => {
      const idx = normalizedText.indexOf(alias);
      if (idx >= 0 && idx < bestIndex) bestIndex = idx;
    });

    const flexible = buildFlexibleAccountRegex(name);
    if (flexible) {
      const match = text.match(flexible);
      if (match?.index !== undefined) {
        bestIndex = Math.min(bestIndex, match.index);
      }
    }

    if (Number.isFinite(bestIndex)) {
      hits.push({ name, index: bestIndex });
    }
  });

  return hits.sort((a, b) => a.index - b.index);
};

const TRANSFER_VERBS = /(轉帳|轉賬|轉出|轉入|轉|匯款|匯出|匯入|匯|提領|提款|領錢|領)/;
const TRANSFER_CONNECTORS = /(到|至|給|進|入)/g;
const INCOME_VERBS = /(收到|收|入帳|進帳|存入|領到|拿到|給我|發給我)/;

const extractTransferAccounts = (text: string, accounts: string[]) => {
  const connectorMatches = Array.from(text.matchAll(TRANSFER_CONNECTORS));
  const connector = connectorMatches[connectorMatches.length - 1];

  if (connector && connector.index !== undefined) {
    const left = text.slice(0, connector.index);
    const right = text.slice(connector.index + connector[0].length);
    const fromByLeft = findBestAccountMatch(left, accounts);
    const toByRight = findBestAccountMatch(right, accounts);

    if (fromByLeft || toByRight) {
      return { from: fromByLeft, to: toByRight };
    }
  }

  const hits = findAccountHitsInText(text, accounts);
  if (hits.length >= 2) {
    return { from: hits[0].name, to: hits[1].name };
  }
  return { from: hits[0]?.name, to: undefined };
};

const cleanDescription = (text: string, accounts: string[] = []) => {
  let result = text;
  result = result.replace(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g, ' ');
  result = result.replace(/\d+(?:\.\d+)?/g, ' ');
  result = result.replace(/今天|昨日|昨天|前天|today|yesterday/gi, ' ');
  accounts.forEach((account) => {
    if (!account) return;
    const flexible = buildFlexibleAccountRegex(account);
    if (flexible) result = result.replace(flexible, ' ');
    // Also strip account aliases (e.g. shorthand like "壹企") from description.
    accountAliases(account)
      .filter((alias) => alias.length >= 2)
      .forEach((alias) => {
        const safeAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(safeAlias, 'gi'), ' ');
      });
  });
  result = result.replace(/(現金|cash|帳戶|账户|戶頭|银行|銀行|bank|acc|account)/gi, ' ');
  result = result.replace(/\s+/g, ' ').trim();
  return result;
};

const hasAnyKeyword = (text: string, keywords: string[]) => keywords.some((k) => text.includes(k));

const pickByPattern = (categories: string[], pattern: RegExp) => categories.find((c) => pattern.test(c));

const inferCategoryFromText = (text: string, categories: string[], type: TransactionType) => {
  const direct = categories.find((c) => text.includes(c));
  if (direct) return direct;

  if (type === 'income') {
    if (hasAnyKeyword(text, SALARY_KEYWORDS)) return pickByPattern(categories, /(薪|salary|工作|收入)/i);
    if (hasAnyKeyword(text, BONUS_KEYWORDS)) return pickByPattern(categories, /(獎|紅包|bonus)/i);
    if (hasAnyKeyword(text, INVEST_KEYWORDS)) return pickByPattern(categories, /(投資|利息|股利|基金|股票|配息|invest)/i);
    return categories[0];
  }

  if (hasAnyKeyword(text, FOOD_KEYWORDS)) return pickByPattern(categories, /(餐|飲|食|food|meal|eat)/i);
  if (hasAnyKeyword(text, TRANSPORT_KEYWORDS) || /(交通|車資|車錢|捷運|公車|計程|uber|高鐵|火車|停車|過路費|油錢|加油)/i.test(text)) return pickByPattern(categories, /(交|車|運|transport|traffic|commute)/i);
  if (hasAnyKeyword(text, DAILY_KEYWORDS)) return pickByPattern(categories, /(日常|生活|購物|用品|雜支|shop)/i);
  if (hasAnyKeyword(text, HOUSE_KEYWORDS)) return pickByPattern(categories, /(居家|住|房|租|家|home|house)/i);
  if (hasAnyKeyword(text, PLAY_KEYWORDS)) return pickByPattern(categories, /(娛|樂|遊|電影|休閒|play|fun)/i);
  if (hasAnyKeyword(text, HEALTH_KEYWORDS)) return pickByPattern(categories, /(醫|療|健康|health|clinic)/i);

  return undefined;
};

const parseTransactionLocal = (
  input: string,
  accounts: string[],
  categories: Category[],
  today: string
): ParsedInput => {
  const text = input.trim();
  const lower = text.toLowerCase();

  const amountScanText = text
    .replace(/\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}[\/\-]\d{1,2}\b/g, ' ');
  const amountMatch = amountScanText.match(/(\d+(?:\.\d+)?)/);
  const amount = amountMatch ? Number(amountMatch[1]) : undefined;

  const transferByVerb = TRANSFER_KEYWORDS.some((k) => text.includes(k)) || TRANSFER_VERBS.test(text);
  const directionalAccounts = extractTransferAccounts(text, accounts);
  const mentionedAccounts = findAccountMentionsInText(text, accounts);
  const hasTwoAccounts =
    Boolean(directionalAccounts.from) &&
    Boolean(directionalAccounts.to) &&
    directionalAccounts.from !== directionalAccounts.to;
  const incomeByKeyword =
    INCOME_KEYWORDS.some((k) => text.includes(k)) ||
    hasAnyKeyword(text, SALARY_KEYWORDS) ||
    hasAnyKeyword(text, BONUS_KEYWORDS) ||
    hasAnyKeyword(text, INVEST_KEYWORDS) ||
    INCOME_VERBS.test(text) ||
    lower.includes('income');

  let type: TransactionType = 'expense';
  if (hasTwoAccounts) {
    type = 'transfer';
  } else if (transferByVerb && mentionedAccounts.length >= 2 && !incomeByKeyword) {
    type = 'transfer';
  } else if (incomeByKeyword) {
    type = 'income';
  }
  const sourceAccountName = directionalAccounts.from || mentionedAccounts[0] || findBestAccountMatch(text, accounts);
  const availableCategories = categories
    .filter((c) => !c.type || c.type === type)
    .map((c) => c.name);
  const accountName = sourceAccountName;
  const fallbackTarget = mentionedAccounts.find((a) => a !== sourceAccountName);
  const cashTarget = text.includes('現金') ? findBestAccountMatch('現金', accounts) : undefined;
  const toAccountName = type === 'transfer' ? (directionalAccounts.to || fallbackTarget || cashTarget) : undefined;
  const categoryName = type === 'transfer' ? '轉帳' : inferCategoryFromText(text, availableCategories, type);

  let date = today;
  if (text.includes('昨天')) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    date = getLocalDateString(d);
  } else if (text.includes('前天')) {
    const d = new Date(today);
    d.setDate(d.getDate() - 2);
    date = getLocalDateString(d);
  } else {
    const fullDateMatch = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (fullDateMatch) {
      const y = fullDateMatch[1];
      const m = fullDateMatch[2].padStart(2, '0');
      const d = fullDateMatch[3].padStart(2, '0');
      date = `${y}-${m}-${d}`;
    } else {
      const shortDateMatch = text.match(/(?:^|[^\d])(\d{1,2})[\/\-](\d{1,2})(?:$|[^\d])/);
      if (shortDateMatch) {
        const nowYear = today.slice(0, 4);
        const m = shortDateMatch[1].padStart(2, '0');
        const d = shortDateMatch[2].padStart(2, '0');
        date = `${nowYear}-${m}-${d}`;
      }
    }
  }

  return {
    amount,
    type,
    accountName,
    toAccountName,
    categoryName,
    description: cleanDescription(text, accounts) || text,
    date,
  };
};

const isLocalParseConfident = (parsed: ParsedInput, input: string) => {
  const hasAmount = Number.isFinite(parsed.amount) && Number(parsed.amount) > 0;
  const hasSource = Boolean(parsed.accountName);
  const hasTarget =
    parsed.type !== 'transfer' ||
    (Boolean(parsed.toAccountName) && parsed.toAccountName !== parsed.accountName);
  const hasCategory = parsed.type === 'transfer' || Boolean(parsed.categoryName);
  const hasDescription = Boolean(parsed.description && parsed.description.trim().length > 0);

  // Common short bookkeeping phrases can skip remote AI for much faster response.
  const shortInputFastPath = input.trim().length <= 28 && hasAmount && hasSource && hasCategory;

  return (hasAmount && hasSource && hasTarget && hasCategory && hasDescription) || shortInputFastPath;
};
export async function parseTransactionAI(
  input: string,
  accounts: string[],
  categories: Category[],
  options?: { localOnly?: boolean }
): Promise<ParsedInput | null> {
  if (!input.trim()) return null;

  const today = getLocalDateString(new Date());
  const dayOfWeek = new Intl.DateTimeFormat('zh-TW', { weekday: 'long' }).format(new Date());
  const fallback = parseTransactionLocal(input, accounts, categories, today);
  const categoryNames = categories.map((c) => c.name);
  const incomeCategoryNames = categories.filter((c) => !c.type || c.type === 'income').map((c) => c.name);
  const expenseCategoryNames = categories.filter((c) => !c.type || c.type === 'expense').map((c) => c.name);

  if (options?.localOnly || !process.env.API_KEY) {
    return fallback;
  }

  const shouldBypassAiForTransfer =
    fallback.type === 'transfer' &&
    Boolean(fallback.accountName) &&
    Boolean(fallback.toAccountName) &&
    fallback.accountName !== fallback.toAccountName;

  if (shouldBypassAiForTransfer) {
    return fallback;
  }

  try {
    const ai = getAiClient();
    if (!ai) return fallback;

    const aiCall = ai.models.generateContent({
      model: FAST_MODEL,
      contents: `請解析這段記帳文字: "${input}"

規則:
- 今天是 ${today} (${dayOfWeek})
- 可用帳戶: [${accounts.join(', ')}]
- 可用分類: [${categoryNames.join(', ')}]
- 收入可用分類: [${incomeCategoryNames.join(', ')}]
- 支出可用分類: [${expenseCategoryNames.join(', ')}]
- 請推論 amount / description / type / accountName / toAccountName / categoryName / date
- type 僅能為 income、expense、transfer
- 若是轉帳，請同時填 accountName(來源) 與 toAccountName(目標)
- 若 type=income，categoryName 只能選收入分類
- 若 type=expense，categoryName 只能選支出分類
- 若未提到日期，使用 ${today}
- description 只保留交易內容，不包含金額與日期
- 僅輸出 JSON，不要其他文字`,
      config: {
        temperature: 0,
        topK: 1,
        maxOutputTokens: 220,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER },
            description: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['income', 'expense', 'transfer'] },
            accountName: { type: Type.STRING, description: '來源帳戶或收支帳戶名稱' },
            toAccountName: { type: Type.STRING, description: '轉帳目標帳戶名稱（僅 transfer 需要）' },
            categoryName: { type: Type.STRING },
            date: { type: Type.STRING, description: 'YYYY-MM-DD' },
          },
        },
      },
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('AI timeout')), 2200);
    });

    const response = (await Promise.race([aiCall, timeoutPromise])) as Awaited<typeof aiCall>;
    if (timer) clearTimeout(timer);

    let cleanJson = response.text || '{}';
    cleanJson = cleanJson.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson) as ParsedInput;
    const merged: ParsedInput = { ...fallback, ...parsed };
    const hasStrongIncomeHint =
      hasAnyKeyword(input, SALARY_KEYWORDS) ||
      hasAnyKeyword(input, BONUS_KEYWORDS) ||
      hasAnyKeyword(input, INVEST_KEYWORDS) ||
      INCOME_VERBS.test(input);
    const hasStrongExpenseHint =
      hasAnyKeyword(input, FOOD_KEYWORDS) ||
      hasAnyKeyword(input, TRANSPORT_KEYWORDS) ||
      hasAnyKeyword(input, DAILY_KEYWORDS) ||
      hasAnyKeyword(input, HOUSE_KEYWORDS) ||
      hasAnyKeyword(input, PLAY_KEYWORDS) ||
      hasAnyKeyword(input, HEALTH_KEYWORDS);

    let forcedCategoryName: string | undefined;
    if (merged.type === 'income' && hasStrongIncomeHint && fallback.categoryName) {
      forcedCategoryName = fallback.categoryName;
    }
    if (merged.type === 'expense' && hasStrongExpenseHint && fallback.categoryName) {
      forcedCategoryName = fallback.categoryName;
    }
    const explicitMentions = findAccountMentionsInText(input, accounts);
    const resolvedAccount = merged.accountName ? findBestAccountMatch(merged.accountName, accounts) : undefined;
    const resolvedToAccount = merged.toAccountName ? findBestAccountMatch(merged.toAccountName, accounts) : undefined;
    const cleanDesc = cleanDescription(merged.description || input, accounts);
    const forcedSource = explicitMentions[0];
    const forcedTarget = merged.type === 'transfer' ? explicitMentions.find((a) => a !== forcedSource) : undefined;
    return {
      ...merged,
      accountName: forcedSource ?? resolvedAccount ?? fallback.accountName,
      toAccountName: forcedTarget ?? resolvedToAccount ?? fallback.toAccountName,
      categoryName: forcedCategoryName || merged.categoryName || fallback.categoryName,
      description: cleanDesc || fallback.description,
    };
  } catch (e) {
    console.error('AI Parsing Error:', e);
    return fallback;
  }
}

export async function categorizeExpense(
  description: string,
  categories: Category[],
  type: TransactionType
): Promise<string> {
  const cleanDesc = description.trim();
  if (type === 'transfer') return '轉帳';
  if (!cleanDesc) return type === 'income' ? '其他收入' : '其他';

  const fallback = type === 'income' ? '其他收入' : '其他';

  try {
    const filteredCats = categories.filter((c) => !c.type || c.type === type);
    const catList = filteredCats.map((c) => c.name).join(',');
    if (!catList) return fallback;

    const ai = getAiClient();
    if (!ai) return fallback;

    const aiCall = ai.models.generateContent({
      model: FAST_MODEL,
      contents: `從 [${catList}] 選出最符合「${cleanDesc}」的一個分類。只回傳分類名稱。`,
      config: {
        temperature: 0,
        topK: 1,
        maxOutputTokens: 40,
      },
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('AI timeout')), 1800);
    });

    const response = (await Promise.race([aiCall, timeoutPromise])) as Awaited<typeof aiCall>;
    if (timer) clearTimeout(timer);

    const result = response.text?.trim();
    return filteredCats.some((c) => c.name === result) ? (result as string) : fallback;
  } catch {
    return fallback;
  }
}

type AdviceStrategy = 'risk' | 'efficiency' | 'structure';

const pickAdviceStrategy = (salt: string): AdviceStrategy => {
  const hash = Array.from(salt).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const modes: AdviceStrategy[] = ['risk', 'efficiency', 'structure'];
  return modes[hash % modes.length];
};

export async function getFinancialAdvice(
  expenses: Transaction[],
  budget: number,
  budgetContexts: Array<{
    name: string;
    currencyCode: string;
    amount: number;
    expense: number;
    progress: number;
    isOver: boolean;
    scopeNames: string;
    scopeIds: string[];
    period: 'week' | 'month' | 'year';
  }> = [],
  options?: { previousAdvice?: string; requestId?: string }
): Promise<string> {
  if (expenses.length === 0) return '目前資料不足，先新增一些交易再分析。';

  const expenseOnly = expenses.filter((e) => e.type === 'expense');
  if (expenseOnly.length === 0) return '目前沒有支出資料，先新增支出後再分析。';

  const scopedExpenses =
    budgetContexts.length > 0
      ? expenseOnly.filter((tx) => {
          const txScope = tx.scopeId || 'scope_personal';
          return budgetContexts.some((b) => b.scopeIds.includes('all') || b.scopeIds.includes(txScope));
        })
      : expenseOnly;

  const adviceBaseExpenses = scopedExpenses.length > 0 ? scopedExpenses : expenseOnly;
  const total = adviceBaseExpenses.reduce((sum, e) => sum + e.amount, 0);
  const summary = adviceBaseExpenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  const variantSalt = options?.requestId || String(Date.now());
  const strategy = pickAdviceStrategy(variantSalt);

  const tips: string[] = [];
  if (budgetContexts.length === 0) {
    tips.push('尚未設定預算，先建立每月用途預算能提升分析準確度。');
  } else {
    const prioritized = [...budgetContexts].sort((a, b) => {
      const aScore = (a.isOver ? 1000 : 0) + a.progress;
      const bScore = (b.isOver ? 1000 : 0) + b.progress;
      return bScore - aScore;
    });
    const focus = prioritized[0];
    if (focus) {
      if (focus.isOver) {
        tips.push(`「${focus.name}」已超支，先壓低非必要支出。`);
      } else if (focus.progress >= 85) {
        tips.push(`「${focus.name}」使用率 ${Math.round(focus.progress)}%，接近上限。`);
      } else {
        tips.push(`「${focus.name}」目前使用率 ${Math.round(focus.progress)}%，可持續追蹤。`);
      }
    }
  }

  const topCategories = Object.entries(summary).sort((a, b) => b[1] - a[1]);
  const top1 = topCategories[0];
  const top2 = topCategories[1];
  if (top1) {
    const ratio = total > 0 ? Math.round((top1[1] / total) * 100) : 0;
    if (strategy === 'risk') tips.push(`主要支出在「${top1[0]}」約 ${ratio}%，建議設定單類上限。`);
    else if (strategy === 'efficiency') tips.push(`「${top1[0]}」占比 ${ratio}%，可檢視是否有替代方案。`);
    else tips.push(`支出結構以「${top1[0]}」為主，建議觀察週期波動。`);
  }
  if (top2 && tips.length < 3) {
    const ratio2 = total > 0 ? Math.round((top2[1] / total) * 100) : 0;
    tips.push(`次高支出為「${top2[0]}」約 ${ratio2}%，可作為第二優先調整項。`);
  }

  const recent = adviceBaseExpenses.slice(-5);
  if (recent.length > 0 && tips.length < 3) {
    const avgRecent = Math.round(recent.reduce((sum, tx) => sum + tx.amount, 0) / recent.length);
    tips.push(`最近 ${recent.length} 筆平均支出約 ${avgRecent}，可據此設定提醒門檻。`);
  }

  if (tips.length < 3) {
    const remain = Math.max(0, Math.round(budget - total));
    tips.push(`本期剩餘可用額度約 ${remain}，建議預留彈性給必要支出。`);
  }

  const advice = tips.slice(0, 3).map((tip, idx) => `${idx + 1}. ${tip}`).join('\n');
  if (options?.previousAdvice && advice.trim() === options.previousAdvice.trim()) {
    return `${advice}\n補充：可切換區間後再分析，會得到不同觀點。`;
  }
  return advice;
}



























