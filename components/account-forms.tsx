'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, Copy, History, Loader2, LogIn, Trash2, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlatformIcon } from '@/components/platform-icon';
import { LOCALES, LOCALE_NAMES } from '@/i18n/config';
import { PLATFORM_META } from '@/lib/platforms';
import type { Platform } from '@/lib/db/schema';
import { deleteProject, moveAccount, renameProject } from '@/lib/actions/projects';
import {
  connectLinkedinToken,
  connectMetaToken,
  connectTelegram,
  connectX,
  deleteAccount,
  disconnectAccount,
  importHistory,
  removeDemoAccounts,
  telegramLoginCode,
  telegramLoginPassword,
  telegramLoginStart,
  updateProfile,
} from '@/lib/actions/account';

type Act = (prev: { error?: string; ok?: string } | undefined, fd: FormData) => Promise<{ error?: string; ok?: string } | undefined>;

function Result({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (!state) return null;
  return state.error ? (
    <p className="text-sm text-destructive" role="alert">
      {state.error}
    </p>
  ) : (
    <p className="text-sm text-positive" role="status">
      {state.ok}
    </p>
  );
}

function Submit({ pending, children, variant }: { pending: boolean; children: React.ReactNode; variant?: 'outline' }) {
  return (
    <Button type="submit" disabled={pending} variant={variant} className="gap-2">
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}

function CopyField({ value }: { value: string }) {
  const t = useTranslations('connect');
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/50 px-2 py-1.5 text-xs">{value}</code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => undefined);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      >
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {done ? t('copied') : t('copy')}
      </Button>
    </div>
  );
}

/**
 * One card per platform: the official way first (OAuth button, or the Telegram bot),
 * setup steps when the app keys are missing, manual tokens tucked away for developers.
 */
export function OAuthCard({
  platform,
  projectId,
  ready,
  callbackUrl,
  envVars,
  children,
}: {
  platform: Exclude<Platform, 'telegram'>;
  projectId: number;
  ready: boolean;
  callbackUrl: string;
  envVars: string[];
  children?: React.ReactNode;
}) {
  const t = useTranslations('connect');
  const label = PLATFORM_META[platform].label;
  const steps = t.raw(`steps.${platform}`) as string[];
  return (
    <div className="space-y-3 rounded-lg border bg-card p-5">
      <div className="flex items-start gap-3">
        <PlatformIcon platform={platform} size={22} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">{t(`caps.${platform}`)}</p>
        </div>
      </div>
      {ready ? (
        <Button asChild className="w-full gap-2">
          <a href={`/api/oauth/${platform}/start?project=${projectId}`}>
            <LogIn className="size-4" /> {t('with', { platform: label })}
          </a>
        </Button>
      ) : (
        <Button disabled className="w-full" variant="outline">
          {t('notConfigured', { platform: label })}
        </Button>
      )}
      <details className="group text-sm" open={!ready}>
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t('setup')}</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="mt-3 space-y-1.5">
          <p className="text-xs text-muted-foreground">{t('callback')}</p>
          <CopyField value={callbackUrl} />
          <p className="text-xs text-muted-foreground">{t('envHint', { vars: envVars.join(', ') })}</p>
          <p className="text-xs text-muted-foreground">{t('httpsHint')}</p>
        </div>
      </details>
      {children && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t('developer')}</summary>
          <div className="mt-3">{children}</div>
        </details>
      )}
    </div>
  );
}

