import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import type { Post } from '@/lib/db/schema';

const TONE: Record<Post['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  review: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  scheduled: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  publishing: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  published: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  partial: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-300',
};

export async function PostStatus({ status }: { status: Post['status'] }) {
  const t = await getTranslations('status');
  return (
    <Badge variant="secondary" className={`rounded-md font-normal ${TONE[status]}`}>
      {t(status)}
    </Badge>
  );
}
