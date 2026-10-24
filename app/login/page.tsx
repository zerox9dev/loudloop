'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/logo';
import { login } from './actions';

export default function LoginPage() {
  const t = useTranslations('login');
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <main className="flex min-h-svh items-center justify-center bg-surface px-4">
      <form action={action} className="w-full max-w-sm space-y-5 rounded-lg border bg-background p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <Logo className="size-10" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Loudloop</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t('password')}</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state?.error && <p className="text-sm text-destructive" role="alert">{t(`errors.${state.error}`)}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t('submitting') : t('submit')}
        </Button>
      </form>
    </main>
  );
}
