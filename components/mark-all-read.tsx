'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { markAllRead } from '@/lib/actions/replies';

export function MarkAllRead({ projectId }: { projectId: number | null }) {
  const t = useTranslations('replies');
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" className="h-9 gap-2 rounded-lg" disabled={pending} onClick={() => start(() => markAllRead(projectId))}>
      <CheckCheck className="size-4" />
      {t('markAll')}
    </Button>
  );
}
