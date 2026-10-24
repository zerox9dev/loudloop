import { desc, eq, sql } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { getFormat } from '@/lib/i18n/server';
import { db, accounts, comments } from '@/lib/db';
import { inScope, resolveScope } from '@/lib/projects';
import { PageHeader } from '@/components/page-header';
import { PlatformIcon } from '@/components/platform-icon';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Platform } from '@/lib/db/schema';

export default async function PeoplePage({ params }: PageProps<'/[project]/people'>) {
  const scope = await resolveScope((await params).project);
  const [t, f] = await Promise.all([getTranslations('people'), getFormat()]);
  const rows = await db
    .select({
      name: comments.authorName,
      handle: sql<string | null>`max(${comments.authorHandle})`,
      platforms: sql<Platform[]>`array_agg(distinct ${accounts.platform})`,
      total: sql<number>`count(*)::int`,
      replied: sql<number>`count(${comments.repliedAt})::int`,
      last: sql<Date>`max(${comments.postedAt})`,
    })
    .from(comments)
    .innerJoin(accounts, eq(accounts.id, comments.accountId))
    .where(inScope(accounts.projectId, scope))
    .groupBy(comments.authorName)
    .orderBy(desc(sql`count(*)`))
    .limit(100);

  return (
    <>
      <PageHeader title={t('title')} />
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-8">
        <p className="text-sm text-muted-foreground">{t('intro')}</p>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{t('empty')}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>#</TableHead>
                  <TableHead>{t('person')}</TableHead>
                  <TableHead>{t('where')}</TableHead>
                  <TableHead className="text-right">{t('comments')}</TableHead>
                  <TableHead className="text-right">{t('replied')}</TableHead>
                  <TableHead className="text-right">{t('last')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.name}>
                    <TableCell className="text-muted-foreground tabular">{i + 1}</TableCell>
                    <TableCell>
                      <span className="font-medium">{r.name}</span>
                      {r.handle && <span className="ml-2 text-sm text-muted-foreground">{r.handle}</span>}
                    </TableCell>
                    <TableCell>
                      <span className="flex gap-1">
                        {r.platforms.map((p) => (
                          <PlatformIcon key={p} platform={p} size={14} />
                        ))}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular">{f.num(r.total)}</TableCell>
                    <TableCell className="text-right tabular">{f.num(r.replied)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{f.ago(new Date(r.last))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
