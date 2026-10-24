import { redirect } from 'next/navigation';

export default async function Page({ params }: PageProps<'/[project]/stories'>) {
  redirect(`/${(await params).project}/posts?kind=story`);
}
