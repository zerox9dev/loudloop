'use client';

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { isLocale, DEFAULT_LOCALE } from '@/i18n/config';
import { makeFormat } from './format';

export function useFormat() {
  const l = useLocale();
  return useMemo(() => makeFormat(isLocale(l) ? l : DEFAULT_LOCALE), [l]);
}
