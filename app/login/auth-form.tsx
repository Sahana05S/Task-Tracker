'use client';

import * as React from 'react';
import { AlertCircleIcon, CheckCircle2Icon, LoaderCircleIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  login,
  signup,
  type AuthActionState,
} from '@/app/auth/actions';

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
}

export function AuthForm({ redirectTo, initialMode = 'login' }: AuthFormProps) {
  // Initial state only. Switching panes afterwards is a local concern and does
  // not rewrite the URL, so a refresh returns to whichever pane the link asked
  // for rather than to wherever the visitor last clicked.
  const [mode, setMode] = React.useState<AuthMode>(initialMode);

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

  const errorMessage = state && !state.success ? state.error : undefined;
  const successMessage =
    state && state.success ? state.data?.message : undefined;

  return (
    <div className="flex flex-col gap-5">
      {/* Mode switch. Kept as buttons rather than links so the typed form state
          of the inactive mode is discarded on switch. */}
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
            onClick={() => setMode(value)}
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

      {/* One form element per mode so React resets field state on switch. */}
      {isLogin ? (
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

          <Button type="submit" disabled={pending} className="w-full">
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

          <Button type="submit" disabled={pending} className="w-full">
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
            New accounts start with the{' '}
            <span className="font-medium text-slate-700">Team Member</span>{' '}
            role. A managing director can change it later.
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

/**
 * Live region for action results. `role="alert"` makes a screen reader announce
 * the message when it appears, which matters because the submit button is the
 * element that had focus.
 */
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
        <AlertCircleIcon
          className="mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
      ) : (
        <CheckCircle2Icon
          className="mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
      )}
      <span>{error ?? success}</span>
    </div>
  );
}
