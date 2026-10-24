'use client';

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { parseISO } from 'date-fns';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { PLATFORM_META } from '@/lib/platforms';
import { PlatformIcon } from '@/components/platform-icon';
import type { Platform } from '@/lib/db/schema';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/i18n/client';
import type { ChartSeries } from './followers-chart';

/** Daily profile views, stacked by platform. */
export function ViewsChart({ days, series, range }: { days: string[]; series: ChartSeries[]; range: number }) {
  const t = useTranslations('chart');
  const f = useFormat();

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

  const data = useMemo(
    () =>
      days.map((day, i) => {
        const row: Record<string, string | number | null> = { day };
        for (const s of series) row[s.platform] = s.values[i];
        return row;
      }),
    [days, series],
  );
  const total = series.reduce((sum, s) => sum + s.values.reduce<number>((a, v) => a + (v ?? 0), 0), 0);

  return (
    <section className="min-w-0 rounded-lg border bg-card p-4 sm:p-6" aria-labelledby="views-title">
      <h2 id="views-title" className="text-[19px] font-semibold">
        {t('views')}
      </h2>
      <p className="mt-1 text-[15px] text-muted-foreground">{t('viewsTotal', { n: f.num(total), days: range })}</p>
      <ChartContainer config={config} className="mt-6 aspect-auto h-[260px] w-full">
        <BarChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 4" />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={28}
            tickFormatter={(d: string) => f.date(parseISO(d), range > 180 ? 'MMM yy' : 'd MMM')}
          />
          <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => f.num(v)} />
          <ChartTooltip
            cursor={{ fill: 'var(--muted)' }}
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
                    <span className="font-medium tabular text-foreground">{f.num(Number(value))}</span>
                  </div>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((s) => (
            <Bar key={s.platform} dataKey={s.platform} stackId="views" fill={`var(--color-${s.platform})`} />
          ))}
        </BarChart>
      </ChartContainer>
    </section>
  );
}
