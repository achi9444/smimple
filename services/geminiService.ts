import { GoogleGenAI, Type } from '@google/genai';
import type { Category, Transaction, TransactionType } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const TRANSFER_KEYWORDS = ['轉帳', '轉賬', '轉到', '轉入', '轉出', '匯款', '匯入', '匯出'];
const INCOME_KEYWORDS = ['薪水', '薪資', '收入', '進帳', '入帳', '獎金', '退款'];
const FOOD_KEYWORDS = ['早餐', '午餐', '晚餐', '餐', '便當', '飲料', '咖啡', '宵夜', '吃飯'];
const TRANSPORT_KEYWORDS = ['捷運', '公車', '計程車', 'taxi', 'uber', '高鐵', '火車', '停車', '油錢', '加油'];
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
  if (hasAnyKeyword(text, TRANSPORT_KEYWORDS)) return pickByPattern(categories, /(交|車|運|transport|traffic|commute)/i);
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

  const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
  const amount = amountMatch ? Number(amountMatch[1]) : undefined;

  let type: TransactionType = 'expense';
  if (TRANSFER_KEYWORDS.some((k) => text.includes(k))) {
    type = 'transfer';
  } else if (INCOME_KEYWORDS.some((k) => text.includes(k)) || lower.includes('income')) {
    type = 'income';
  }

  const mentionedAccounts = findAccountMentionsInText(text, accounts);
  const sourceAccountName = mentionedAccounts[0] || findBestAccountMatch(text, accounts);
  const availableCategories = categories
    .filter((c) => !c.type || c.type === type)
    .map((c) => c.name);
  const accountName = sourceAccountName;
  const toAccountName = type === 'transfer' ? mentionedAccounts.find((a) => a !== sourceAccountName) : undefined;
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
    const dateMatch = text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (dateMatch) {
      const y = dateMatch[1];
      const m = dateMatch[2].padStart(2, '0');
      const d = dateMatch[3].padStart(2, '0');
      date = `${y}-${m}-${d}`;
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

export async function parseTransactionAI(
  input: string,
  accounts: string[],
  categories: Category[]
): Promise<ParsedInput | null> {
  if (!input.trim()) return null;

  const today = getLocalDateString(new Date());
  const dayOfWeek = new Intl.DateTimeFormat('zh-TW', { weekday: 'long' }).format(new Date());
  const fallback = parseTransactionLocal(input, accounts, categories, today);
  const categoryNames = categories.map((c) => c.name);
  const incomeCategoryNames = categories.filter((c) => !c.type || c.type === 'income').map((c) => c.name);
  const expenseCategoryNames = categories.filter((c) => !c.type || c.type === 'expense').map((c) => c.name);

  if (!process.env.API_KEY) {
    return fallback;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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

    let cleanJson = response.text || '{}';
    cleanJson = cleanJson.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson) as ParsedInput;
    const merged: ParsedInput = { ...fallback, ...parsed };
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

  try {
    const filteredCats = categories.filter((c) => !c.type || c.type === type);
    const catList = filteredCats.map((c) => c.name).join(',');

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `從 [${catList}] 選出最符合「${cleanDesc}」的一個分類。只回傳分類名稱。`,
      config: {
        temperature: 0,
        topK: 1,
      },
    });

    const result = response.text?.trim();
    return filteredCats.some((c) => c.name === result) ? (result as string) : type === 'income' ? '其他收入' : '其他';
  } catch {
    return type === 'income' ? '其他收入' : '其他';
  }
}

export async function getFinancialAdvice(expenses: Transaction[], budget: number): Promise<string> {
  if (expenses.length === 0) return '目前資料不足，先新增一些交易再分析。';

  const expenseOnly = expenses.filter((e) => e.type === 'expense');
  const total = expenseOnly.reduce((sum, e) => sum + e.amount, 0);
  const summary = expenseOnly.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  const summaryStr = Object.entries(summary)
    .map(([n, a]) => `${n}:${a}`)
    .join(',');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `你是理財顧問。預算 ${budget}、目前支出 ${total}。分類資料: ${summaryStr}。請用繁體中文給 3 條簡短建議，每條 15 字內。`,
      config: { temperature: 0.7 },
    });

    return response.text || '暫時無法產生建議。';
  } catch {
    return 'AI 建議服務暫時不可用。';
  }
}
