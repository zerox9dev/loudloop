import 'server-only';
import { listProjects, resolveScope } from '@/lib/projects';
import { composerAccounts } from '@/lib/services/posts';

/** Common page context: the scope from the URL, accounts for the composer, project labels in /all. */
export async function loadPage(params: Promise<{ project: string }>) {
  const scope = await resolveScope((await params).project);
  const [accounts, list] = await Promise.all([composerAccounts(scope), listProjects()]);
  const projects = scope.project ? undefined : list.map((p) => ({ id: p.id, name: p.name }));
  return { scope, accounts, projects, defaultProjectId: scope.project?.id };
}
