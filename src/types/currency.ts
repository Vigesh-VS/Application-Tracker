export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD' | 'CAD' | 'AUD';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB' },
  AED: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', locale: 'ar-AE' },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG' },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU' },
};

export const CURRENCY_OPTIONS = Object.values(CURRENCIES);

export const DEFAULT_CURRENCY: CurrencyCode = 'INR';

export function formatCurrency(
  amount: number,
  currencyCode: CurrencyCode = DEFAULT_CURRENCY
): string {
  const config = CURRENCIES[currencyCode];
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.code,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatSalaryRange(
  min?: number | null,
  max?: number | null,
  currencyCode: CurrencyCode = DEFAULT_CURRENCY
): string {
  if (!min && !max) return 'Unpaid / Not specified';
  
  if (min && max) {
    return `${formatCurrency(min, currencyCode)} - ${formatCurrency(max, currencyCode)}`;
  }
  if (min) {
    return `${formatCurrency(min, currencyCode)}+`;
  }
  return `Up to ${formatCurrency(max!, currencyCode)}`;
}
