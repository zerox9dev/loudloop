'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Composer, type ComposerAccount, type ComposerPost } from '@/components/composer';

export function NewPostButton({
  accounts,
  initial,
  label,
  projects,
  defaultProjectId,
}: {
  accounts: ComposerAccount[];
  initial?: Partial<ComposerPost>;
  label?: string;
  projects?: { id: number; name: string }[];
  defaultProjectId?: number;
}) {
  const t = useTranslations('posts');
  return (
    <Composer
      accounts={accounts}
      projects={projects}
      defaultProjectId={defaultProjectId}
      initial={initial}
      trigger={
        <Button className="h-9 gap-2 rounded-lg">
          <Plus className="size-4" />
          {label ?? t('newPost')}
        </Button>
      }
    />
  );
}
