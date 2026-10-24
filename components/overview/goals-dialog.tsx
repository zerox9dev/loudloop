'use client';

import { useState, useTransition } from 'react';
import { Target } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PlatformIcon } from '@/components/platform-icon';
import { PLATFORM_META } from '@/lib/platforms';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/i18n/client';
import type { Platform } from '@/lib/db/schema';
import { saveGoals } from '@/lib/actions/overview';

type Row = { accountId: number; platform: Platform; handle: string; followers: number; target: number | null };

export function GoalsDialog({ rows, monthLabel }: { rows: Row[]; monthLabel: string }) {
  const t = useTranslations('overview');
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() => Object.fromEntries(rows.map((r) => [r.accountId, r.target ? String(r.target) : ''])));
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 gap-2 rounded-lg text-[15px] shadow-none">
          <Target className="size-4" />
          {t('editGoals')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('goalsFor', { month: monthLabel })}</DialogTitle>
          <DialogDescription>{t('goalsHint')}</DialogDescription>
        </DialogHeader>
        <form
          id="goals-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              await saveGoals(rows.map((r) => ({ accountId: r.accountId, target: values[r.accountId] ? Number(values[r.accountId]) : null })));
              toast(t('goalsSaved'));
              setOpen(false);
            });
          }}
        >
          {rows.map((r) => (
            <div key={r.accountId} className="grid grid-cols-[1fr_9rem] items-center gap-3">
              <Label htmlFor={`goal-${r.accountId}`} className="flex flex-col items-start gap-0.5 font-normal">
                <span className="flex items-center gap-2 font-medium">
                  <PlatformIcon platform={r.platform} />
                  {PLATFORM_META[r.platform].label}
                </span>
                <span className="text-xs text-muted-foreground">{t('now', { n: f.num(r.followers) })}</span>
              </Label>
              <Input
                id={`goal-${r.accountId}`}
                inputMode="numeric"
                pattern="[0-9]*"
                className="tabular"
                placeholder="—"
                value={values[r.accountId]}
                onChange={(e) => setValues((v) => ({ ...v, [r.accountId]: e.target.value.replace(/\D/g, '') }))}
              />
            </div>
          ))}
        </form>
        <DialogFooter>
          <Button type="submit" form="goals-form" disabled={pending}>
            {pending ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
