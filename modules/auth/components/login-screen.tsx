import type * as React from 'react';
import Link from 'next/link';
import { AlertTriangleIcon, ArrowLeftIcon, CalendarCheckIcon, CheckCircle2Icon, CircleIcon, ListChecksIcon, TrophyIcon, type LucideIcon } from 'lucide-react';

import { logout } from '../actions';
import type { LoginView } from '../index';
import { Button } from '@/shared/ui/button';
import { StellarMark } from '@/shared/ui/stellar-mark';
import { Wallpaper } from '@/shared/ui/wallpaper';
import { AuthForm } from './auth-form';

export interface LoginScreenProps {
  /** Any view except `signed-in`, which the page turns into a redirect. */
  view: Exclude<LoginView, { kind: 'signed-in' }>;
}

const PROMISES: readonly { icon: LucideIcon; text: string }[] = [
  { icon: ListChecksIcon, text: 'Your missions, one tap from done' },
  { icon: CalendarCheckIcon, text: 'Time and attendance, logged as you go' },
  { icon: TrophyIcon, text: 'Recognition for the work that counts' },
];

/**
 * Sign-in (redesigned 27 October 2026 after the Catalyst tracker): a dark
 * brand panel with what the app promises and a small preview, beside the
 * form. On phones the panel sits on top and the form card overlaps its foot.
 */
export function LoginScreen({ view }: LoginScreenProps) {
  return (
    <main className="bg-background min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <BrandPanel />

      <section className="relative -mt-6 flex justify-center rounded-t-3xl bg-background px-4 pt-8 pb-10 lg:mt-0 lg:items-center lg:rounded-none lg:px-10 lg:py-12">
        <div className="w-full max-w-sm">
          <div className="soft-card animate-enter p-6">
            {view.kind === 'deactivated' ? (
              <div className="grid gap-4">
                <p role="alert" className="text-sm">
                  This account isn’t active. If your managing director has just invited
                  this email, sign out and sign in again. Otherwise ask them to invite you or
                  restore your access.
                </p>
                <form action={logout}><Button type="submit" variant="outline">Sign out</Button></form>
              </div>
            ) : view.kind === 'orphaned' ? (
              <OrphanedAccountNotice />
            ) : (
              <>
                <h1 className="text-foreground text-xl font-bold tracking-tight">Welcome back</h1>
                <p className="text-muted-foreground mt-1 mb-5 text-sm">
                  Sign in to see your missions, your time and what the team is doing.
                </p>
                <AuthForm
                  redirectTo={view.destination}
                  initialMode={view.initialMode}
                  initialError={view.error}
                />
              </>
            )}
          </div>

          {/* Route back out, since this page is now reachable from the public site. */}
          <p className="mt-4 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              <ArrowLeftIcon className="size-3" aria-hidden="true" />
              Back to taskpulse.com
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

/** The dark panel: mark, promise, three reasons and a glimpse of a mission. */
function BrandPanel() {
  return (
    <section aria-label="About Stellar" className="bg-brand-panel text-brand-panel-foreground relative isolate overflow-hidden px-6 pt-10 pb-14 lg:flex lg:flex-col lg:justify-center lg:px-14 lg:py-14">
      <Wallpaper motif="constellation" fade={false} className="absolute z-0 h-full" />
      <div className="stagger relative mx-auto flex w-full max-w-md flex-col gap-8 lg:max-w-lg">
        <div className="flex items-center gap-3">
          <StellarMark className="size-12 rounded-xl" />
          <div>
            <p className="text-2xl font-bold tracking-tight">Stellar</p>
            <p className="text-brand-panel-muted text-sm">Multi-metric performance tracker</p>
          </div>
        </div>

        <h2 className="text-3xl font-bold tracking-tight text-balance lg:text-4xl">
          A clear path through your work, <span className="text-brand-panel-accent">for the whole team.</span>
        </h2>

        <ul className="grid gap-4">
          {PROMISES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-base">
              <span aria-hidden="true" className="border-brand-panel-line flex size-9 shrink-0 items-center justify-center rounded-full border">
                <Icon className="text-brand-panel-accent size-4" />
              </span>
              {text}
            </li>
          ))}
        </ul>

        <PreviewCard />
      </div>
    </section>
  );
}

/** A still of a mission card, so the panel shows the app rather than describing it. */
function PreviewCard() {
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div aria-hidden="true" className="border-brand-panel-line bg-brand-panel-card hidden max-w-sm rounded-2xl border p-4 sm:block">
      <div className="flex items-center gap-4">
        <span className="relative size-16 shrink-0">
          <svg viewBox="0 0 48 48" className="size-full -rotate-90">
            <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className="stroke-brand-panel-line" />
            <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-brand-panel-accent ring-draw"
              style={{ '--ring-from': c } as React.CSSProperties} strokeDasharray={c} strokeDashoffset={c * 0.35} />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-sm font-bold tabular-nums">65%</span>
        </span>
        <span className="min-w-0">
          <span className="text-brand-panel-muted block text-xs">Mission · due in 3 days</span>
          <span className="block truncate text-base font-semibold">Quarterly client report</span>
        </span>
      </div>
      <ul className="divide-brand-panel-line mt-3 divide-y text-sm">
        <li className="flex items-center gap-2.5 py-2.5">
          <CheckCircle2Icon className="text-brand-panel-accent size-5 shrink-0" />
          <span className="text-brand-panel-muted line-through">Collect the month’s figures</span>
        </li>
        <li className="flex items-center gap-2.5 py-2.5">
          <CircleIcon className="text-brand-panel-muted size-5 shrink-0" />
          <span>Draft the summary page</span>
        </li>
      </ul>
    </div>
  );
}

/**
 * Shown when Supabase Auth recognises the user but no `public.users` row
 * exists. The usual cause is that `02_auth_provisioning.sql` has not been
 * applied, so the trigger that creates profiles on signup is missing.
 */
function OrphanedAccountNotice() {
  return (
    <div className="flex flex-col gap-4">
      <div
        role="alert"
        className="flex items-start gap-2 rounded-md border border-attention-border bg-attention-subtle px-3 py-2 text-sm text-attention-foreground"
      >
        <AlertTriangleIcon
          className="mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
          <span className="font-medium">No workspace profile</span>
          <span>
            Your sign-in worked, but this account has no Stellar profile yet,
            so there is nothing to show you.
          </span>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Ask your managing director to invite this email address, then accept
        the invitation to create your profile.
      </p>

      <form action={logout}>
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
