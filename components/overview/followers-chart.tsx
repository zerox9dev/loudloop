'use client';

import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { parseISO } from 'date-fns';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PLATFORM_META } from '@/lib/platforms';
import { PlatformIcon } from '@/components/platform-icon';
import type { Platform } from '@/lib/db/schema';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/i18n/client';

type Mode = 'daily' | 'cumulative' | 'total';
const MODES: Mode[] = ['daily', 'cumulative', 'total'];

export type ChartSeries = { platform: Platform; values: (number | null)[] };

export function FollowersChart({ days, series, range }: { days: string[]; series: ChartSeries[]; range: number }) {
  const t = useTranslations('chart');
  const f = useFormat();
  const fmt = f.num;
  const [mode, setMode] = useState<Mode>('cumulative');

  const config = useMemo(
    () =>
      Object.fromEntries(
        series.map((s) => [
          s.platform,
          { label: PLATFORM_META[s.platform].label, color: PLATFORM_META[s.platform].color, icon: () => <PlatformIcon platform={s.platform} size={12} /> },
        ]),
      ) satisfies ChartConfig,
    [series],
  );

  const data = useMemo(() => {
    return days.map((day, i) => {
      const row: Record<string, string | number | null> = { day };
      for (const s of series) {
        const v = s.values[i];
        const prev = i > 0 ? s.values[i - 1] : null;
        const first = s.values.find((x) => x !== null) ?? null;
        if (v === null) row[s.platform] = null;
        else if (mode === 'total') row[s.platform] = v;
        else if (mode === 'cumulative') row[s.platform] = first === null ? null : v - first;
        else row[s.platform] = prev === null ? 0 : v - prev;
      }
      return row;
    });
  }, [days, series, mode]);

  return (
    <section className="min-w-0 rounded-lg border bg-card p-4 sm:p-6" aria-labelledby="followers-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="followers-title" className="text-[19px] font-semibold">
            {t('followers')}
          </h2>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {t('dayByDay', { n: range })}
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as Mode)}
          className="max-w-full flex-wrap rounded-lg bg-muted p-1"
          aria-label={t('mode')}
        >
          {MODES.map((m) => (
            <ToggleGroupItem
              key={m}
              value={m}
              className="h-8 rounded-lg px-2.5 text-[13px] text-muted-foreground sm:px-3 sm:text-[15px] data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              {t(m)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {series.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t('empty')}</p>
      ) : (
        <ChartContainer config={config} className="mt-6 aspect-auto h-[320px] w-full">
          <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 4" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={28}
              tickFormatter={(d: string) => f.date(parseISO(d), 'd MMM')}
            />
            <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => fmt(v)} />
            <ChartTooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const d = payload?.[0]?.payload?.day as string | undefined;
                    return d ? f.date(parseISO(d), 'd MMMM, EEEEEE') : '';
                  }}
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <PlatformIcon platform={name as Platform} size={12} />
                        {PLATFORM_META[name as Platform]?.label ?? name}
                      </span>
                      <span className="font-medium tabular text-foreground">
                        {mode !== 'total' && Number(value) > 0 ? '+' : ''}
                        {fmt(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {series.map((s) => (
              <Line key={s.platform} dataKey={s.platform} type="monotone" stroke={`var(--color-${s.platform})`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)' }} connectNulls />
            ))}
          </LineChart>
        </ChartContainer>
      )}
    </section>
  );
}
