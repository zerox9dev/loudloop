import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import ru from '@/messages/ru.json';
import uk from '@/messages/uk.json';
import { DEFAULT_LOCALE, isLocale, LOCALE_NAMES, type Locale } from '@/i18n/config';
import { makeFormat } from './format';

const MESSAGES = { en, ru, uk } as const;

/** Translator outside a request (worker, generators): messages for an explicit locale. */
export function translatorFor(locale: string | null | undefined) {
  const l: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return { t: createTranslator({ locale: l, messages: MESSAGES[l] }), f: makeFormat(l), locale: l, languageName: LOCALE_NAMES[l] };
}
