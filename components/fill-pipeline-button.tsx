'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fillPipeline } from '@/lib/actions/factory';

export function FillPipelineButton() {
  const t = useTranslations('factory');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      className="h-9 gap-2 rounded-lg"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const n = await fillPipeline();
          toast(n ? t('filled', { n }) : t('fullOrEmpty'), { description: n ? t('filledHint') : t('fullHint') });
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
      {t('fill')}
    </Button>
  );
}
