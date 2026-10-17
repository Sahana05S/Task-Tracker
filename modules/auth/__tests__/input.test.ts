import { describe, expect, it } from 'vitest';

import { parseLoginInput, parseSignupInput, resolveInitialMode } from '../internal/input';
import { DEFAULT_REDIRECT } from '../internal/redirects';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe('parseLoginInput', () => {
  it('trims fields and narrows redirectTo', () => {
    expect(
      parseLoginInput(form({ email: ' a@b.co ', password: ' pw ', redirectTo: 'https://evil.test' })),
    ).toEqual({ ok: true, value: { email: 'a@b.co', password: 'pw', redirectTo: DEFAULT_REDIRECT } });
  });

  it('requires email and password', () => {
    expect(parseLoginInput(form({ email: 'a@b.co' }))).toEqual({
      ok: false,
      error: 'Enter both your email and password.',
    });
  });
});

describe('parseSignupInput', () => {
  const valid = { fullName: 'Ada', employeeId: 'EMP-1', email: 'a@b.co', password: '12345678' };

  it('accepts a complete form and ignores a role field', () => {
    expect(parseSignupInput(form({ ...valid, role: 'managing_director' }))).toEqual({ ok: true, value: valid });
  });

  it('reports the first problem in field order', () => {
    expect(parseSignupInput(form({ ...valid, fullName: '' }))).toEqual({ ok: false, error: 'Enter your full name.' });
    expect(parseSignupInput(form({ ...valid, employeeId: '' }))).toEqual({ ok: false, error: 'Enter your employee ID.' });
    expect(parseSignupInput(form({ ...valid, email: 'nope' }))).toEqual({ ok: false, error: 'Enter a valid email address.' });
    expect(parseSignupInput(form({ ...valid, password: '1234567' }))).toEqual({
      ok: false,
      error: 'Use a password of at least 8 characters.',
    });
  });
});

describe('resolveInitialMode', () => {
  it('opens signup only for tab=signup', () => {
    expect(resolveInitialMode('signup')).toBe('signup');
    expect(resolveInitialMode('signin')).toBe('login');
    expect(resolveInitialMode(undefined)).toBe('login');
  });
});
