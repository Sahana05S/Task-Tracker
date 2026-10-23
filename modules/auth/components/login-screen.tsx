import Link from 'next/link';
import { AlertTriangleIcon, ArrowLeftIcon } from 'lucide-react';

import { logout } from '../actions';
import type { LoginView } from '../index';
import { Button } from '@/shared/ui/button';
import { StellarMark } from '@/shared/ui/stellar-mark';
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
          <StellarMark className="size-10 rounded-xl" />
          <h1 className="text-foreground text-xl font-bold tracking-tight">
            Stellar
          </h1>
          <p className="text-sm text-muted-foreground">
            Multi-metric performance tracker
          </p>
        </div>

        <div className="soft-card p-6">
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
            className="inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
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
