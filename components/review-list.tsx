'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/i18n/client';
import { Check, ListPlus, Pencil, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Composer, type ComposerAccount, type ComposerPost } from '@/components/composer';
import { PlatformIcon } from '@/components/platform-icon';
import { PLATFORM_META } from '@/lib/platforms';
import type { Platform } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import { approve, reject } from '@/lib/actions/factory';

export type ReviewItem = ComposerPost & {
  id: number;
  projectName: string;
  isFounder: boolean;
  ideaTitle: string | null;
  texts: { platform: Platform; text: string }[];
};

export function ReviewList({ items, accounts, projects }: { items: ReviewItem[]; accounts: ComposerAccount[]; projects?: { id: number; name: string }[] }) {
  const t = useTranslations('factory');
  const f = useFormat();
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<ReviewItem | null>(null);
  const [pending, start] = useTransition();

  function run(ids: number[], action: 'queue' | 'now' | 'reject') {
    start(async () => {
      if (action === 'reject') {
        await reject(ids);
        toast(ids.length > 1 ? t('rejectedN', { n: ids.length }) : t('rejected'));
      } else {
        const res = await approve(ids, action);
        const first = res[0];
        toast(action === 'now' ? t('sentNow') : t('queuedN', { n: res.length }), {
          description: action === 'queue' && first ? t('nextSlot', { when: f.date(new Date(first.at), 'EEEEEE d MMM, HH:mm') }) : undefined,
        });
      }
      setSelected((s) => s.filter((id) => !ids.includes(id)));
      router.refresh();
    });
  }

  if (items.length === 0)
    return <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{t('allChecked')}</p>;

  const allOn = selected.length === items.length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={allOn} onCheckedChange={(v) => setSelected(v ? items.map((i) => i.id) : [])} aria-label={t('selectAll')} />
          {selected.length ? t('selected', { n: selected.length }) : t('selectAll')}
        </label>
        {selected.length > 0 && (
          <>
            <Button size="sm" className="gap-1.5" disabled={pending} onClick={() => run(selected, 'queue')}>
              <ListPlus className="size-4" /> {t('toQueue')}
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" disabled={pending} onClick={() => run(selected, 'reject')}>
              <X className="size-4" /> {t('reject')}
            </Button>
          </>
        )}
      </div>
      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {items.map((item) => {
          const on = selected.includes(item.id);
          return (
            <li key={item.id} className={cn('flex gap-3 p-4', on && 'bg-muted/40')}>
              <Checkbox
                className="mt-1"
                checked={on}
                onCheckedChange={(v) => setSelected((s) => (v ? [...s, item.id] : s.filter((x) => x !== item.id)))}
                aria-label={t('selectDraft')}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{item.projectName}</span>
                  <span className={cn('rounded-md px-1.5 py-0.5 text-xs', item.isFounder ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-sky-500/10 text-sky-700 dark:text-sky-300')}>
                    {item.isFounder ? t('fromYou') : t('fromProduct')}
                  </span>
                  {item.ideaTitle && <span className="truncate text-muted-foreground">· {item.ideaTitle}</span>}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {item.texts.map((t) => (
                    <div key={t.platform} className="rounded-md border bg-background p-3">
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <PlatformIcon platform={t.platform} size={13} />
                        {PLATFORM_META[t.platform].label}
                        <span className="ml-auto tabular">{t.text.length}</span>
                      </div>
                      <p className="line-clamp-6 whitespace-pre-line text-sm">{t.text}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <Button size="sm" className="justify-start gap-1.5" disabled={pending} onClick={() => run([item.id], 'queue')}>
                  <Check className="size-4" /> {t('toQueue')}
                </Button>
                <Button size="sm" variant="outline" className="justify-start gap-1.5" disabled={pending} onClick={() => run([item.id], 'now')}>
                  <Send className="size-4" /> {t('now')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start gap-1.5" onClick={() => setEditing(item)}>
                  <Pencil className="size-4" /> {t('edit')}
                </Button>
                <Button size="sm" variant="ghost" className="justify-start gap-1.5 text-destructive" disabled={pending} onClick={() => run([item.id], 'reject')}>
                  <X className="size-4" /> {t('reject')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {editing && (
        <Composer key={editing.id} accounts={accounts} projects={projects} initial={editing} open onOpenChange={(o) => !o && setEditing(null)} />
      )}
    </div>
  );
}
