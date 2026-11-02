import { describe, expect, it } from 'vitest';

import { sessionUserIdFromCookies } from '@/modules/offline/internal/rules';

const session = { access_token: 'a', refresh_token: 'r', user: { id: 'member-a', email: 'a@example.test' } };
const base64 = (value: string) => Buffer.from(value, 'utf8').toString('base64url');

describe('sessionUserIdFromCookies (who the offline copy may be shown to)', () => {
  it('reads the member from a base64 session cookie, whole or in chunks', () => {
    const encoded = 'base64-' + base64(JSON.stringify(session));
    expect(sessionUserIdFromCookies(`theme=dark; sb-proj-auth-token=${encoded}`)).toBe('member-a');
    const [head, tail] = [encoded.slice(0, 20), encoded.slice(20)];
    expect(sessionUserIdFromCookies(`sb-proj-auth-token.1=${tail}; sb-proj-auth-token.0=${head}`)).toBe('member-a');
  });

  it('reads a plain URI-encoded session cookie', () => {
    expect(sessionUserIdFromCookies('sb-proj-auth-token=' + encodeURIComponent(JSON.stringify(session)))).toBe('member-a');
  });

  it('gives nobody when signed out or the cookie cannot be read', () => {
    expect(sessionUserIdFromCookies('')).toBeNull();
    expect(sessionUserIdFromCookies('theme=dark; taskpulse-first-run=1')).toBeNull();
    expect(sessionUserIdFromCookies('sb-proj-auth-token=base64-%%%')).toBeNull();
    expect(sessionUserIdFromCookies('sb-proj-auth-token=' + encodeURIComponent('{"user":{}}'))).toBeNull();
    // Two projects' sessions at once: do not guess.
    expect(sessionUserIdFromCookies(`sb-a-auth-token=${encodeURIComponent(JSON.stringify(session))}; sb-b-auth-token=${encodeURIComponent(JSON.stringify(session))}`)).toBeNull();
  });
});
