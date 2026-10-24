import { redirect } from 'next/navigation';

export default async function Page({ params }: PageProps<'/[project]/photos'>) {
  redirect(`/${(await params).project}/posts?kind=photo`);
}
