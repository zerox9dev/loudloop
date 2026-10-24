'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PLATFORM_META } from '@/lib/platforms';
import type { Platform } from '@/lib/db/schema';
import { createChallenge, deleteChallenge } from '@/lib/actions/challenges';

export function ChallengeForm({ projectId, accounts }: { projectId: number; accounts: { id: number; platform: Platform; handle: string }[] }) {
  const t = useTranslations('challenges');
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: { error?: string } | undefined, fd: FormData) => {
    const res = await createChallenge(prev, fd);
    if (!res.error) setOpen(false);
    return res;
  }, undefined);
  const today = format(new Date(), 'yyyy-MM-dd');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-9 gap-2 rounded-lg">
          <Plus className="size-4" /> {t('new')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('new')}</DialogTitle>
        </DialogHeader>
        <form action={action} id="challenge-form" className="space-y-4">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="ch-title">{t('name')}</Label>
            <Input id="ch-title" name="title" placeholder={t('namePlaceholder')} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('channel')}</Label>
              <Select name="accountId" defaultValue="all">
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('any')}</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {PLATFORM_META[a.platform].label} {a.handle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ch-ppd">{t('postsPerDay')}</Label>
              <Input id="ch-ppd" name="postsPerDay" type="number" min={1} max={20} defaultValue={1} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ch-start">{t('start')}</Label>
              <Input id="ch-start" name="startsOn" type="date" defaultValue={today} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ch-end">{t('end')}</Label>
              <Input id="ch-end" name="endsOn" type="date" defaultValue={format(addDays(new Date(), 29), 'yyyy-MM-dd')} />
            </div>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        </form>
        <DialogFooter>
          <Button type="submit" form="challenge-form" disabled={pending}>
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteChallenge({ id }: { id: number }) {
  const t = useTranslations('challenges');
  return (
    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={t('delete')} onClick={() => deleteChallenge(id)}>
      <Trash2 className="size-4" />
    </Button>
  );
}
