import { Account, BucketAllocation, BucketSpend, Category, DisplayRange, IncomeAllocationRule, PlanTier, SavingBucket, Transaction, TransactionType } from '../types';


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
  budgets: Record<string, number>;
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

const mergeWithDefaults = (defaults: AppStorageData, source: Partial<Record<AppStorageKey, unknown>>): AppStorageData => ({
  transactions: Array.isArray(source.transactions) ? (source.transactions as Transaction[]) : defaults.transactions,
  accounts: Array.isArray(source.accounts) ? (source.accounts as Account[]) : defaults.accounts,
  categories: Array.isArray(source.categories) ? (source.categories as Category[]) : defaults.categories,
  budgets: source.budgets && typeof source.budgets === 'object' ? (source.budgets as Record<string, number>) : defaults.budgets,
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

