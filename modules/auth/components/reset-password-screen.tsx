import Link from 'next/link';
import { ArrowLeftIcon, GaugeIcon } from 'lucide-react';

import type { ResetPasswordView } from '../index';
import { ForgotPasswordForm, NewPasswordForm } from './password-reset-forms';

export interface ResetPasswordScreenProps {
  /** Any view except `verify`, which the page turns into a redirect. */
  view: Exclude<ResetPasswordView, { kind: 'verify' }>;
}

export function ResetPasswordScreen({ view }: ResetPasswordScreenProps) {
  const settingPassword = view.kind === 'set-password';

  return (
    <main className="bg-background flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-xl">
            <GaugeIcon className="size-5" aria-hidden="true" />
          </span>
          <h1 className="text-foreground text-xl font-bold tracking-tight">
            {settingPassword ? 'Set a new password' : 'Reset your password'}
          </h1>
          <p className="text-sm text-slate-500">TaskPulse</p>
        </div>

        <div className="soft-card p-6">
          {settingPassword ? (
            <NewPasswordForm />
          ) : (
            <ForgotPasswordForm linkError={view.linkError} />
          )}
        </div>

        <p className="mt-4 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 rounded-md text-xs text-slate-500 transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:outline-none"
          >
            <ArrowLeftIcon className="size-3" aria-hidden="true" />
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
