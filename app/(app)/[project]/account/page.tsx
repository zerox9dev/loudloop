import { getTranslations } from 'next-intl/server';
import { LogOut } from 'lucide-react';
import { requireUser } from '@/lib/auth/user';
import { PageHeader } from '@/components/page-header';
import { PlatformIcon } from '@/components/platform-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AccountRowActions,
  LinkedinTokenForm,
  MetaTokenForm,
  OAuthCard,
  ProfileForm,
  ProjectSettings,
  RemoveDemo,
  TelegramCard,
  TelegramSignIn,
  XLegacyForm,
} from '@/components/account-forms';
import { PLATFORM_META } from '@/lib/platforms';
import { decryptJson } from '@/lib/crypto';
import { getFormat } from '@/lib/i18n/server';
import { listProjects, resolveScope, scopeAccounts } from '@/lib/projects';
import { callbackUrl, OAUTH_ENV } from '@/lib/providers/oauth';
import { appKeysOverview } from '@/lib/services/app-keys';
import { telegramLoginReady } from '@/lib/services/telegram-login';
import { logout } from '@/app/login/actions';

const STATUS_TONE: Record<string, string> = {
  connected: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  demo: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  error: 'bg-red-500/10 text-red-700',
  disconnected: 'bg-muted text-muted-foreground',
};

export default async function AccountPage({ params, searchParams }: PageProps<'/[project]/account'>) {
  const user = await requireUser();
  const scope = await resolveScope((await params).project);
  const sp = await searchParams;
  const [list, projectList, t, tc, f] = await Promise.all([scopeAccounts(scope), listProjects(), getTranslations('accountPage'), getTranslations('connect'), getFormat()]);
  const projectOptions = projectList.map((p) => ({ id: p.id, name: p.name }));
  const pid = scope.project?.id;
  const hasDemo = list.some((a) => a.status === 'demo');
  const section = 'rounded-lg border bg-card p-6 space-y-4';
  const tgReady = telegramLoginReady();
  const keys = await appKeysOverview(['instagram', 'threads', 'x', 'linkedin']);
  const hasSession = (credentials: string | null) => !!decryptJson<{ session?: string }>(credentials)?.session;

  return (
    <>
      <PageHeader title={scope.project ? t('title', { project: scope.project.name }) : t('titleAll')}>
        <form action={logout}>
          <Button variant="outline" className="h-9 gap-2 rounded-lg" type="submit">
            <LogOut className="size-4" /> {t('logout')}
          </Button>
        </form>
      </PageHeader>
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
        {typeof sp.connected === 'string' && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm">{t('connected')}</p>}
        {typeof sp.error === 'string' && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-destructive">{t('error', { error: sp.error })}</p>}

        <section className={section}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[17px] font-semibold">{scope.project ? t('channels') : t('allChannels')}</h2>
            {hasDemo && <RemoveDemo />}
          </div>
          <ul className="-mx-6 -mb-6 divide-y border-t">
            {list.map((a) => {
              const isTg = a.platform === 'telegram' && a.status === 'connected';
              const signed = isTg && hasSession(a.credentials);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                  <PlatformIcon platform={a.platform} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {PLATFORM_META[a.platform].label} <span className="font-normal text-muted-foreground">{a.handle}</span>
                      {!scope.project && <span className="ml-2 text-sm font-normal text-muted-foreground">· {projectList.find((p) => p.id === a.projectId)?.name}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.lastSyncedAt ? t('syncedAgo', { ago: f.ago(a.lastSyncedAt) }) : t('neverSynced')}
                      {a.tokenExpiresAt && ` · ${t('tokenUntil', { date: f.date(a.tokenExpiresAt, 'd MMM') })}`}
                      {a.status === 'connected' &&
                        ` · ${a.historyImportedAt ? t('historyDone', { date: f.date(a.historyImportedAt, 'd MMM, HH:mm') }) : a.historyError ? t('historyFailed') : t('historyQueued')}`}
                    </p>
                    {a.lastError && <p className="mt-1 whitespace-pre-line text-xs text-destructive">{a.lastError}</p>}
                    {a.historyError && <p className="mt-1 whitespace-pre-line text-xs text-destructive">{a.historyError}</p>}
                  </div>
                  {isTg && (signed ? <Badge variant="secondary" className="rounded-md font-normal">✓ {tc('telegram.signedIn')}</Badge> : <TelegramSignIn accountId={a.id} ready={tgReady} />)}
                  <Badge variant="secondary" className={`rounded-md font-normal ${STATUS_TONE[a.status]}`}>
                    {t(`status.${a.status}` as 'status.connected')}
                  </Badge>
                  <AccountRowActions id={a.id} demo={a.status === 'demo'} projectId={a.projectId} projects={projectOptions} />
                </li>
              );
            })}
            {list.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">{t('none')}</li>}
          </ul>
        </section>

        {scope.project && pid ? (
          <>
            <section className="space-y-3">
              <h2 className="text-[17px] font-semibold">
                {tc('title')} <span className="font-normal text-muted-foreground">{tc('to', { project: scope.project.name })}</span>
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <TelegramCard projectId={pid} />
                <OAuthCard platform="instagram" projectId={pid} keys={keys.instagram} callbackUrl={callbackUrl('instagram')} envVars={OAUTH_ENV.instagram}>
                  <MetaTokenForm platform="instagram" projectId={pid} />
                </OAuthCard>
                <OAuthCard platform="threads" projectId={pid} keys={keys.threads} callbackUrl={callbackUrl('threads')} envVars={OAUTH_ENV.threads}>
                  <MetaTokenForm platform="threads" projectId={pid} />
                </OAuthCard>
                <OAuthCard platform="x" projectId={pid} keys={keys.x} callbackUrl={callbackUrl('x')} envVars={OAUTH_ENV.x}>
                  <XLegacyForm projectId={pid} />
                </OAuthCard>
                <OAuthCard platform="linkedin" projectId={pid} keys={keys.linkedin} callbackUrl={callbackUrl('linkedin')} envVars={OAUTH_ENV.linkedin}>
                  <LinkedinTokenForm projectId={pid} />
                </OAuthCard>
              </div>
            </section>
            <section className={section}>
              <h2 className="text-[17px] font-semibold">{t('project')}</h2>
              <ProjectSettings id={pid} name={scope.project.name} canDelete={list.length === 0} />
            </section>
          </>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{t('openProject')}</p>
        )}

        <section className={section}>
          <h2 className="text-[17px] font-semibold">{t('profile')}</h2>
          <ProfileForm name={user.name} email={user.email} locale={user.locale} />
        </section>
      </div>
    </>
  );
}
