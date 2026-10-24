'use client';

import { useActionState, useRef, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { PenLine, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Composer, type ComposerAccount } from '@/components/composer';
import { addSource, refreshSource, removeSource } from '@/lib/actions/sources';

export function AddSourceForm({ projectId }: { projectId: number }) {
  const t = useTranslations('sources');
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: { error?: string } | undefined, fd: FormData) => {
    const res = await addSource(prev, fd);
    if (!res.error) ref.current?.reset();
    return res;
  }, undefined);
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <Input name="name" placeholder={t('name')} aria-label={t('name')} className="w-full sm:w-48" required />
      <Input name="url" type="url" placeholder="https://example.com/rss" aria-label={t('url')} className="min-w-0 flex-1 basis-56" required />
      <Button type="submit" disabled={pending} className="gap-2">
        <Plus className="size-4" /> {t('add')}
      </Button>
      {state?.error && <p className="w-full text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

export function SourceActions({ id }: { id: number }) {
  const t = useTranslations('sources');
  const [pending, start] = useTransition();
  return (
    <div className="flex">
      <Button variant="ghost" size="icon" className="size-8" aria-label={t('refresh')} disabled={pending} onClick={() => start(() => refreshSource(id))}>
        <RefreshCw className={`size-4 ${pending ? 'animate-spin' : ''}`} />
      </Button>
      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={t('remove')} onClick={() => start(() => removeSource(id))}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

export function ToDraftButton({ accounts, itemId, text, projectId }: { accounts: ComposerAccount[]; itemId: number; text: string; projectId: number }) {
  const t = useTranslations('sources');
  return (
    <Composer
      accounts={accounts}
      initial={{ text, sourceItemId: itemId, projectId }}
      trigger={
        <Button variant="outline" size="sm" className="gap-1.5">
          <PenLine className="size-3.5" /> {t('toPost')}
        </Button>
      }
    />
  );
}
