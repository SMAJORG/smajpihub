import type { i18n } from 'i18next';

// Display only. Never use localized digits as API values or form input values.
const cache = new Map<string, Intl.NumberFormat>();
const numberLocale = (instance: i18n) => {
  const locale = instance.resolvedLanguage || instance.language || 'en';
  return /^ar(?:-|$)/.test(locale) ? 'ar-u-nu-arab' : locale;
};
export function displayNumber(value: number, instance: i18n): string {
  const locale = numberLocale(instance);
  let formatter = cache.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 20 });
    cache.set(locale, formatter);
  }
  return formatter.format(value);
}

export function localizeDisplay(value: unknown, instance: i18n): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? displayNumber(value, instance) : value;
  if (typeof value !== 'string') return value;
  // Currency values already formatted by the application retain every digit,
  // precision and currency symbol. Replace only display digits/separators.
  // Plain strings (versions, phone numbers, IDs, names) remain untouched.
  if (!/^\s*(?:[$€£¥π]\s*[+-]?\d[\d,.]*|[+-]?\d[\d,.]*\s*(?:USD|USDT|Pi|%))\s*$/.test(value)) return value;
  const locale = numberLocale(instance);
  const formatter = new Intl.NumberFormat(locale, { useGrouping: false });
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
  const decimal = parts.find(part => part.type === 'decimal')?.value || '.';
  const group = parts.find(part => part.type === 'group')?.value || ',';
  return value.replace(/[0-9.,]/g, char => char === '.' ? decimal : char === ',' ? group : formatter.format(Number(char)));
}
