import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AlertTriangleIcon, GaugeIcon } from 'lucide-react';

import { AuthForm } from '@/app/login/auth-form';
import { logout } from '@/app/auth/actions';
import { Button } from '@/components/ui/button';
import { getAuthState } from '@/lib/auth/profile';
import { safeRedirectPath } from '@/lib/auth/redirects';

export const metadata: Metadata = {
  title: 'Sign in · TaskPulse',
};

interface LoginPageProps {
  searchParams: Promise<{ redirectTo?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirectTo } = await searchParams;
  const destination = safeRedirectPath(redirectTo);
  const { authUserId, profile } = await getAuthState();

  // Already signed in with a usable profile: nothing to do here.
  if (profile) {
    redirect(destination);
  }

  // Authenticated but unprovisioned. Do not redirect into the workspace; the
  // guarded layouts would send them straight back and the two would loop.
  const isOrphaned = authUserId !== null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-slate-900 text-slate-50">
            <GaugeIcon className="size-5" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            TaskPulse
          </h1>
          <p className="text-sm text-slate-500">
            Multi-metric performance tracker
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
          {isOrphaned ? (
            <OrphanedAccountNotice />
          ) : (
            <AuthForm redirectTo={destination} />
          )}
        </div>
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
