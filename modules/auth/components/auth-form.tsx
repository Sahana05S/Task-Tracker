'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  LoaderCircleIcon,
  MailCheckIcon,
} from 'lucide-react';

import { login, signup } from '../actions';
import type { AuthActionState, AuthMode } from '../client';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { SPLASH_STORAGE_KEY } from '@/shared/ui/splash-script';
import { cn } from '@/shared/utils';

const INITIAL_STATE: AuthActionState | null = null;

/** A fresh sign-in opens with the splash, even in a tab that has already seen it. */
function resetSplash() {
  try {
    window.localStorage.removeItem(SPLASH_STORAGE_KEY);
  } catch {
    // Blocked storage: the splash is skipped anyway.
  }
}
const FEEDBACK_ID = 'auth-feedback';
/** Email fields: no spellcheck, capitals or autocorrect, and the email keyboard on phones. */
export const EMAIL_INPUT = { type: 'email', autoComplete: 'email', inputMode: 'email', spellCheck: false, autoCapitalize: 'none' } as const;
export interface AuthFormProps {
  /** Destination after a successful sign-in. Validated again server-side. */
  redirectTo: string;
  /**
   * Which pane opens first, resolved from the `?tab=` parameter so a landing
   * page call to action lands on the right form.
   */
  initialMode?: AuthMode;
  /** Initial error passed from callback or query param */
  initialError?: string;
}

export function AuthForm({
  redirectTo,
  initialMode = 'login',
  initialError,
}: AuthFormProps) {
  const [mode, setMode] = React.useState<AuthMode>(initialMode);
  // An error carried in from /auth/callback or the query string; cleared on a pane switch.
  const [callbackError, setCallbackError] = React.useState<string | undefined>(
    initialError,
  );
  // Kept across a failed submit and the Sign in / Accept invitation switch:
  // React resets the form after an action back to each field's default, and
  // the email field's default is the last address typed.
  const [email, setEmail] = React.useState('');
  const [loginState, loginAction, loginPending] = React.useActionState(
    login,
    INITIAL_STATE,
  );
  const [signupState, signupAction, signupPending] = React.useActionState(
    signup,
    INITIAL_STATE,
  );

  const isLogin = mode === 'login';
  const state = isLogin ? loginState : signupState;
  const pending = isLogin ? loginPending : signupPending;

  const errorMessage =
    callbackError || (state && !state.success ? state.error : undefined);
  const successMessage =
    state && state.success ? state.data?.message : undefined;

  return (
    <div className="flex flex-col gap-5">
      {/* Mode switch */}
      <div
        role="group"
        aria-label="Sign in or accept an invitation"
        className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted p-1"
      >
        {(['login', 'signup'] satisfies readonly AuthMode[]).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              setCallbackError(undefined);
            }}
            className={cn(
              'rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none',
              mode === value
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {value === 'login' ? 'Sign in' : 'Accept invitation'}
          </button>
        ))}
      </div>

      {/* Signup verification notice banner if awaiting email confirmation */}
      {successMessage && !isLogin ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-success/30 bg-success-subtle/70 p-5 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-success-subtle text-success-strong">
            <MailCheckIcon className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-success-strong">
              Confirm your email address
            </p>
            <p className="text-xs leading-relaxed text-success-strong">
              {successMessage}
            </p>
          </div>
          <p className="text-[11px] text-success-strong">
            Once verified, click{' '}
            <button
              type="button"
              onClick={() => setMode('login')}
              className="rounded-sm font-semibold underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              Sign in
            </button>{' '}
            to enter your workspace.
          </p>
        </div>
      ) : isLogin ? (
        /* Sign-in Form */
        <form action={loginAction} onSubmit={resetSplash} className="flex flex-col gap-4">
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <Field
            id="login-email"
            name="email"
            label="Email"
            {...EMAIL_INPUT}
            defaultValue={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            invalid={Boolean(errorMessage)}
            errorId={FEEDBACK_ID}
            autoFocus={!email}
            required
          />
          <Field
            id="login-password"
            name="password"
            label="Password"
            labelEnd={
              <Link
                href="/reset-password"
                className="text-primary rounded-sm text-xs font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                Forgot password?
              </Link>
            }
            type="password"
            reveal
            autoComplete="current-password"
            invalid={Boolean(errorMessage)}
            errorId={FEEDBACK_ID}
            required
          />

          <FormFeedback id={FEEDBACK_ID} error={errorMessage} success={successMessage} />

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? (
              <>
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      ) : (
        /* Accept-invitation form: name, ID and role come from the invitation. */
        <form action={signupAction} className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Stellar is invite-only. Use the email your managing director invited; your
            name, employee ID and role come from that invitation.
          </p>
          <Field
            id="signup-email"
            name="email"
            label="Invited email"
            {...EMAIL_INPUT}
            defaultValue={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            invalid={Boolean(errorMessage)}
            errorId={FEEDBACK_ID}
            required
          />
          <Field
            id="signup-password"
            name="password"
            label="Password"
            type="password"
            reveal
            autoComplete="new-password"
            hint="At least 8 characters."
            minLength={8}
            invalid={Boolean(errorMessage)}
            errorId={FEEDBACK_ID}
            required
          />
          <FormFeedback id={FEEDBACK_ID} error={errorMessage} success={successMessage} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? (
              <>
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
                Creating account…
              </>
            ) : (
              'Create my account'
            )}
          </Button>

          <p className="text-xs text-muted-foreground">
            Not invited yet? Ask your managing director to invite your email first.
          </p>
        </form>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Field                                                                      */
/* -------------------------------------------------------------------------- */

interface FieldProps extends React.ComponentProps<'input'> {
  id: string;
  name: string;
  label: string;
  hint?: string;
  invalid?: boolean;
  /** The form's message element, read out with the field while it is invalid. */
  errorId?: string;
  /** A small link or note on the label's row, right-aligned. */
  labelEnd?: React.ReactNode;
  /** A password field with a Show / Hide toggle inside it. */
  reveal?: boolean;
}

export function Field({ id, label, hint, invalid, errorId, labelEnd, reveal, type, className, ...props }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [hintId, invalid ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  const [shown, setShown] = React.useState(false);

  const input = (
    <Input
      id={id}
      type={reveal && shown ? 'text' : type}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className={cn(reveal && 'pr-16', className)}
      {...props}
    />
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {labelEnd}
      </div>
      {reveal ? (
        <div className="relative">
          {input}
          {/* Named "Show" / "Hide" only, so the field keeps the sole "Password" label. */}
          <button
            type="button"
            aria-pressed={shown}
            aria-controls={id}
            onClick={() => setShown((value) => !value)}
            className="press text-muted-foreground hover:bg-muted hover:text-foreground absolute inset-y-1 right-1 inline-flex min-w-14 items-center justify-center rounded-lg px-2.5 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            {shown ? 'Hide' : 'Show'}
          </button>
        </div>
      ) : (
        input
      )}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

interface FormFeedbackProps {
  id?: string;
  error?: string;
  success?: string;
}

export function FormFeedback({ id, error, success }: FormFeedbackProps) {
  if (!error && !success) return null;
  const isError = Boolean(error);
  return (
    <div
      id={id}
      role={isError ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        isError
          ? 'border-danger-border bg-danger-subtle text-danger'
          : 'border-success/30 bg-success-subtle text-success-strong',
      )}
    >
      {isError ? (
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <span>{error ?? success}</span>
    </div>
  );
}
