'use client';

import * as React from 'react';
import { LoaderCircleIcon } from 'lucide-react';

import { forgotPassword, resetPassword } from '../actions';
import type { AuthActionState } from '../client';
import { Button } from '@/shared/ui/button';
import { EMAIL_INPUT, Field, FormFeedback } from './auth-form';

const INITIAL_STATE: AuthActionState | null = null;

/** Asks for an email address and always answers with the same message. */
export function ForgotPasswordForm({ linkError }: { linkError?: boolean }) {
  const [state, action, pending] = React.useActionState(forgotPassword, INITIAL_STATE);

  const error =
    state && !state.success
      ? state.error
      : !state && linkError
        ? 'That reset link has expired or was already used. Request a new one.'
        : undefined;
  const success = state && state.success ? state.data?.message : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Enter the email address you sign in with and we will send you a link to set a new password.
      </p>
      <Field
        id="reset-email"
        name="email"
        label="Email"
        {...EMAIL_INPUT}
        placeholder="you@company.com"
        invalid={Boolean(error)}
        errorId="reset-feedback"
        required
      />

      <FormFeedback id="reset-feedback" error={error} success={success} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <>
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            Sending…
          </>
        ) : (
          'Send reset link'
        )}
      </Button>
    </form>
  );
}

/** Chooses the new password once a recovery link has signed the person in. */
export function NewPasswordForm() {
  const [state, action, pending] = React.useActionState(resetPassword, INITIAL_STATE);
  const error = state && !state.success ? state.error : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        id="reset-password"
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        minLength={8}
        invalid={Boolean(error)}
        required
      />
      <Field
        id="reset-confirm-password"
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        invalid={Boolean(error)}
        required
      />

      <FormFeedback error={error} />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? (
          <>
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            Saving…
          </>
        ) : (
          'Set password'
        )}
      </Button>
    </form>
  );
}
