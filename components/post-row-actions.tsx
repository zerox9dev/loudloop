'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Composer, type ComposerAccount, type ComposerPost } from '@/components/composer';
import { deletePost, retryPost } from '@/lib/actions/posts';

export function PostRowActions({
  post,
  accounts,
  editable,
  retryable,
  projects,
}: {
  post: ComposerPost & { id: number };
  accounts: ComposerAccount[];
  editable: boolean;
  retryable: boolean;
  projects?: { id: number; name: string }[];
}) {
  const t = useTranslations('posts');
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={t('actions')}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {editable && (
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil className="size-4" /> {t('edit')}
            </DropdownMenuItem>
          )}
          {retryable && (
            <DropdownMenuItem
              onSelect={() =>
                start(async () => {
                  const res = await retryPost(post.id);
                  if (res.ok) toast(t('retryStarted'));
                  else toast.error(res.error);
                  router.refresh();
                })
              }
            >
              <RotateCcw className="size-4" /> {t('retry')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              start(async () => {
                const res = await deletePost(post.id);
                if (res.ok) toast(t('deleted'));
                else toast.error(res.error);
                router.refresh();
              })
            }
          >
            <Trash2 className="size-4" /> {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editable && <Composer accounts={accounts} projects={projects} initial={post} open={editing} onOpenChange={setEditing} />}
    </>
  );
}
