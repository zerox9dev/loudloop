'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/i18n/client';
import { Check, CornerDownRight, Loader2, Reply } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PlatformIcon } from '@/components/platform-icon';
import type { Platform } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import { markRead, replyToComment } from '@/lib/actions/replies';

export type CommentView = {
  id: number;
  platform: Platform;
  authorName: string;
  authorHandle: string | null;
  text: string;
  postedAt: string;
  isRead: boolean;
  replyText: string | null;
  postText: string | null;
  postUrl: string | null;
};

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

export function CommentItem({ c }: { c: CommentView }) {
  const t = useTranslations('replies');
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [pending, start] = useTransition();
  const [read, setRead] = useState(c.isRead);
  const [reply, setReply] = useState(c.replyText);

  return (
    <li className={cn('flex gap-3 px-5 py-4', !read && 'bg-sky-500/[0.04]')}>
      <div className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium">
        {initials(c.authorName)}
        <PlatformIcon platform={c.platform} className="absolute -right-1.5 -bottom-1.5 rounded-sm bg-background p-px" size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">{c.authorName}</span>
          {c.authorHandle && <span className="text-muted-foreground">{c.authorHandle}</span>}
          <span className="text-muted-foreground" suppressHydrationWarning>
            · {f.ago(new Date(c.postedAt))}
          </span>
          {!read && <span className="size-1.5 rounded-full bg-sky-500" aria-label={t('notRead')} />}
        </div>
        <p className="mt-1 text-[15px]">{c.text}</p>
        {c.postText && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {t('toPost')}{' '}
            {c.postUrl ? (
              <a href={c.postUrl} target="_blank" rel="noreferrer" className="hover:underline">
                {c.postText}
              </a>
            ) : (
              c.postText
            )}
          </p>
        )}
        {reply && (
          <p className="mt-2 flex gap-1.5 text-sm text-muted-foreground">
            <CornerDownRight className="mt-0.5 size-3.5 shrink-0" />
            {reply}
          </p>
        )}
        {open && (
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await replyToComment(c.id, text);
                if (!res.ok) return void toast.error(t('sendFailed'), { description: res.error });
                setReply(text);
                setRead(true);
                setOpen(false);
                setText('');
                toast(t('sent'));
              });
            }}
          >
            <Textarea autoFocus rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('placeholder')} aria-label={t('reply')} />
            <div className="flex gap-2">
              <Button size="sm" type="submit" disabled={pending || !text.trim()}>
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                {t('send')}
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
            </div>
          </form>
        )}
      </div>
      {!open && (
        <div className="flex shrink-0 items-start gap-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            <Reply className="size-4" />
            {t('answer')}
          </Button>
          {!read && (
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label={t('markRead')}
              onClick={() => start(async () => {
                setRead(true);
                await markRead([c.id]);
              })}
            >
              <Check className="size-4" />
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
