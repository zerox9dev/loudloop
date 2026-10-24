'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ruLocale from '@fullcalendar/core/locales/ru';
import ukLocale from '@fullcalendar/core/locales/uk';
import { useLocale, useTranslations } from 'next-intl';
import { useFormat } from '@/lib/i18n/client';
import type { EventDropArg, EventClickArg } from '@fullcalendar/core';
import type { DateClickArg } from '@fullcalendar/interaction';
import { toast } from 'sonner';
import { Composer, type ComposerAccount, type ComposerPost } from '@/components/composer';
import { PlatformIcon } from '@/components/platform-icon';
import type { Platform } from '@/lib/db/schema';
import { reschedulePost } from '@/lib/actions/posts';

export type CalendarPost = ComposerPost & { id: number; status: string; at: string; platforms: Platform[] };

export function ScheduleCalendar({
  posts,
  accounts,
  projects,
  defaultProjectId,
}: {
  posts: CalendarPost[];
  accounts: ComposerAccount[];
  projects?: { id: number; name: string }[];
  defaultProjectId?: number;
}) {
  const t = useTranslations('posts');
  const f = useFormat();
  const locale = useLocale();
  const router = useRouter();
  const [, start] = useTransition();
  const [draft, setDraft] = useState<Partial<ComposerPost> | null>(null);

  const events = posts.map((p) => ({
    id: String(p.id),
    title: p.text.slice(0, 60) || t('noTextShort'),
    start: p.at,
    editable: p.status === 'scheduled',
    backgroundColor: p.status === 'published' ? 'var(--surface)' : p.status === 'failed' ? 'color-mix(in oklab, var(--destructive) 15%, transparent)' : 'color-mix(in oklab, var(--platform-telegram) 12%, transparent)',
    textColor: 'var(--foreground)',
    extendedProps: { platforms: p.platforms, status: p.status },
  }));

  function onDrop(info: EventDropArg) {
    const at = info.event.start;
    if (!at || at.getTime() < Date.now()) {
      info.revert();
      toast.error(t('pastDenied'));
      return;
    }
    start(async () => {
      const res = await reschedulePost(Number(info.event.id), at.toISOString());
      if (!res.ok) info.revert();
      else toast(t('moved'), { description: f.date(at, 'd MMM, HH:mm') });
      router.refresh();
    });
  }

  function onDateClick(info: DateClickArg) {
    const at = new Date(info.date);
    if (info.allDay) at.setHours(10, 0, 0, 0);
    if (at.getTime() < Date.now()) return;
    setDraft({ scheduledAt: at.toISOString() });
  }

  function onEventClick(info: EventClickArg) {
    const p = posts.find((x) => String(x.id) === info.event.id);
    if (p && ['scheduled', 'draft', 'failed'].includes(p.status)) setDraft(p);
  }

  return (
    <div>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        locales={[ruLocale, ukLocale]}
        locale={locale}
        initialView="dayGridMonth"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
        height="auto"
        firstDay={1}
        events={events}
        eventDrop={onDrop}
        dateClick={onDateClick}
        eventClick={onEventClick}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        dayMaxEvents={4}
        eventContent={(arg) => (
          <div className="flex w-full items-center gap-1 overflow-hidden px-1 py-0.5 text-xs">
            {(arg.event.extendedProps.platforms as Platform[]).map((pl) => (
              <PlatformIcon key={pl} platform={pl} size={11} />
            ))}
            <span className="shrink-0 text-muted-foreground tabular">{arg.timeText}</span>
            <span className="truncate">{arg.event.title}</span>
          </div>
        )}
      />
      {draft && (
        <Composer
          key={JSON.stringify(draft)}
          accounts={accounts}
          projects={projects}
          defaultProjectId={defaultProjectId}
          initial={draft}
          open
          onOpenChange={(o) => !o && setDraft(null)}
        />
      )}
    </div>
  );
}
