# auth

## What it does
Email/password sign-in and signup, Google OAuth and email-link callbacks,
password reset by email link, sign-out, safe post-login redirects and the list
of routes the proxy guards.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `isProtectedPath`, `PROTECTED_PREFIXES` (used by `proxy.ts`), `safeRedirectPath`, `DEFAULT_REDIRECT`, `handleAuthCallback(request)` (the `/auth/callback` handler), `resolveLoginView(searchParams)`, `resolveResetPasswordView(searchParams)`, types `LoginView`, `LoginSearchParams`, `ResetPasswordView`, `ResetPasswordSearchParams`, `AuthActionState`, `AuthMode` |
| `actions.ts` | `'use server'` `login`, `signup`, `logout`, `forgotPassword` (always the same neutral reply), `resetPassword` |
| `client.ts` | Types `AuthActionState`, `AuthMode` |
| `components/login-screen.tsx` | `LoginScreen`, rendered by `app/login/page.tsx` |
| `components/auth-form.tsx` | `AuthForm`, the sign-in / create-account form (client) with the "Forgot password?" link; `Field`, `FormFeedback` |
| `components/reset-password-screen.tsx` | `ResetPasswordScreen`, rendered by `app/reset-password/page.tsx` |
| `components/password-reset-forms.tsx` | `ForgotPasswordForm`, `NewPasswordForm` (client) |

Routes stay in `app/`: `app/login/page.tsx`, `app/reset-password/page.tsx` and
`app/auth/callback/route.ts` only call this module.

Password reset: the request form emails a recovery link that returns to
`/reset-password`. That page forwards the link's `code` (or a `token_hash` with
`type=recovery`, if the email template is customised) to `/auth/callback`,
which opens the recovery session and sends the person back to
`/reset-password` to choose the new password. A dead link comes back as
`/reset-password?error=link`.

## Private (`internal/`)
| File | Job |
|---|---|
| `input.ts` | Parse and validate the login/signup/password-reset forms, `?tab=` mode |
| `commands.ts` | Supabase Auth calls: sign in, sign up, sign out, code exchange, reset email, recovery token, password update |
| `callback.ts` | `/auth/callback` code or recovery-token exchange and redirect |
| `login-view.ts` | What the login page shows (form, deactivated, orphaned, signed in) |
| `reset-view.ts` | What `/reset-password` shows (forward a link, request form, new password) |
| `redirects.ts` | Open-redirect-safe `redirectTo` narrowing |
| `protected-routes.ts` | Workspace route prefixes guarded at the edge |
| `types.ts` | `AuthActionState`, `AuthMode`, `Parsed`, `failure()`, `RESET_REQUEST_MESSAGE` |

## Database it owns
None directly. It uses Supabase Auth. Sign-up is invite-only (migration 49):
the "Accept invitation" form sends just email and password, and the
`handle_new_user` trigger applies the director's invitation (company, role,
name, employee ID). An address without an invitation gets an inactive profile
with no company; if it is invited later, its next sign-in attaches it.
Invitations and member changes belong to the team module.

## Depends on
`shared/supabase`, `shared/session` (`getAuthState`), `shared/forms`,
`shared/ui`, `shared/utils`, `types/tracker`. No other modules.
