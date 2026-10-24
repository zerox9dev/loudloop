'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dismissAllSignals, dismissSignal } from '@/lib/actions/signals';

export function SignalDismiss({ id }: { id: number }) {
  const t = useTranslations('signals');
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="icon" className="size-8" aria-label={t('hide')} disabled={pending} onClick={() => start(() => dismissSignal(id))}>
      <X className="size-4" />
    </Button>
  );
}

export function SignalDismissAll({ projectId }: { projectId: number | null }) {
  const t = useTranslations('signals');
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" className="h-9 rounded-lg" disabled={pending} onClick={() => start(() => dismissAllSignals(projectId))}>
      {t('hideAll')}
    </Button>
  );
}
