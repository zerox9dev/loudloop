import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { PlatformIcon } from '@/components/platform-icon';
import { PLATFORM_META } from '@/lib/platforms';
import { getTranslations } from 'next-intl/server';
import { getFormat } from '@/lib/i18n/server';
import type { Format } from '@/lib/i18n/format';
import type { AccountSummary } from '@/lib/services/analytics';
import { cn } from '@/lib/utils';

function Delta({ value, label, zero, f, size = 'md' }: { value: number | null; label: string; zero?: boolean; f: Format; size?: 'md' | 'sm' }) {
  const text = size === 'md' ? 'text-[15px] sm:text-[17px]' : 'text-[13px] sm:text-[14px]';
  if (!value) {
    return (
      <div className={cn('tabular text-muted-foreground', text)}>
        — {value === 0 && zero ? '0 ' : ''}
        {label}
      </div>
    );
  }
  const up = value > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn('flex items-center justify-end gap-1 tabular', text)}>
      <Icon className={cn('size-4', up ? 'text-positive' : 'text-destructive')} strokeWidth={2} />
      <span className={up ? 'text-positive' : 'text-destructive'}>
        {up ? '+' : '−'}
        {f.num(Math.abs(value))}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

export async function GoalCard({ s, streak, projectName }: { s: AccountSummary; streak?: number; projectName?: string }) {
  const t = await getTranslations('overview');
  const f = await getFormat();
  const meta = PLATFORM_META[s.account.platform];
  const g = s.goal;
  return (
    <section className="flex min-w-0 flex-col p-4 sm:p-6" aria-label={meta.label}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 text-[17px] font-medium">
            <PlatformIcon platform={s.account.platform} size={18} />
            {meta.label}
            {projectName && <span className="truncate text-[14px] font-normal text-muted-foreground">· {projectName}</span>}
            {streak && streak >= 2 ? (
              <span className="rounded-md bg-muted px-2 py-0.5 text-[13px] font-medium tabular" title={t('streak', { n: streak })}>
                🔥 {streak}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="text-[32px] font-semibold leading-none sm:text-[40px] tracking-tight tabular">{s.hasFollowers ? f.num(s.followers) : '—'}</span>
            {g && <span className="whitespace-nowrap text-[17px] text-muted-foreground tabular">→ {f.num(g.target)}</span>}
          </div>
        </div>
        <div className="shrink-0 space-y-1 pt-0.5 text-right whitespace-nowrap">
          <Delta value={s.yesterday} label={t('yesterday')} f={f} />
          <Delta value={s.today} label={t('today')} zero f={f} size="sm" />
        </div>
      </div>

      {g && (
        <div className="mt-6 flex items-center gap-3 sm:gap-4">
          <div
            className="relative h-3 flex-1 rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={g.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('goalProgress', { platform: meta.label })}
          >
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(g.percent, 2)}%`, background: meta.color }} />
            <div
              className="absolute -top-1.5 h-6 w-0.5 rounded-full bg-foreground/70"
              style={{ left: `${g.pacePercent}%` }}
              title={t('pace', { percent: g.pacePercent })}
            />
          </div>
          <span className="w-12 text-right text-[17px] font-semibold tabular">{g.percent}%</span>
        </div>
      )}

      {!s.hasFollowers && (
        <p className="mt-3 text-[15px] text-muted-foreground">{t('noFollowers')}</p>
      )}

      {s.hasFollowers && s.insight && (
        <p className={cn('flex gap-3 text-[16px] leading-snug text-muted-foreground', g ? 'mt-4' : 'mt-3')}>
          <span aria-hidden className="text-lg leading-6">{s.insight.emoji}</span>
          <span>{s.insight.text}</span>
        </p>
      )}

      <div className="min-h-6 flex-1" />
      <dl className="grid grid-cols-3 gap-2 border-t pt-5 sm:gap-4">
        <div>
          <dt className="text-[13px] text-muted-foreground sm:text-[15px]">{t('period')}</dt>
          <dd className={cn('mt-1 flex items-center gap-1 text-[17px] tabular', s.periodGrowth ? (s.periodGrowth > 0 ? 'text-positive' : 'text-destructive') : 'text-muted-foreground')}>
            {s.periodGrowth ? (
              <>
                {s.periodGrowth > 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                {s.periodGrowth > 0 ? '+' : '−'}
                {f.num(Math.abs(s.periodGrowth))}
              </>
            ) : (
              '— 0'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted-foreground sm:text-[15px]">{t('views')}</dt>
          <dd className="mt-1 text-[17px] tabular">{f.num(s.views)}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted-foreground sm:text-[15px]">{t('reactions')}</dt>
          <dd className="mt-1 text-[17px] tabular">{f.num(s.reactions)}</dd>
        </div>
      </dl>
    </section>
  );
}
