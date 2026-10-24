'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { parseISO } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/i18n/client';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';


export function ClicksChart({ data }: { data: { day: string; clicks: number }[] }) {
  const t = useTranslations('clicks');
  const f = useFormat();
  const config = { clicks: { label: t('label'), color: 'var(--foreground)' } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 4" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(d: string) => f.date(parseISO(d), 'd MMM')} />
        <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => (p?.[0]?.payload?.day ? f.date(parseISO(p[0].payload.day), 'd MMMM') : '')} />} />
        <Bar dataKey="clicks" fill="var(--color-clicks)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