export function TelegramCard({ projectId }: { projectId: number }) {
  const t = useTranslations('connect');
  const [state, action, pending] = useActionState(connectTelegram as Act, undefined);
  return (
    <div className="space-y-3 rounded-lg border bg-card p-5">
      <div className="flex items-start gap-3">
        <PlatformIcon platform="telegram" size={22} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Telegram</p>
          <p className="text-sm text-muted-foreground">{t('caps.telegram')}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('telegram.why')}</p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="projectId" value={projectId} />
        <div className="space-y-1.5">
          <Label htmlFor="tg-token">{t('telegram.botToken')}</Label>
          <Input id="tg-token" name="botToken" placeholder="123456:ABC…" autoComplete="off" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tg-chat">{t('telegram.channel')}</Label>
          <Input id="tg-chat" name="chatId" placeholder={t('telegram.channelPh')} required />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Submit pending={pending}>{t('telegram.submit')}</Submit>
          <Result state={state} />
        </div>
      </form>
    </div>
  );
}

/** Phone → code → (2FA password): signs the owner's Telegram account in for channel stats. */
export function TelegramSignIn({ accountId, ready }: { accountId: number; ready: boolean }) {
  const t = useTranslations('connect.telegram');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'phone' | 'code' | 'password'>('phone');
  const [token, setToken] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function next() {
    setError(undefined);
    start(async () => {
      if (step === 'phone') {
        const res = await telegramLoginStart(accountId, value);
        if (res.error || !res.token) return setError(res.error);
        setToken(res.token);
        setValue('');
        setStep('code');
        return;
      }
      const res = step === 'code' ? await telegramLoginCode(token, value) : await telegramLoginPassword(token, value);
      if (res.error) return setError(res.error);
      if (res.step === 'password') {
        setValue('');
        setStep('password');
        return;
      }
      toast(t('signIn'), { description: '✓' });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setStep('phone');
          setValue('');
          setError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={!ready} title={ready ? t('signInHint') : t('notReady')}>
          <LogIn className="size-4" /> {t('signIn')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('signIn')}</DialogTitle>
          <DialogDescription>{t('signInHint')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
        >
          <Label htmlFor="tg-login">{step === 'phone' ? t('phone') : step === 'code' ? t('code') : t('password')}</Label>
          <Input
            id="tg-login"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            type={step === 'password' ? 'password' : step === 'phone' ? 'tel' : 'text'}
            inputMode={step === 'code' ? 'numeric' : undefined}
            autoComplete={step === 'code' ? 'one-time-code' : step === 'password' ? 'current-password' : 'tel'}
            placeholder={step === 'phone' ? '+380…' : undefined}
            required
          />
          {step === 'code' && <p className="text-xs text-muted-foreground">{t('codeHint')}</p>}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full gap-2" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {step === 'phone' ? t('sendCode') : t('next')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- developer fallbacks: paste a token ----------

export function MetaTokenForm({ platform, projectId }: { platform: 'instagram' | 'threads'; projectId: number }) {
  const t = useTranslations('connect.token');
  const [state, action, pending] = useActionState(connectMetaToken as Act, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="platform" value={platform} />
      <Label htmlFor={`${platform}-token`}>{t('accessToken')}</Label>
      <Input id={`${platform}-token`} name="accessToken" autoComplete="off" placeholder={platform === 'instagram' ? 'IGAA…' : 'THAA…'} required />
      <div className="flex items-center gap-3">
        <Submit pending={pending} variant="outline">
          {t('submit')}
        </Submit>
        <Result state={state} />
      </div>
    </form>
  );
}

export function LinkedinTokenForm({ projectId }: { projectId: number }) {
  const t = useTranslations('connect.token');
  const [state, action, pending] = useActionState(connectLinkedinToken as Act, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <Label htmlFor="li-token">{t('accessToken')}</Label>
      <Input id="li-token" name="accessToken" autoComplete="off" placeholder="AQV…" required />
      <div className="flex items-center gap-3">
        <Submit pending={pending} variant="outline">
          {t('submit')}
        </Submit>
        <Result state={state} />
      </div>
    </form>
  );
}

export function XLegacyForm({ projectId }: { projectId: number }) {
  const t = useTranslations('connect.token');
  const [state, action, pending] = useActionState(connectX as Act, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <p className="text-xs text-muted-foreground">{t('xLegacy')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="accessToken" aria-label={t('xToken')} placeholder={t('xToken')} autoComplete="off" required />
        <Input name="accessSecret" type="password" aria-label={t('xSecret')} placeholder={t('xSecret')} autoComplete="off" required />
      </div>
      <div className="flex items-center gap-3">
        <Submit pending={pending} variant="outline">
          {t('submit')}
        </Submit>
        <Result state={state} />
      </div>
    </form>
  );
}

// ---------- account rows, project, profile ----------

export function AccountRowActions({ id, demo, projectId, projects }: { id: number; demo: boolean; projectId: number; projects: { id: number; name: string }[] }) {
  const t = useTranslations('accountPage');
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-1">
      {projects.length > 1 && (
        <Select value={String(projectId)} onValueChange={(v) => start(() => moveAccount(id, Number(v)))}>
          <SelectTrigger size="sm" className="h-8 w-40" aria-label={t('projectOf')}>
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
      {!demo && (
        <Button variant="ghost" size="sm" disabled={pending} title={t('historyHint')} onClick={() => start(() => importHistory(id))}>
          <History className="size-4" /> {t('history')}
        </Button>
      )}
      {!demo && (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(() => disconnectAccount(id))}>
          <Unplug className="size-4" /> {t('disconnect')}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        disabled={pending}
        onClick={() => {
          if (confirm(t('deleteConfirm'))) start(() => deleteAccount(id));
        }}
      >
        <Trash2 className="size-4" /> {t('delete')}
      </Button>
    </div>
  );
}

export function RemoveDemo() {
  const t = useTranslations('accountPage');
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (confirm(t('removeDemoConfirm'))) start(() => removeDemoAccounts());
      }}
    >
      {t('removeDemo')}
    </Button>
  );
}

export function ProjectSettings({ id, name, canDelete }: { id: number; name: string; canDelete: boolean }) {
  const t = useTranslations('accountPage');
  const [state, action, pending] = useActionState(renameProject, undefined);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string>();
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={id} />
        <div className="min-w-0 flex-1 basis-56 space-y-1.5">
          <Label htmlFor="project-rename">{t('projectName')}</Label>
          <Input id="project-rename" name="name" defaultValue={name} required />
        </div>
        <Submit pending={pending}>{t('rename')}</Submit>
      </form>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="text-destructive"
          disabled={!canDelete || deleting}
          title={canDelete ? undefined : t('needEmpty')}
          onClick={() => {
            if (confirm(t('deleteProjectConfirm', { name })))
              startDelete(async () => {
                const res = await deleteProject(id);
                if (res?.error) setDeleteError(res.error);
              });
          }}
        >
          <Trash2 className="size-4" /> {t('deleteProject')}
        </Button>
        {!canDelete && <span className="text-sm text-muted-foreground">{t('deleteProjectHint')}</span>}
        {deleteError && <span className="text-sm text-destructive">{deleteError}</span>}
      </div>
    </div>
  );
}

export function ProfileForm({ name, email, locale }: { name: string; email: string; locale: string }) {
  const t = useTranslations('accountPage');
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: { error?: string; ok?: string } | undefined, fd: FormData) => {
    const res = await updateProfile(prev, fd);
    router.refresh(); // a new interface language applies on refresh
    return res;
  }, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">{t('name')}</Label>
          <Input id="p-name" name="name" defaultValue={name} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-email">Email</Label>
          <Input id="p-email" value={email} disabled />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-locale">{t('language')}</Label>
          <select id="p-locale" name="locale" defaultValue={locale} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </div>
        <div />
        <div className="space-y-1.5">
          <Label htmlFor="p-cur">{t('currentPassword')}</Label>
          <Input id="p-cur" name="current" type="password" autoComplete="current-password" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-next">{t('newPassword')}</Label>
          <Input id="p-next" name="next" type="password" autoComplete="new-password" minLength={8} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Submit pending={pending}>{t('save')}</Submit>
        <Result state={state} />
      </div>
    </form>
  );
}
