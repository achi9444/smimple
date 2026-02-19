export type TransactionType = 'income' | 'expense' | 'transfer';
export type DisplayRange = 'all' | 'month' | 'week' | 'custom';
export type PlanTier = 'mvp' | 'pro';

export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: 'TWD', symbol: '$', name: '新臺幣 (TWD)' },
  { code: 'USD', symbol: '$', name: '美元 (USD)' },
  { code: 'JPY', symbol: '¥', name: '日圓 (JPY)' },
  { code: 'EUR', symbol: '€', name: '歐元 (EUR)' },
  { code: 'GBP', symbol: '£', name: '英鎊 (GBP)' },
  { code: 'CNY', symbol: '¥', name: '人民幣 (CNY)' },
  { code: 'HKD', symbol: '$', name: '港幣 (HKD)' },
  { code: 'KRW', symbol: '₩', name: '韓元 (KRW)' },
  { code: 'SGD', symbol: '$', name: '新加坡幣 (SGD)' },
  { code: 'AUD', symbol: '$', name: '澳幣 (AUD)' },
  { code: 'CAD', symbol: '$', name: '加幣 (CAD)' },
  { code: 'THB', symbol: '฿', name: '泰銖 (THB)' },
];

export interface Account {
  id: string;
  name: string;
  balance: number;
  currencyCode: string;
  color: string;
  icon: string;
  isDisabled?: boolean;
  isArchived?: boolean;
}

export interface SpendingScope {
  id: string;
  name: string;
  color: string;
  isSystem?: boolean;
}

export interface BudgetItem {
  id: string;
  name: string;
  currencyCode: string;
  amount: number;
  period: 'week' | 'month' | 'year';
  scopeIds: Array<'all' | string>;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currencyCode: string;
  description: string;
  category: string;
  accountId: string;
  toAccountId?: string;
  bucketId?: string;
  scopeId?: string;
  date: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type?: TransactionType;
  isSystem?: boolean;
}

export interface SavingBucket {
  id: string;
  name: string;
  targetAmount: number;
  color: string;
  priority: number;
}

export interface BucketAllocation {
  id: string;
  bucketId: string;
  accountId: string;
  amount: number;
  source: 'manual' | 'auto';
  linkedTransactionId?: string;
  createdAt: string;
}

export interface IncomeAllocationRule {
  id: string;
  bucketId: string;
  sourceAccountId?: string;
  type: 'percent' | 'fixed';
  value: number;
  isActive: boolean;
}

export interface BucketSpend {
  id: string;
  bucketId: string;
  accountId: string;
  amount: number;
  linkedTransactionId: string;
  createdAt: string;
}

export const DEFAULT_SCOPES: SpendingScope[] = [
  { id: 'scope_personal', name: '個人', color: '#D08C70', isSystem: true },
];

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_salary', name: '薪資', icon: 'Banknote', color: '#729B79', type: 'income', isSystem: true },
  { id: 'cat_bonus', name: '獎金', icon: 'Gift', color: '#E07A5F', type: 'income', isSystem: true },
  { id: 'cat_invest_inc', name: '投資', icon: 'TrendingUp', color: '#8FB996', type: 'income', isSystem: true },
  { id: 'cat_food', name: '餐飲', icon: 'Utensils', color: '#D08C70', type: 'expense', isSystem: true },
  { id: 'cat_trans', name: '交通', icon: 'Car', color: '#5B84B1', type: 'expense', isSystem: true },
  { id: 'cat_daily', name: '日常', icon: 'ShoppingBag', color: '#cacaa6', type: 'expense', isSystem: true },
  { id: 'cat_house', name: '居家', icon: 'Home', color: '#8FB996', type: 'expense', isSystem: true },
  { id: 'cat_play', name: '娛樂', icon: 'Gamepad2', color: '#C97B63', type: 'expense', isSystem: true },
  { id: 'cat_health', name: '醫療', icon: 'Activity', color: '#E07A5F', type: 'expense', isSystem: true },
  { id: 'cat_other', name: '其他', icon: 'Layers', color: '#B7ADA4', type: 'expense', isSystem: true },
  { id: 'cat_transfer', name: '轉帳', icon: 'ArrowLeftRight', color: '#5B84B1', type: 'transfer', isSystem: true }
];

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'acc_cash', name: '現金', balance: 0, currencyCode: 'TWD', color: '#D08C70', icon: 'Wallet', isDisabled: false, isArchived: false },
  { id: 'acc_bank', name: '銀行帳戶', balance: 0, currencyCode: 'TWD', color: '#8FB996', icon: 'CreditCard', isDisabled: false, isArchived: false },
];


