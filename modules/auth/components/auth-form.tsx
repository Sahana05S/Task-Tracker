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
import { createClient } from '@/shared/supabase/client';
import { cn } from '@/shared/utils';

const INITIAL_STATE: AuthActionState | null = null;
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
  const [oauthLoading, setOauthLoading] = React.useState(false);
  const [oauthError, setOauthError] = React.useState<string | undefined>(
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
    oauthError || (state && !state.success ? state.error : undefined);
  const successMessage =
    state && state.success ? state.data?.message : undefined;

  const handleGoogleSignIn = async () => {
    try {
      setOauthLoading(true);
      setOauthError(undefined);
      const supabase = createClient();
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        redirectTo,
      )}`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
        },
      });

      if (error) {
        setOauthError(error.message);
        setOauthLoading(false);
      }
    } catch (err) {
      setOauthError(
        err instanceof Error ? err.message : 'Google sign in failed',
      );
      setOauthLoading(false);
    }
  };

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
              setOauthError(undefined);
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

      {/* Google OAuth Button */}
      <Button
        type="button"
        variant="outline"
        disabled={oauthLoading || pending}
        onClick={handleGoogleSignIn}
        className="relative flex w-full items-center justify-center gap-2.5 border-input py-2.5 font-medium text-foreground hover:bg-muted hover:text-foreground"
      >
        {oauthLoading ? (
          <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <GoogleIcon className="size-4 shrink-0" />
        )}
        <span>
          {isLogin ? 'Continue with Google' : 'Accept with Google'}
        </span>
      </Button>

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="w-full border-t border-border" />
        <span className="shrink-0 bg-card px-3 text-xs font-medium whitespace-nowrap text-placeholder uppercase tracking-wider">
          or with email
        </span>
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
        <form action={loginAction} className="flex flex-col gap-4">
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
            required
          />
          <Field
            id="login-password"
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            invalid={Boolean(errorMessage)}
            errorId={FEEDBACK_ID}
            required
          />
          <Link
            href="/reset-password"
            className="-mt-2 self-end rounded-sm text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            Forgot password?
          </Link>

          <FormFeedback id={FEEDBACK_ID} error={errorMessage} success={successMessage} />

          <Button type="submit" disabled={pending || oauthLoading} className="w-full">
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
            autoComplete="new-password"
            hint="At least 8 characters."
            minLength={8}
            invalid={Boolean(errorMessage)}
            errorId={FEEDBACK_ID}
            required
          />
          <FormFeedback id={FEEDBACK_ID} error={errorMessage} success={successMessage} />
          <Button type="submit" disabled={pending || oauthLoading} className="w-full">
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
/* Official Google SVG Icon                                                   */
/* -------------------------------------------------------------------------- */

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
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
}

export function Field({ id, label, hint, invalid, errorId, ...props }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [hintId, invalid ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <Input
        id={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        {...props}
      />
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
