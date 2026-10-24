import { getTranslations } from 'next-intl/server';
import { PostsPage } from '@/components/posts-page';

const KINDS = ['post', 'photo', 'story', 'reel'] as const;

export default async function Page({ params, searchParams }: PageProps<'/[project]/posts'>) {
  const k = (await searchParams).kind;
  const kind = KINDS.find((x) => x === k);
  const t = await getTranslations('posts');
  return <PostsPage params={params} title={t('title')} kind={kind} empty={t('empty')} />;
}
