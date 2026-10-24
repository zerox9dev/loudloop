'use client';

import { useActionState, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { LOCALES, LOCALE_NAMES } from '@/i18n/config';
import { Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PlatformIcon } from '@/components/platform-icon';
import { PLATFORM_META } from '@/lib/platforms';
import type { Platform, ProjectBrief } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import { saveBrief, saveSlots } from '@/lib/actions/factory';

export function BriefForm({ projectId, kind, brief, defaultLanguage }: { projectId: number; kind: 'founder' | 'product'; brief: ProjectBrief; defaultLanguage: string }) {
  const t = useTranslations('brief');
  const [state, action, pending] = useActionState(saveBrief, undefined);
  const founder = kind === 'founder';
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="space-y-1.5">
        <Label htmlFor="b-about">{founder ? t('aboutFounder') : t('aboutProduct')}</Label>
        <Textarea id="b-about" name="about" rows={3} defaultValue={brief.about} placeholder={founder ? t('aboutFounderPh') : t('aboutProductPh')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="b-aud">{t('audience')}</Label>
          <Textarea id="b-aud" name="audience" rows={2} defaultValue={brief.audience} placeholder={t('audiencePh')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-voice">{t('voice')}</Label>
          <Textarea id="b-voice" name="voice" rows={2} defaultValue={brief.voice} placeholder={t('voicePh')} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="b-pillars">{t('pillars')}</Label>
          <Textarea id="b-pillars" name="pillars" rows={4} defaultValue={brief.pillars?.join('\n')} placeholder={founder ? t('pillarsFounderPh') : t('pillarsProductPh')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-links">{t('links')}</Label>
          <Textarea id="b-links" name="links" rows={4} defaultValue={brief.links?.map((l) => `${l.label} | ${l.url}`).join('\n')} placeholder={t('linksPh')} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="b-avoid">{t('avoid')}</Label>
          <Input id="b-avoid" name="avoid" defaultValue={brief.avoid} placeholder={t('avoidPh')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-lang">{t('language')}</Label>
          <select
            id="b-lang"
            name="language"
            defaultValue={brief.language ?? 'auto'}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="auto">{t('languageAuto', { language: LOCALE_NAMES[defaultLanguage as keyof typeof LOCALE_NAMES] ?? defaultLanguage })}</option>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t('languageHint')}</p>
        </div>
        {founder && (
          <div className="space-y-1.5">
            <Label htmlFor="b-promo">{t('promo')}</Label>
            <Input id="b-promo" name="promoShare" type="number" min={0} max={100} defaultValue={brief.promoShare ?? 25} />
            <p className="text-xs text-muted-foreground">{t('promoHint')}</p>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t('save')}
        </Button>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        {state?.ok && <p className="text-sm text-positive">{state.ok}</p>}
      </div>
    </form>
  );
}


export function SlotsEditor({ account, initial }: { account: { id: number; platform: Platform; handle: string }; initial: { weekday: number; time: string }[] }) {
  // no slots yet = the queue uses weekdays at 10:00; show exactly that so it can be tweaked
  const base = initial.length ? initial : [1, 2, 3, 4, 5].map((weekday) => ({ weekday, time: '10:00' }));
  const [days, setDays] = useState<number[]>(() => [...new Set(base.map((s) => s.weekday))].sort());
  const [times, setTimes] = useState<string[]>(() => [...new Set(base.map((s) => s.time))].sort());
  const t = useTranslations('slots');
  const days_ = t.raw('days') as string[];
  const [pending, start] = useTransition();
  const empty = initial.length === 0;

  function save(d = days, tm = times) {
    start(async () => {
      await saveSlots(account.id, d.flatMap((weekday) => tm.map((time) => ({ weekday, time }))));
      toast(t('saved'), { description: t('savedHint', { platform: PLATFORM_META[account.platform].label, n: d.length * tm.length }) });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <span className="flex w-48 items-center gap-2 text-sm">
        <PlatformIcon platform={account.platform} />
        <span className="truncate">{account.handle}</span>
      </span>
      <div className="flex gap-1" role="group" aria-label={t('weekdays')}>
        {days_.map((d, i) => {
          const on = days.includes(i + 1);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              onClick={() => setDays((s) => (on ? s.filter((x) => x !== i + 1) : [...s, i + 1].sort()))}
              className={cn('h-8 w-9 rounded-md border text-xs', on ? 'border-foreground/30 bg-muted font-medium' : 'text-muted-foreground')}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {times.map((tm, i) => (
          <span key={i} className="flex items-center gap-0.5">
            <Input
              type="time"
              value={tm}
              onChange={(e) => setTimes((s) => s.map((x, j) => (j === i ? e.target.value : x)))}
              className="h-8 w-[6.5rem]"
              aria-label={t('slotTime')}
            />
            <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setTimes((s) => s.filter((_, j) => j !== i))} aria-label={t('removeTime')}>
              <X className="size-3.5" />
            </Button>
          </span>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => setTimes((s) => [...s, '18:00'])}>
          <Plus className="size-3.5" /> {t('addTime')}
        </Button>
      </div>
      <Button size="sm" variant="outline" className="ml-auto" disabled={pending || days.length === 0 || times.length === 0} onClick={() => save()}>
        {t('save')}
      </Button>
      {empty && <span className="w-full text-xs text-muted-foreground">{t('defaultHint')}</span>}
    </div>
  );
}
