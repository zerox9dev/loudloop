'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/lib/i18n/client';
import {
  CalendarClock,
  CircleAlert,
  CircleCheck,
  Contact,
  LayoutGrid,
  Lightbulb,
  MessageSquareReply,
  MousePointerClick,
  Newspaper,
  Radar,
  Rss,
  SlidersHorizontal,
  Sun,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Logo } from '@/components/logo';
import { ProjectSwitcher, type SwitcherProject } from '@/components/project-switcher';
import { PlatformIcon } from '@/components/platform-icon';
import { PLATFORM_META } from '@/lib/platforms';
import type { Platform } from '@/lib/db/schema';
import { useEffect, useState } from 'react';

type Badge = 'review' | 'ideas' | 'unread' | 'signals';
/** label = message key in the `nav` namespace */
type NavItem = { href: string; label: string; icon: typeof LayoutGrid; badge?: Badge };

/** Ordered like the distribution conveyor: ideas → review → queue → published → feedback. */
const NAV: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: '/today', label: 'today', icon: Sun, badge: 'review' },
      { href: '/ideas', label: 'ideas', icon: Lightbulb, badge: 'ideas' },
      { href: '/queue', label: 'queue', icon: CalendarClock },
      { href: '/posts', label: 'posts', icon: Newspaper },
      { href: '/replies', label: 'replies', icon: MessageSquareReply, badge: 'unread' },
    ],
  },
  {
    label: 'results',
    items: [
      { href: '/', label: 'overview', icon: LayoutGrid },
      { href: '/clicks', label: 'clicks', icon: MousePointerClick },
      { href: '/audience', label: 'audience', icon: Users },
      { href: '/people', label: 'people', icon: Contact },
      { href: '/signals', label: 'signals', icon: Radar, badge: 'signals' },
      { href: '/challenges', label: 'challenges', icon: Trophy },
    ],
  },
  {
    label: 'setup',
    items: [
      { href: '/settings', label: 'settings', icon: SlidersHorizontal },
      { href: '/sources', label: 'sources', icon: Rss },
    ],
  },
];

export type SidebarAccount = { id: number; platform: Platform; handle: string; status: string; projectId: number };

export function AppSidebar({
  userName,
  slug,
  projects,
  accounts,
  review,
  ideas,
  unread,
  signals,
  lastSyncedAt,
  hasErrors,
}: {
  userName: string;
  slug: string;
  projects: SwitcherProject[];
  accounts: SidebarAccount[];
  review: number;
  ideas: number;
  unread: number;
  signals: number;
  lastSyncedAt: string | null;
  hasErrors: boolean;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const base = `/${slug}`;
  const hrefOf = (href: string) => (href === '/' ? base : `${base}${href}`);
  const isActive = (href: string) => (href === '/' ? pathname === base : pathname.startsWith(`${base}${href}`));
  const projectName = (id: number) => projects.find((p) => p.id === id)?.name;
  const counts: Record<Badge, number> = { review, ideas, unread, signals };

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="px-4 pt-4 pb-3">
        <Link href={base} className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo className="size-10" />
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight">Loudloop</div>
            <div className="truncate text-[13px] text-muted-foreground">{userName}</div>
          </div>
        </Link>
        <div className="mt-3">
          <ProjectSwitcher projects={projects} slug={slug} />
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2">
        {NAV.map((group, gi) => (
          <SidebarGroup key={gi} className={gi === 0 ? 'pt-2' : 'pt-3'}>
            {group.label && <SidebarGroupLabel className="px-3 text-[13px] font-medium text-muted-foreground">{t(group.label)}</SidebarGroupLabel>}
            <SidebarMenu className="gap-0.5">
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item.href)} className="h-10 gap-3 rounded-lg px-3 text-[15px] data-active:bg-sidebar-accent data-active:font-normal [&_svg]:size-[18px]">
                    <Link href={hrefOf(item.href)}>
                      <item.icon strokeWidth={1.75} />
                      <span>{t(item.label)}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.badge && counts[item.badge] > 0 && (
                    <SidebarMenuBadge className="top-2.5 text-[13px] font-normal tabular text-foreground/80">{counts[item.badge]}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
        <SidebarGroup className="pt-4">
          <SidebarGroupLabel className="px-3 text-[13px] font-medium text-muted-foreground">{t('channels')}</SidebarGroupLabel>
          <SidebarMenu className="gap-0.5">
            {accounts.map((a) => (
              <SidebarMenuItem key={a.id}>
                <SidebarMenuButton asChild className="h-10 gap-3 rounded-lg px-3 text-[15px]">
                  <Link href={`${base}?p=${a.platform}`} title={slug === 'all' ? projectName(a.projectId) : undefined}>
                    <PlatformIcon platform={a.platform} />
                    <span className="flex-1">{PLATFORM_META[a.platform].label}</span>
                    <span className="truncate text-[13px] text-muted-foreground">{slug === 'all' ? projectName(a.projectId) : a.handle}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {accounts.length === 0 && (
              <p className="px-3 text-sm text-muted-foreground">
                {t('noChannels')} <Link href={`${base}/account`} className="underline underline-offset-2">{t('connect')}</Link>
              </p>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-4 pb-4">
        <Link href={`${base}/account`} className={`flex items-center gap-2.5 rounded-md py-1 text-sm hover:text-foreground ${isActive('/account') ? 'text-foreground' : 'text-muted-foreground'}`}>
          <User className="size-4" strokeWidth={1.75} />
          {t('account')}
        </Link>
        <SyncedAgo at={lastSyncedAt} hasErrors={hasErrors} />
      </SidebarFooter>
    </Sidebar>
  );
}

function SyncedAgo({ at, hasErrors }: { at: string | null; hasErrors: boolean }) {
  const t = useTranslations('nav');
  const f = useFormat();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const Icon = hasErrors ? CircleAlert : CircleCheck;
  return (
    <div className="flex items-center gap-2.5 py-1 text-sm text-muted-foreground" suppressHydrationWarning>
      <Icon className={`size-4 ${hasErrors ? 'text-amber-600' : 'text-positive'}`} strokeWidth={1.75} />
      {at ? t('updated', { ago: f.ago(new Date(at)) }) : t('neverUpdated')}
    </div>
  );
}
