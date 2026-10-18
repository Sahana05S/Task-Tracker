/**
 * Post-authentication redirect validation.
 *
 * Lives in its own file because `modules/auth/actions.ts` is marked
 * `'use server'`, and every export from such a file must be an async Server
 * Action. A synchronous helper cannot be exported from there, and both the
 * login action and the login page need this exact check — duplicating it is how
 * the two drift apart and one of them grows an open redirect.
 */

export const DEFAULT_REDIRECT = '/today';

/**
 * Narrows an untrusted `redirectTo` value to a safe same-origin path, falling
 * back to {@link DEFAULT_REDIRECT}.
 *
 * Rejects, in order:
 *  - anything not starting with `/`, which covers `https://evil.test`
 *  - `//evil.test`, a protocol-relative URL the browser treats as cross-origin
 *  - `/\evil.test`, which some browsers normalise to a protocol-relative URL
 *  - any value containing `:`, which covers `javascript:` and scheme smuggling
 *  - `/login` itself, which would otherwise bounce the user straight back
 */
export function safeRedirectPath(candidate: string | undefined): string {
  if (!candidate) return DEFAULT_REDIRECT;
  if (!candidate.startsWith('/')) return DEFAULT_REDIRECT;
  if (candidate.startsWith('//')) return DEFAULT_REDIRECT;
  if (candidate.startsWith('/\\')) return DEFAULT_REDIRECT;
  if (candidate.includes(':')) return DEFAULT_REDIRECT;
  if (candidate === '/login' || candidate.startsWith('/login?')) {
    return DEFAULT_REDIRECT;
  }
  return candidate;
}
