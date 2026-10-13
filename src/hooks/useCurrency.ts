import { useProfile } from './useProfile';
import { CurrencyCode, DEFAULT_CURRENCY, formatSalaryRange, CURRENCIES } from '@/types/currency';

export function useCurrency() {
  const { profile, loading } = useProfile();
  
  const preferredCurrency: CurrencyCode = (profile?.preferred_currency as CurrencyCode) || DEFAULT_CURRENCY;
  const currencyConfig = CURRENCIES[preferredCurrency];

  const getEffectiveCurrency = (applicationCurrency?: string | null): CurrencyCode => {
    if (applicationCurrency && applicationCurrency in CURRENCIES) {
      return applicationCurrency as CurrencyCode;
    }
    return preferredCurrency;
  };

  const formatSalary = (
    min?: number | null,
    max?: number | null,
    applicationCurrency?: string | null
  ): string => {
    const effectiveCurrency = getEffectiveCurrency(applicationCurrency);
    return formatSalaryRange(min, max, effectiveCurrency);
  };

  return {
    preferredCurrency,
    currencyConfig,
    loading,
    getEffectiveCurrency,
    formatSalary,
  };
}
