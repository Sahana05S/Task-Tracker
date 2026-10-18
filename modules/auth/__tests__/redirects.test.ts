import { describe, expect, it } from 'vitest';
import { safeRedirectPath, DEFAULT_REDIRECT } from '../internal/redirects';

describe('safeRedirectPath', () => {
  it('returns the candidate when it is a safe path', () => {
    expect(safeRedirectPath('/dashboard')).toBe('/dashboard');
    expect(safeRedirectPath('/tasks')).toBe('/tasks');
    expect(safeRedirectPath('/milestones/overview')).toBe('/milestones/overview');
  });

  it('returns DEFAULT_REDIRECT for undefined', () => {
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT);
  });

  it('returns DEFAULT_REDIRECT for an empty string', () => {
    expect(safeRedirectPath('')).toBe(DEFAULT_REDIRECT);
  });

  it('rejects a relative path without a leading slash', () => {
    expect(safeRedirectPath('dashboard')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath('evil.test/steal')).toBe(DEFAULT_REDIRECT);
  });

  it('rejects https:// absolute URLs', () => {
    expect(safeRedirectPath('https://evil.test')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath('https://evil.test/path')).toBe(DEFAULT_REDIRECT);
  });

  it('rejects protocol-relative URLs starting with //', () => {
    expect(safeRedirectPath('//evil.test')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath('//evil.test/steal-token')).toBe(DEFAULT_REDIRECT);
  });

  it('rejects backslash-prefixed paths that browsers normalise to protocol-relative', () => {
    expect(safeRedirectPath('/\\evil.test')).toBe(DEFAULT_REDIRECT);
  });

  it('rejects javascript: scheme', () => {
    expect(safeRedirectPath('javascript:alert(1)')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath('/javascript:alert(1)')).toBe(DEFAULT_REDIRECT);
  });

  it('rejects any path containing a colon (scheme smuggling)', () => {
    expect(safeRedirectPath('/path:with:colons')).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath('/data:text/html,<script>alert(1)</script>')).toBe(DEFAULT_REDIRECT);
  });

  it('rejects /login to prevent a redirect loop', () => {
    expect(safeRedirectPath('/login')).toBe(DEFAULT_REDIRECT);
  });

  it('rejects /login?... to prevent a redirect loop with query params', () => {
    expect(safeRedirectPath('/login?redirectTo=/dashboard')).toBe(DEFAULT_REDIRECT);
  });

  it('DEFAULT_REDIRECT is /dashboard', () => {
    expect(DEFAULT_REDIRECT).toBe('/today');
  });
});
