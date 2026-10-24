'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, Monitor, RefreshCw, Share } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlatformIcon } from '@/components/platform-icon';
import { PLATFORM_META } from '@/lib/platforms';
import type { Platform } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import { createShareLink, refreshAll } from '@/lib/actions/overview';
import { RANGES } from '@/lib/platforms';



export function OverviewFilters({
  platforms,
  selected,
  range,
  projectId = null,
  readOnly = false,
}: {
  platforms: Platform[];
  selected: Platform[] | null;
  range: number;
  projectId?: number | null;
  readOnly?: boolean;
}) {
  const t = useTranslations('filters');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(next: { p?: Platform[] | null; range?: number }) {
    const sp = new URLSearchParams(params);
    if (next.p !== undefined) {
      if (!next.p || next.p.length === 0 || next.p.length === platforms.length) sp.delete('p');
      else sp.set('p', next.p.join(','));
    }
    if (next.range !== undefined) sp.set('range', String(next.range));
    startTransition(() => router.replace(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  function toggle(p: Platform) {
    const cur = selected ?? [];
    update({ p: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
  }

  const chip = 'h-9 rounded-lg border px-3.5 text-[15px] font-normal shadow-none';

  return (
    <div className={cn('flex flex-wrap items-center gap-2 transition-opacity', pending && 'opacity-70')}>
      <Button variant="outline" className={cn(chip, !selected && 'border-transparent bg-muted hover:bg-muted')} onClick={() => update({ p: null })} aria-pressed={!selected}>
        {t('all')}
      </Button>
      {platforms.map((p) => {
        const on = selected?.includes(p) ?? false;
        return (
          <Button
            key={p}
            variant="outline"
            title={PLATFORM_META[p].label}
            className={cn(chip, 'gap-2 px-2.5 2xl:px-3.5', on && 'border-foreground/25 bg-muted hover:bg-muted')}
            onClick={() => toggle(p)}
            aria-pressed={on}
          >
            <PlatformIcon platform={p} size={16} />
            <span className="sr-only 2xl:not-sr-only">{PLATFORM_META[p].label}</span>
          </Button>
        );
      })}
      <Select value={String(range)} onValueChange={(v) => update({ range: Number(v) })}>
        <SelectTrigger className="h-9! w-[150px] rounded-lg text-[15px] shadow-none" aria-label={t('period')}>
          <CalendarDays className="size-4 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGES.map((r) => (
            <SelectItem key={r} value={String(r)}>
              {t('days', { n: r })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!readOnly && (
        <>
          <Button
            variant="outline"
            className={cn(chip, 'gap-2')}
            onClick={async () => {
              await refreshAll();
              toast(t('syncStarted'), { description: t('syncHint') });
              setTimeout(() => router.refresh(), 8000);
            }}
          >
            <RefreshCw className="size-4" />
            {t('refresh')}
          </Button>
          <Button
            className="h-9 gap-2 rounded-lg px-3.5 text-[15px]"
            onClick={async () => {
              const { url } = await createShareLink(projectId);
              const full = url.startsWith('http') ? url : `${location.origin}${url}`;
              await navigator.clipboard.writeText(full).catch(() => undefined);
              toast(t('linkCopied'), { description: full });
            }}
          >
            <Share className="size-4" />
            {t('share')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground"
            aria-label={t('fullscreen')}
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
          >
            <Monitor className="size-[18px]" />
          </Button>
        </>
      )}
    </div>
  );
}
