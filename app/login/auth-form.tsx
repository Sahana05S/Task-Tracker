'use client';

import * as React from 'react';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  LoaderCircleIcon,
  MailCheckIcon,
} from 'lucide-react';

import { login, signup, type AuthActionState } from '@/app/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type AuthMode = 'login' | 'signup';

const INITIAL_STATE: AuthActionState | null = null;

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
        role="tablist"
        aria-label="Authentication mode"
        className="grid grid-cols-2 gap-1 rounded-md border border-slate-200 bg-slate-100 p-1"
      >
        {(['login', 'signup'] satisfies readonly AuthMode[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => {
              setMode(value);
              setOauthError(undefined);
            }}
            className={cn(
              'rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:outline-none',
              mode === value
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {value === 'login' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      {/* Google OAuth Button */}
      <Button
        type="button"
        variant="outline"
        disabled={oauthLoading || pending}
        onClick={handleGoogleSignIn}
        className="relative flex w-full items-center justify-center gap-2.5 border-slate-300 py-2.5 font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
      >
        {oauthLoading ? (
          <LoaderCircleIcon className="size-4 animate-spin text-slate-500" />
        ) : (
          <GoogleIcon className="size-4 shrink-0" />
        )}
        <span>
          {isLogin ? 'Continue with Google' : 'Sign up with Google'}
        </span>
      </Button>

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="w-full border-t border-slate-200" />
        <span className="shrink-0 bg-white px-3 text-xs font-medium whitespace-nowrap text-slate-400 uppercase tracking-wider">
          or with email
        </span>
      </div>

      {/* Signup verification notice banner if awaiting email confirmation */}
      {successMessage && !isLogin ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-5 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <MailCheckIcon className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-emerald-900">
              Verify your email address
            </h3>
            <p className="text-xs leading-relaxed text-emerald-800">
              {successMessage}
            </p>
          </div>
          <p className="text-[11px] text-emerald-700">
            Once verified, click{' '}
            <button
              type="button"
              onClick={() => setMode('login')}
              className="font-semibold underline underline-offset-2"
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
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            invalid={Boolean(errorMessage)}
            required
          />
          <Field
            id="login-password"
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            invalid={Boolean(errorMessage)}
            required
          />

          <FormFeedback error={errorMessage} success={successMessage} />

          <Button type="submit" disabled={pending || oauthLoading} className="w-full">
            {pending ? (
              <>
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
                Signing in
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      ) : (
        /* Create Account Form */
        <form action={signupAction} className="flex flex-col gap-4">
          <Field
            id="signup-full-name"
            name="fullName"
            label="Full name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            invalid={Boolean(errorMessage)}
            required
          />
          <Field
            id="signup-employee-id"
            name="employeeId"
            label="Employee ID"
            autoComplete="off"
            placeholder="EMP-014"
            hint="Assigned by your workspace administrator."
            invalid={Boolean(errorMessage)}
            required
          />
          <Field
            id="signup-email"
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            invalid={Boolean(errorMessage)}
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
            required
          />

          <FormFeedback error={errorMessage} success={successMessage} />

          <Button type="submit" disabled={pending || oauthLoading} className="w-full">
            {pending ? (
              <>
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
                Creating account
              </>
            ) : (
              'Create account'
            )}
          </Button>

          <p className="text-xs text-slate-500">
            A confirmation link will be sent to verify your address. New accounts start with the{' '}
            <span className="font-medium text-slate-700">Team Member</span> role.
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
}

function Field({ id, label, hint, invalid, ...props }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <Input
        id={id}
        aria-invalid={invalid}
        aria-describedby={hintId}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-slate-500">
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
  error?: string;
  success?: string;
}

function FormFeedback({ error, success }: FormFeedbackProps) {
  if (!error && !success) return null;

  const isError = Boolean(error);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        isError
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700',
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
