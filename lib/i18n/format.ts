import { format as dfFormat, formatDistanceToNowStrict } from 'date-fns';
import { enUS, ru, uk } from 'date-fns/locale';
import type { Locale } from '@/i18n/config';

const DATE_LOCALES = { en: enUS, ru, uk };
const NUMBER_LOCALES: Record<Locale, string> = { en: 'en-US', ru: 'ru-RU', uk: 'uk-UA' };

/** Locale-aware number/date helpers, shared by server (getFormat) and client (useFormat). */
export function makeFormat(locale: Locale) {
  const nf = new Intl.NumberFormat(NUMBER_LOCALES[locale]);
  const dateLocale = DATE_LOCALES[locale];
  return {
    locale,
    dateLocale,
    num: (n: number) => nf.format(Math.round(n)),
    signed: (n: number) => (n === 0 ? '0' : (n > 0 ? '+' : '−') + nf.format(Math.abs(Math.round(n)))),
    date: (d: Date | number, pattern: string) => dfFormat(d, pattern, { locale: dateLocale }),
    ago: (d: Date | number) => formatDistanceToNowStrict(d, { locale: dateLocale, addSuffix: true }),
  };
}

export type Format = ReturnType<typeof makeFormat>;
