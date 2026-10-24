import { getTranslations } from 'next-intl/server';
import { getFormat } from '@/lib/i18n/server';
import { AlertCircle, ExternalLink, Film, Image as ImageIcon } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlatformIcon } from '@/components/platform-icon';
import { PostStatus } from '@/components/post-status';
import { PostRowActions } from '@/components/post-row-actions';
import type { ComposerAccount } from '@/components/composer';
import { PLATFORM_META } from '@/lib/platforms';
import { toComposerPost, type PostWithTargets } from '@/lib/services/posts';

export async function PostsTable({
  rows,
  accounts,
  empty,
  dateField = 'publishedAt',
  projects,
}: {
  rows: PostWithTargets[];
  accounts: ComposerAccount[];
  empty: string;
  dateField?: 'publishedAt' | 'scheduledAt';
  projects?: { id: number; name: string }[];
}) {
  const [t, tk, f] = await Promise.all([getTranslations('posts'), getTranslations('kinds'), getFormat()]);
  if (rows.length === 0) return <p className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-[45%]">{t('colPost')}</TableHead>
            <TableHead>{t('colChannels')}</TableHead>
            <TableHead>{dateField === 'publishedAt' ? t('colPublished') : t('colWhen')}</TableHead>
            <TableHead className="text-right">{t('colViews')}</TableHead>
            <TableHead className="text-right">{t('colReactions')}</TableHead>
            <TableHead className="text-right">{t('colComments')}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => {
            const at = p[dateField] ?? p.scheduledAt ?? p.updatedAt;
            const thumb = p.media[0];
            return (
              <TableRow key={p.id}>
                <TableCell className="max-w-0">
                  <div className="flex items-start gap-3">
                    {thumb ? (
                      thumb.mime.startsWith('video/') ? (
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted"><Film className="size-4 text-muted-foreground" /></div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/media/${thumb.path}`} alt="" className="size-10 shrink-0 rounded-md object-cover" />
                      )
                    ) : p.kind !== 'post' ? (
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted"><ImageIcon className="size-4 text-muted-foreground" /></div>
                    ) : null}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.text || <span className="text-muted-foreground">{t('noText')}</span>}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        {projects && <span>{projects.find((x) => x.id === p.projectId)?.name} ·</span>}
                        <span>{tk(p.kind)}</span>
                        <PostStatus status={p.status} />
                        {p.imported && <span title={t('importedHint')}>{t('imported')}</span>}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {p.targets.map((tg) => (
                      <span key={tg.id} className="flex items-center gap-1.5 text-sm" title={tg.error ?? undefined}>
                        <PlatformIcon platform={tg.platform} size={14} />
                        {tg.url ? (
                          <a href={tg.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                            {PLATFORM_META[tg.platform].label}
                            <ExternalLink className="size-3 text-muted-foreground" />
                          </a>
                        ) : (
                          PLATFORM_META[tg.platform].label
                        )}
                        {tg.status === 'failed' && <AlertCircle className="size-3.5 text-destructive" aria-label={tg.error ?? t('error')} />}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular">{at ? f.date(at, 'd MMM, HH:mm') : '—'}</TableCell>
                <TableCell className="text-right tabular">{f.num(p.totals.views)}</TableCell>
                <TableCell className="text-right tabular">{f.num(p.totals.reactions)}</TableCell>
                <TableCell className="text-right tabular">{f.num(p.totals.comments)}</TableCell>
                <TableCell>
                  {!p.imported && <PostRowActions
                    accounts={accounts}
                    projects={projects}
                    editable={!p.imported && ['draft', 'scheduled', 'failed'].includes(p.status)}
                    retryable={!p.imported && ['failed', 'partial', 'publishing'].includes(p.status)}
                    post={toComposerPost(p)}
                  />}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
