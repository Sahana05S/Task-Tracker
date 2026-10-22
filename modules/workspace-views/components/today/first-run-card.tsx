'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookOpenIcon, CalendarCheckIcon, ListChecksIcon, MessageSquareIcon, XIcon } from 'lucide-react';

import { FIRST_RUN_COOKIE } from './first-run';

const STEPS = [
  { icon: ListChecksIcon, title: 'Open a mission and start its timer', body: 'Your missions are on this page. The timer logs your hours for you.', href: '/tasks', action: 'Open Missions' },
  { icon: CalendarCheckIcon, title: 'Record today’s attendance', body: 'Tap today in the attendance grid. Time you log must fit within it.', href: '/attendance', action: 'Open Attendance' },
  { icon: MessageSquareIcon, title: 'Post a daily fact or an idea', body: 'Each one earns credit, more once someone else validates it.', href: '/daily-facts', action: 'Post a fact' },
] as const;

/** Three first steps for a new member, dismissible for good. */
export function FirstRunCard({ name }: { name: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const dismiss = () => {
    document.cookie = `${FIRST_RUN_COOKIE}=dismissed; path=/; max-age=31536000; samesite=lax`;
    setHidden(true);
  };
  return (
    <section aria-labelledby="first-run-title" className="soft-card border-primary/20 bg-primary-subtle/40 relative grid gap-4 p-5 sm:p-6">
      <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-primary absolute top-3 right-3 grid size-9 place-items-center rounded-full" aria-label="Dismiss getting started">
        <XIcon className="size-4" aria-hidden="true" />
      </button>
      <div className="pr-10">
        <h2 id="first-run-title" className="text-foreground text-base font-bold tracking-tight">Welcome, {name.split(' ')[0]}. Three things to start with</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">Each takes a minute. You can come back to the guide any time.</p>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body, href, action }, index) => (
          <li key={href} className="bg-card border-border grid content-start gap-1.5 rounded-xl border p-4">
            <p className="text-primary flex items-center gap-2 text-xs font-bold tracking-wide uppercase">
              <span className="bg-primary text-primary-foreground grid size-5 place-items-center rounded-full text-[11px]" aria-hidden="true">{index + 1}</span>
              <Icon className="size-4" aria-hidden="true" />
            </p>
            <h3 className="text-foreground text-sm font-semibold">{title}</h3>
            <p className="text-muted-foreground text-sm">{body}</p>
            <Link href={href} className="link mt-1 justify-self-start text-sm font-semibold">{action}</Link>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href="/guide" className="link inline-flex items-center gap-1.5 font-semibold"><BookOpenIcon className="size-4" aria-hidden="true" />Read the guide</Link>
        <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground underline underline-offset-4">I’ve got it, hide this</button>
      </div>
    </section>
  );
}
