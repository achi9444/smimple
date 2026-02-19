import { Account, BucketAllocation, BucketSpend, BudgetItem, Category, DisplayRange, IncomeAllocationRule, PlanTier, SavingBucket, SpendingScope, Transaction, TransactionType } from '../types';


export interface LearnedTransactionPref {
  type: TransactionType;
  accountId?: string;
  toAccountId?: string;
  category?: string;
  updatedAt: number;
  useCount?: number;
}

export type LearnedPrefsMap = Record<string, LearnedTransactionPref>;
const DB_NAME = 'smimple_local_db';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';
const LEARNED_PREFS_DB_KEY = 'learnedPrefs';
const LEGACY_LEARNED_PREFS_KEY = 'ss_learned_transaction_prefs_v1';

const LEGACY_KEYS = {
  transactions: 'ss_transactions',
  accounts: 'ss_accounts',
  categories: 'ss_categories',
  scopes: 'ss_scopes',
  budgets: 'ss_budgets',
  displayRange: 'ss_display_range',
  planTier: 'ss_plan_tier',
  savingBuckets: 'ss_saving_buckets',
  bucketAllocations: 'ss_bucket_allocations',
  bucketSpends: 'ss_bucket_spends',
  incomeRules: 'ss_income_rules',
} as const;

type AppStorageKey = keyof typeof LEGACY_KEYS;

interface StoredRecord {
  key: AppStorageKey;
  value: unknown;
}

export interface AppStorageData {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  scopes: SpendingScope[];
  budgets: BudgetItem[];
  displayRange: DisplayRange;
  planTier: PlanTier;
  savingBuckets: SavingBucket[];
  bucketAllocations: BucketAllocation[];
  bucketSpends: BucketSpend[];
  incomeRules: IncomeAllocationRule[];
}

const APP_KEYS = Object.keys(LEGACY_KEYS) as AppStorageKey[];

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const readAll = async () => {
  const db = await openDb();
  try {
    return await new Promise<Partial<Record<AppStorageKey, unknown>>>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const values: Partial<Record<AppStorageKey, unknown>> = {};
      let pending = APP_KEYS.length;

      if (pending === 0) {
        resolve(values);
        return;
      }

      APP_KEYS.forEach((key) => {
        const req = store.get(key);
        req.onsuccess = () => {
          const row = req.result as StoredRecord | undefined;
          if (row !== undefined) values[key] = row.value;
          pending -= 1;
          if (pending === 0) resolve(values);
        };
        req.onerror = () => reject(req.error);
      });
    });
  } finally {
    db.close();
  }
};

const writeAll = async (data: AppStorageData) => {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      APP_KEYS.forEach((key) => {
        const record: StoredRecord = { key, value: data[key] };
        store.put(record);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};

const hasAnyIndexedDbData = (data: Partial<Record<AppStorageKey, unknown>>) =>
  APP_KEYS.some((key) => data[key] !== undefined);

const parseLegacyValue = (key: AppStorageKey, raw: string | null): unknown => {
  if (raw === null) return undefined;
  if (key === 'displayRange' || key === 'planTier') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

const readLegacyLocalStorage = () => {
  const legacy: Partial<Record<AppStorageKey, unknown>> = {};
  APP_KEYS.forEach((key) => {
    const legacyKey = LEGACY_KEYS[key];
    const parsed = parseLegacyValue(key, localStorage.getItem(legacyKey));
    if (parsed !== undefined) legacy[key] = parsed;
  });
  return legacy;
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
const mergeWithDefaults = (defaults: AppStorageData, source: Partial<Record<AppStorageKey, unknown>>): AppStorageData => ({
  transactions: Array.isArray(source.transactions) ? (source.transactions as Transaction[]) : defaults.transactions,
  accounts: Array.isArray(source.accounts) ? (source.accounts as Account[]) : defaults.accounts,
  categories: Array.isArray(source.categories) ? (source.categories as Category[]) : defaults.categories,
  scopes: Array.isArray(source.scopes) ? (source.scopes as SpendingScope[]) : defaults.scopes,
  budgets: source.budgets !== undefined ? normalizeBudgetItems(source.budgets) : defaults.budgets,
  displayRange: typeof source.displayRange === 'string' ? (source.displayRange as DisplayRange) : defaults.displayRange,
  planTier: source.planTier === 'pro' || source.planTier === 'mvp' ? source.planTier : defaults.planTier,
  savingBuckets: Array.isArray(source.savingBuckets) ? (source.savingBuckets as SavingBucket[]) : defaults.savingBuckets,
  bucketAllocations: Array.isArray(source.bucketAllocations) ? (source.bucketAllocations as BucketAllocation[]) : defaults.bucketAllocations,
  bucketSpends: Array.isArray(source.bucketSpends) ? (source.bucketSpends as BucketSpend[]) : defaults.bucketSpends,
  incomeRules: Array.isArray(source.incomeRules) ? (source.incomeRules as IncomeAllocationRule[]) : defaults.incomeRules,
});

export const loadAppStorage = async (defaults: AppStorageData): Promise<AppStorageData> => {
  const indexedDbData = await readAll();
  if (hasAnyIndexedDbData(indexedDbData)) {
    return mergeWithDefaults(defaults, indexedDbData);
  }

  const legacyData = readLegacyLocalStorage();
  const merged = mergeWithDefaults(defaults, legacyData);
  if (APP_KEYS.some((key) => legacyData[key] !== undefined)) {
    await writeAll(merged);
  }
  return merged;
};

export const saveAppStorage = async (data: AppStorageData) => {
  await writeAll(data);
};

export const clearAppStorage = async () => {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  localStorage.clear();
};

const readByKey = async (key: string): Promise<unknown> => {
  const db = await openDb();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const row = req.result as { key: string; value: unknown } | undefined;
        resolve(row?.value);
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
};

const writeByKey = async (key: string, value: unknown) => {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
};

export const loadLearnedPrefsStorage = async (): Promise<LearnedPrefsMap> => {
  const fromDb = await readByKey(LEARNED_PREFS_DB_KEY);
  if (fromDb && typeof fromDb === 'object' && !Array.isArray(fromDb)) {
    return fromDb as LearnedPrefsMap;
  }

  let fromLegacy: LearnedPrefsMap = {};
  try {
    const raw = localStorage.getItem(LEGACY_LEARNED_PREFS_KEY);
    fromLegacy = raw ? (JSON.parse(raw) as LearnedPrefsMap) : {};
  } catch {
    fromLegacy = {};
  }

  if (Object.keys(fromLegacy).length > 0) {
    await writeByKey(LEARNED_PREFS_DB_KEY, fromLegacy);
  }

  return fromLegacy;
};

export const saveLearnedPrefsStorage = async (prefs: LearnedPrefsMap) => {
  await writeByKey(LEARNED_PREFS_DB_KEY, prefs);
};





