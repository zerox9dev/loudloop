'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronsUpDown, Layers, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { createProject } from '@/lib/actions/projects';

export type SwitcherProject = { id: number; slug: string; name: string };

const TILE = ['#2F86DE', '#D9409F', '#D97A12', '#0B3D91', '#1E8E4E', '#7C3AED', '#B45309'];

export function ProjectTile({ name, id, className }: { name: string; id: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('flex size-6 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold text-white', className)}
      style={{ background: TILE[id % TILE.length] }}
    >
      {name.trim()[0]?.toUpperCase() ?? '•'}
    </span>
  );
}

export function ProjectSwitcher({ projects, slug }: { projects: SwitcherProject[]; slug: string }) {
  const t = useTranslations('nav');
  const [creating, setCreating] = useState(false);
  const [state, action, pending] = useActionState(createProject, undefined);
  const current = projects.find((p) => p.slug === slug);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-full items-center gap-2.5 rounded-lg border bg-background px-2.5 text-left text-[15px] outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('switchProject')}
          >
            {current ? <ProjectTile name={current.name} id={current.id} /> : <Layers className="size-5 text-muted-foreground" />}
            <span className="flex-1 truncate font-medium">{current?.name ?? t('allProjects')}</span>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">{t('projects')}</DropdownMenuLabel>
          {projects.map((p) => (
            <DropdownMenuItem key={p.id} asChild>
              <Link href={`/${p.slug}`} className="gap-2.5">
                <ProjectTile name={p.name} id={p.id} className="size-5 text-[11px]" />
                <span className="flex-1 truncate">{p.name}</span>
                {p.slug === slug && <Check className="size-4" />}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/all" className="gap-2.5">
              <Layers className="size-4" />
              <span className="flex-1">{t('allProjects')}</span>
              {slug === 'all' && <Check className="size-4" />}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCreating(true)} className="gap-2.5">
            <Plus className="size-4" />
            {t('newProject')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('newProject')}</DialogTitle>
          </DialogHeader>
          <form action={action} id="new-project" className="space-y-2">
            <Label htmlFor="project-name">{t('projectName')}</Label>
            <Input id="project-name" name="name" placeholder={t('projectNamePlaceholder')} autoFocus required />
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          </form>
          <DialogFooter>
            <Button type="submit" form="new-project" disabled={pending}>
              {t('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
