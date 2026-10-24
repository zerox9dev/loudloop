import { redirect } from 'next/navigation';

export default async function Page({ params }: PageProps<'/[project]/reels'>) {
  redirect(`/${(await params).project}/posts?kind=reel`);
}
