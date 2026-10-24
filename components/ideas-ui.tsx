'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { EyeOff, Loader2, Plus, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addIdea, dismissIdea, makeDrafts } from '@/lib/actions/factory';

export function AddIdeaForm({ projects, defaultProjectId }: { projects: { id: number; name: string }[]; defaultProjectId: number }) {
  const t = useTranslations('ideas');
  const ref = useRef<HTMLFormElement>(null);
  const [projectId, setProjectId] = useState(String(defaultProjectId));
  const [state, action, pending] = useActionState(async (prev: { error?: string; ok?: string } | undefined, fd: FormData) => {
    const res = await addIdea(prev, fd);
    if (res?.ok) ref.current?.reset();
    return res;
  }, undefined);
  return (
    <form ref={ref} action={action} className="space-y-3 rounded-lg border bg-card p-4">
      <input type="hidden" name="projectId" value={projectId} />
      {projects.length > 1 && (
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-full" aria-label={t('project')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="idea-title">{t('idea')}</Label>
        <Input id="idea-title" name="title" placeholder={t('ideaPlaceholder')} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="idea-body">{t('details')}</Label>
        <Textarea id="idea-body" name="body" rows={3} placeholder={t('detailsPlaceholder')} />
      </div>
      <Input name="url" type="url" placeholder={t('linkPlaceholder')} aria-label={t('link')} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="gap-2">
          <Plus className="size-4" /> {t('add')}
        </Button>
        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
    </form>
  );
}

export function IdeaActions({ id, isProduct, hasFounder }: { id: number; isProduct: boolean; hasFounder: boolean }) {
  const tf = useTranslations('factory');
  const router = useRouter();
  const [pending, start] = useTransition();
  const [product, setProduct] = useState(true);
  const [founder, setFounder] = useState(hasFounder);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {isProduct && (
        <>
          <label className="flex items-center gap-1.5 text-sm">
            <Checkbox checked={product} onCheckedChange={(v) => setProduct(!!v)} /> {tf('fromProduct')}
          </label>
          {hasFounder && (
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={founder} onCheckedChange={(v) => setFounder(!!v)} /> {tf('fromYou')}
            </label>
          )}
        </>
      )}
      <Button
        size="sm"
        className="gap-1.5"
        disabled={pending || (isProduct && !product && !founder)}
        onClick={() =>
          start(async () => {
            const angles = isProduct ? ([product && 'product', founder && 'founder'].filter(Boolean) as ('product' | 'founder')[]) : (['founder'] as const);
            const res = await makeDrafts(id, [...angles]);
            const reasons = res.skipped.map((s) => tf(`skip.${s.code}`, s.values));
            if (res.created) toast(tf('drafts', { n: res.created }), { description: [res.ai ? tf('byClaude') : tf('byTemplate'), ...reasons].join(' · ') });
            else toast.error(tf('nothing'), { description: reasons.join(' · ') });
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
        {tf('makePosts')}
      </Button>
      <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" disabled={pending} onClick={() => start(() => dismissIdea(id))}>
        <EyeOff className="size-4" /> {tf('hide')}
      </Button>
    </div>
  );
}
