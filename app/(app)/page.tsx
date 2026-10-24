import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/user';
import { ALL, listProjects } from '@/lib/projects';

/** `/` opens Today of the project you were in last (remembered by proxy.ts), else of the first one. */
export default async function Home() {
  await requireUser();
  const [list, jar] = await Promise.all([listProjects(), cookies()]);
  const last = jar.get('last_project')?.value;
  const target = last && (last === ALL || list.some((p) => p.slug === last)) ? last : (list[0]?.slug ?? ALL);
  redirect(`/${target}/today`);
}
