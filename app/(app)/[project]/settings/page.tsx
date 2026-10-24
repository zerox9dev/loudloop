import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { inArray } from 'drizzle-orm';
import { db, slots } from '@/lib/db';
import { PageHeader } from '@/components/page-header';
import { BriefForm, SlotsEditor } from '@/components/settings-ui';
import { ProjectTile } from '@/components/project-switcher';
import { listProjects, resolveScope, scopeAccounts } from '@/lib/projects';
import { isActive } from '@/lib/providers';

export default async function SettingsPage({ params }: PageProps<'/[project]/settings'>) {
  const scope = await resolveScope((await params).project);
  const [t, locale] = await Promise.all([getTranslations('settings'), getLocale()]);
  if (!scope.project) {
    const list = await listProjects();
    return (
      <>
        <PageHeader title={t('title')} />
        <div className="mx-auto w-full max-w-3xl space-y-3 p-4 md:p-8">
          <p className="text-sm text-muted-foreground">{t('perProject')}</p>
          <ul className="divide-y rounded-lg border bg-card">
            {list.map((p) => (
              <li key={p.id}>
                <Link href={`/${p.slug}/settings`} className="flex items-center gap-3 p-4 hover:bg-muted/50">
                  <ProjectTile name={p.name} id={p.id} />
                  <span className="font-medium">{p.name}</span>
                  <span className="text-sm text-muted-foreground">{p.kind === 'founder' ? t('founder') : t('product')}</span>
                  {!p.brief.about && <span className="ml-auto text-xs text-amber-700 dark:text-amber-400">{t('noBrief')}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </>
    );
  }
  const project = scope.project;
  const accs = (await scopeAccounts(scope)).filter(isActive);
  const defs = accs.length ? await db.select().from(slots).where(inArray(slots.accountId, accs.map((a) => a.id))) : [];
  const section = 'space-y-4 rounded-lg border bg-card p-6';

  return (
    <>
      <PageHeader title={t('titleProject', { name: project.name })} />
      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
        <section className={section}>
          <div>
            <h2 className="text-[17px] font-semibold">{project.kind === 'founder' ? t('briefFounder') : t('briefProduct')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('briefHint')}
            </p>
          </div>
          <BriefForm projectId={project.id} kind={project.kind} brief={project.brief} defaultLanguage={locale} />
        </section>
        <section className={section}>
          <div>
            <h2 className="text-[17px] font-semibold">{t('rhythm')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('rhythmHint')}</p>
          </div>
          {accs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('connectFirst')} <Link href={`/${project.slug}/account`} className="underline underline-offset-2">{t('connectLink')}</Link>.
            </p>
          ) : (
            <div className="divide-y">
              {accs.map((a) => (
                <SlotsEditor key={a.id} account={{ id: a.id, platform: a.platform, handle: a.handle }} initial={defs.filter((d) => d.accountId === a.id)} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

