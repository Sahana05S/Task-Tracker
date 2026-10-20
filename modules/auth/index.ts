// PUBLIC server-side API of the auth module.
export { isProtectedPath, PROTECTED_PREFIXES } from './internal/protected-routes';
export { DEFAULT_REDIRECT, safeRedirectPath } from './internal/redirects';
export { handleAuthCallback } from './internal/callback';
export {
  resolveLoginView,
  type LoginSearchParams,
  type LoginView,
} from './internal/login-view';
export {
  resolveResetPasswordView,
  type ResetPasswordSearchParams,
  type ResetPasswordView,
} from './internal/reset-view';
export type { AuthActionState, AuthMode } from './internal/types';
