import { and, desc, eq, isNull } from 'drizzle-orm';
import { inScope, resolveScope } from '@/lib/projects';
import { getTranslations } from 'next-intl/server';
import { getFormat } from '@/lib/i18n/server';
import { signalText } from '@/lib/i18n/signals';
import { AlertTriangle, Info, Sparkles } from 'lucide-react';
import { db, accounts, signals } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { PlatformIcon } from '@/components/platform-icon';
import { SignalDismiss, SignalDismissAll } from '@/components/signal-dismiss';

const ICON = {
  good: { Icon: Sparkles, className: 'text-positive', label: 'good' },
  warn: { Icon: AlertTriangle, className: 'text-amber-600', label: 'warn' },
  info: { Icon: Info, className: 'text-muted-foreground', label: 'info' },
} as const;

export default async function SignalsPage({ params }: PageProps<'/[project]/signals'>) {
  const scope = await resolveScope((await params).project);
  const [t, tAll, f] = await Promise.all([getTranslations('signals'), getTranslations(), getFormat()]);
  const rows = await db
    .select({ s: signals, platform: accounts.platform })
    .from(signals)
    .leftJoin(accounts, eq(accounts.id, signals.accountId))
    .where(and(isNull(signals.dismissedAt), inScope(signals.projectId, scope)))
    .orderBy(desc(signals.createdAt))
    .limit(100);
  return (
    <>
      <PageHeader title={t('title')}>{rows.length > 0 && <SignalDismissAll projectId={scope.project?.id ?? null} />}</PageHeader>
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-8">
        <p className="text-sm text-muted-foreground">{t('intro')}</p>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {rows.map(({ s, platform }) => {
              const st = signalText(s, tAll as never);
              const m = ICON[(s.severity as keyof typeof ICON) ?? 'info'] ?? ICON.info;
              return (
                <li key={s.id} className="flex items-start gap-3 px-5 py-4">
                  <m.Icon className={`mt-0.5 size-5 shrink-0 ${m.className}`} aria-label={t(m.label)} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      {platform && <PlatformIcon platform={platform} size={14} />}
                      {st.title}
                    </p>
                    {st.body && <p className="mt-0.5 text-sm text-muted-foreground">{st.body}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{f.date(s.createdAt, 'd MMM, HH:mm')}</p>
                  </div>
                  <SignalDismiss id={s.id} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
