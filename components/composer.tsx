'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ImagePlus, ListPlus, Loader2, Send, Clock, Save, Sparkles, X as XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PlatformIcon } from '@/components/platform-icon';
import { KINDS, PLATFORM_META } from '@/lib/platforms';
import { issueTexts, platformTextLength, validateCompose } from '@/lib/services/validate';
import { useTranslations } from 'next-intl';
import { suggestVariants } from '@/lib/actions/factory';
import type { MediaItem, Platform, PostKind } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import { savePost, uploadMedia } from '@/lib/actions/posts';

export type ComposerAccount = { id: number; projectId: number; platform: Platform; handle: string; status: string };
export type ComposerPost = {
  projectId?: number;
  id?: number;
  kind: PostKind;
  text: string;
  media: MediaItem[];
  accountIds: number[];
  scheduledAt: string | null;
  sourceItemId?: number | null;
  /** platform-native texts; missing platforms use `text` */
  variants?: Partial<Record<Platform, string>>;
  status?: string;
};

const toLocalInput = (iso: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '');

export function Composer({
  accounts,
  initial,
  trigger,
  open: controlledOpen,
  onOpenChange,
  projects,
  defaultProjectId,
}: {
  accounts: ComposerAccount[];
  /** project for posts created where no account is selected yet (e.g. drafts in a fresh project) */
  defaultProjectId?: number;
  /** present in the cross-project view: accounts are grouped and one project is picked per post */
  projects?: { id: number; name: string }[];
  initial?: Partial<ComposerPost>;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const t = useTranslations('composer');
  const tr = useTranslations();
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const usable = accounts.filter((a) => a.status === 'connected' || a.status === 'demo');
  const [kind, setKind] = useState<PostKind>(initial?.kind ?? 'post');
  const supports = (a: ComposerAccount, k: PostKind) => PLATFORM_META[a.platform].kinds.includes(k);
  const [text, setText] = useState(initial?.text ?? '');
  const [variants, setVariants] = useState<Partial<Record<Platform, string>>>(initial?.variants ?? {});
  const [tab, setTab] = useState<'base' | Platform>('base');
  const [suggesting, setSuggesting] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>(initial?.media ?? []);
  const firstProject = initial?.projectId ?? defaultProjectId ?? usable[0]?.projectId;
  const [selected, setSelected] = useState<number[]>(
    initial?.accountIds ?? usable.filter((a) => a.projectId === firstProject && supports(a, initial?.kind ?? 'post')).map((a) => a.id),
  );
  // a post lives in one project: the one its selected accounts belong to
  const projectId = usable.find((a) => selected.includes(a.id))?.projectId ?? initial?.projectId ?? firstProject ?? null;
  const inProject = (a: ComposerAccount) => a.projectId === projectId;
  const groups = projects && projects.length > 1 ? projects.filter((p) => usable.some((a) => a.projectId === p.id)) : null;
  const [when, setWhen] = useState(toLocalInput(initial?.scheduledAt ?? null));
  const [errors, setErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const platforms = usable.filter((a) => selected.includes(a.id)).map((a) => a.platform);
  const uniquePlatforms = [...new Set(platforms)];
  // an emptied variant falls back to the base text (same rule as on save)
  const activeVariants = Object.fromEntries(uniquePlatforms.filter((p) => variants[p]?.trim()).map((p) => [p, variants[p]!]));
  const live = issueTexts(validateCompose({ kind, text, media, platforms, variants: activeVariants }), tr as never);
  const textFor = (p: Platform) => (variants[p] !== undefined ? variants[p]! : text);
  const effectiveText = (p: Platform) => (variants[p]?.trim() ? variants[p]! : text);

  async function suggest() {
    if (projectId === null || uniquePlatforms.length === 0) return;
    setSuggesting(true);
    try {
      const res = await suggestVariants({ projectId, text, platforms: uniquePlatforms });
      setVariants((v) => ({ ...v, ...res.variants }));
      setTab(uniquePlatforms[0]);
      toast(res.source === 'ai' ? t('variantsReady') : t('variantsTemplate'));
    } catch (e) {
      toast.error(t('failed'), { description: (e as Error).message });
    } finally {
      setSuggesting(false);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('files', f);
      const items = await uploadMedia(fd);
      setMedia((m) => [...m, ...items]);
    } catch (e) {
      toast.error(t('uploadFailed'), { description: (e as Error).message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function submit(mode: 'draft' | 'schedule' | 'now' | 'queue') {
    start(async () => {
      if (projectId === null) {
        setErrors([tr('validate.pickChannel')]);
        return;
      }
      const res = await savePost({
        id: initial?.id,
        projectId,
        kind,
        text,
        media,
        accountIds: selected,
        scheduledAt: when ? new Date(when).toISOString() : null,
        mode,
        sourceItemId: initial?.sourceItemId ?? null,
        variants: Object.fromEntries(uniquePlatforms.map((p) => [p, variants[p] ?? null])),
      });
      if (!res.ok) {
        setErrors(res.errors);
        return;
      }
      toast(mode === 'draft' ? t('saved') : mode === 'now' ? t('sentNow') : mode === 'queue' ? t('queued') : t('scheduled'), {
        description: mode === 'schedule' && when ? format(new Date(when), 'd MMM, HH:mm') : undefined,
      });
      setOpen(false);
      setErrors([]);
      if (!initial?.id) {
        setText('');
        setMedia([]);
        setWhen('');
      }
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>{initial?.id ? t('editTitle') : t('newTitle')}</SheetTitle>
          <SheetDescription>{t('subtitle')}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t('channels')}</legend>
            {(groups ?? [null]).map((g) => (
            <div key={g?.id ?? 'all'} className="space-y-1.5">
              {g && <p className="text-xs text-muted-foreground">{g.name}</p>}
            <div className="flex flex-wrap gap-2">
              {usable.filter((a) => !g || a.projectId === g.id).map((a) => {
                const on = selected.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setSelected((s) => {
                        if (on) return s.filter((x) => x !== a.id);
                        // picking an account from another project switches the post to that project
                        return inProject(a) ? [...s, a.id] : [a.id];
                      })
                    }
                    className={cn(
                      'flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-colors',
                      on ? 'border-foreground/30 bg-muted' : 'text-muted-foreground hover:bg-muted/60',
                    )}
                  >
                    <PlatformIcon platform={a.platform} className={cn(!on && 'opacity-40')} />
                    {PLATFORM_META[a.platform].label}
                  </button>
                );
              })}
            </div>
            </div>
            ))}
              {usable.length === 0 && <p className="text-sm text-muted-foreground">{t('connectHint')}</p>}
          </fieldset>

          <div className="space-y-2">
            <Label>{t('format')}</Label>
            <ToggleGroup
              type="single"
              value={kind}
              onValueChange={(v) => {
                if (!v) return;
                const k = v as PostKind;
                setKind(k);
                // drop platforms that can't take this format, add back ones that can when nothing is left
                setSelected((s) => {
                  const kept = s.filter((id) => usable.some((a) => a.id === id && supports(a, k)));
                  return kept.length ? kept : usable.filter((a) => inProject(a) && supports(a, k)).map((a) => a.id);
                });
              }} className="rounded-lg bg-muted p-1">
              {KINDS.map((k) => (
                <ToggleGroupItem key={k} value={k} className="h-8 rounded-md px-3 data-[state=on]:bg-background data-[state=on]:shadow-sm">
                  {tr(`kinds.${k}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="compose-text">{t('text')}</Label>
              <Button type="button" variant="ghost" size="sm" onClick={suggest} disabled={suggesting || !text.trim() || uniquePlatforms.length === 0}>
                {suggesting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {t('suggest')}
              </Button>
            </div>
            <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('variantsTabs')}>
              {(['base', ...uniquePlatforms] as const).map((tab_) => (
                <button
                  key={tab_}
                  type="button"
                  role="tab"
                  aria-selected={tab === tab_}
                  onClick={() => setTab(tab_)}
                  className={cn('flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm', tab === tab_ ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60')}
                >
                  {tab_ === 'base' ? t('base') : <PlatformIcon platform={tab_} size={14} />}
                  {tab_ !== 'base' && (variants[tab_] !== undefined ? <span className="size-1.5 rounded-full bg-foreground/60" aria-label={t('ownText')} /> : null)}
                </button>
              ))}
            </div>
            {tab === 'base' || !uniquePlatforms.includes(tab) ? (
              <Textarea id="compose-text" value={text} onChange={(e) => setText(e.target.value)} rows={8} className="resize-y text-[15px]" placeholder={t('basePlaceholder')} />
            ) : (
              <div className="space-y-1.5">
                <Textarea
                  id="compose-text"
                  value={textFor(tab)}
                  onChange={(e) => setVariants((v) => ({ ...v, [tab]: e.target.value }))}
                  rows={8}
                  className="resize-y text-[15px]"
                  aria-label={t('textFor', { platform: PLATFORM_META[tab].label })}
                />
                {variants[tab] !== undefined && (
                  <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" onClick={() =>
                      setVariants((v) => {
                        const next = { ...v };
                        delete next[tab];
                        return next;
                      })
                    }>
                    {t('useBase')}
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular">
              {uniquePlatforms.map((p) => {
                const limit = PLATFORM_META[p].textLimit;
                const len = platformTextLength(p, effectiveText(p));
                return (
                  <span key={p} className={cn('flex items-center gap-1.5', len > limit && 'text-destructive')}>
                    <PlatformIcon platform={p} size={12} />
                    {len}/{limit}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('media')}</Label>
            <div className="flex flex-wrap gap-2">
              {media.map((m, i) => (
                <div key={m.path} className="group relative size-20 overflow-hidden rounded-lg border bg-muted">
                  {m.mime.startsWith('video/') ? (
                    <video src={`/media/${m.path}`} className="size-full object-cover" muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/media/${m.path}`} alt="" className="size-full object-cover" />
                  )}
                  <button
                    type="button"
                    aria-label={t('remove')}
                    onClick={() => setMedia((all) => all.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 rounded-full bg-background/90 p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted/60"
              >
                {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                {t('add')}
              </button>
              <input ref={fileRef} type="file" multiple accept="image/*,video/mp4,video/quicktime" className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="compose-when">{t('when')}</Label>
            <Input id="compose-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-fit" />
          </div>

          {(errors.length > 0 || live.length > 0) && (
            <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm" role="status">
              {(errors.length ? errors : live).map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
          )}
        </div>

        <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t">
          <Button variant="ghost" onClick={() => submit('draft')} disabled={pending}>
            <Save className="size-4" />
            {initial?.status === 'review' ? t('save') : t('toDrafts')}
          </Button>
          <Button variant="outline" onClick={() => submit('queue')} disabled={pending || live.length > 0} title={t('toQueueHint')}>
            <ListPlus className="size-4" />
            {t('toQueue')}
          </Button>
          <Button variant="outline" onClick={() => submit('schedule')} disabled={pending || !when || live.length > 0}>
            <Clock className="size-4" />
            {t('schedule')}
          </Button>
          <Button onClick={() => submit('now')} disabled={pending || live.length > 0}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t('publish')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
