import 'server-only';
import { getLocale } from 'next-intl/server';
import { isLocale, DEFAULT_LOCALE } from '@/i18n/config';
import { makeFormat } from './format';

export async function getFormat() {
  const l = await getLocale();
  return makeFormat(isLocale(l) ? l : DEFAULT_LOCALE);
}
