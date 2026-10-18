# auth

## What it does
Email/password sign-in and signup, Google OAuth and email-link callbacks,
sign-out, safe post-login redirects and the list of routes the proxy guards.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `isProtectedPath`, `PROTECTED_PREFIXES` (used by `proxy.ts`), `safeRedirectPath`, `DEFAULT_REDIRECT`, `handleAuthCallback(request)` (the `/auth/callback` handler), `resolveLoginView(searchParams)`, types `LoginView`, `LoginSearchParams`, `AuthActionState`, `AuthMode` |
| `actions.ts` | `'use server'` `login`, `signup`, `logout` |
| `client.ts` | Types `AuthActionState`, `AuthMode` |
| `components/login-screen.tsx` | `LoginScreen`, rendered by `app/login/page.tsx` |
| `components/auth-form.tsx` | `AuthForm`, the sign-in / create-account form (client) |

Routes stay in `app/`: `app/login/page.tsx` and `app/auth/callback/route.ts`
only call this module.

## Private (`internal/`)
| File | Job |
|---|---|
| `input.ts` | Parse and validate the login/signup forms, `?tab=` mode |
| `commands.ts` | Supabase Auth calls: sign in, sign up, sign out, code exchange |
| `callback.ts` | `/auth/callback` code exchange and redirect |
| `login-view.ts` | What the login page shows (form, deactivated, orphaned, signed in) |
| `redirects.ts` | Open-redirect-safe `redirectTo` narrowing |
| `protected-routes.ts` | Workspace route prefixes guarded at the edge |
| `types.ts` | `AuthActionState`, `AuthMode`, `Parsed`, `failure()` |

## Database it owns
None directly. It uses Supabase Auth; the `handle_new_user` trigger
(`02_auth_provisioning.sql`) creates the `public.users` row from the
`full_name` / `employee_id` signup metadata. New accounts get the database
default role `team_member`; the form never sends a role.

## Depends on
`shared/supabase`, `shared/session` (`getAuthState`), `shared/forms`,
`shared/ui`, `shared/utils`, `types/tracker`. No other modules.
