import Link from 'next/link';
import { AlertTriangleIcon, ArrowLeftIcon, GaugeIcon } from 'lucide-react';

import { logout } from '../actions';
import type { LoginView } from '../index';
import { Button } from '@/shared/ui/button';
import { AuthForm } from './auth-form';

export interface LoginScreenProps {
  /** Any view except `signed-in`, which the page turns into a redirect. */
  view: Exclude<LoginView, { kind: 'signed-in' }>;
}

export function LoginScreen({ view }: LoginScreenProps) {
  return (
    <main className="bg-background flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-xl">
            <GaugeIcon className="size-5" aria-hidden="true" />
          </span>
          <h1 className="text-foreground text-xl font-bold tracking-tight">
            TaskPulse
          </h1>
          <p className="text-sm text-slate-500">
            Multi-metric performance tracker
          </p>
        </div>

        <div className="soft-card p-6">
          {view.kind === 'deactivated' ? (
            <div className="grid gap-4">
              <p role="alert" className="text-sm">Your account is deactivated. Contact a managing director to restore access.</p>
              <form action={logout}><Button type="submit" variant="outline">Sign out</Button></form>
            </div>
          ) : view.kind === 'orphaned' ? (
            <OrphanedAccountNotice />
          ) : (
            <AuthForm
              redirectTo={view.destination}
              initialMode={view.initialMode}
              initialError={view.error}
            />
          )}
        </div>

        {/* Route back out, since this page is now reachable from the public site. */}
        <p className="mt-4 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-md text-xs text-slate-500 transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:outline-none"
          >
            <ArrowLeftIcon className="size-3" aria-hidden="true" />
            Back to taskpulse.com
          </Link>
        </p>
      </div>
    </main>
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
        className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
      >
        <AlertTriangleIcon
          className="mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
          <span className="font-medium">No workspace profile</span>
          <span>
            Your sign-in worked, but this account has no TaskPulse profile yet,
            so there is nothing to show you.
          </span>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        If you are setting the project up, apply{' '}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-700">
          supabase/migrations/02_auth_provisioning.sql
        </code>{' '}
        and sign up again. Otherwise ask a managing director to create your
        profile.
      </p>

      <form action={logout}>
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
