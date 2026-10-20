import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestPasswordReset = vi.fn<(email: string) => Promise<string | null>>();
const updatePassword = vi.fn<(password: string) => Promise<string | null>>();
const getAuthState = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`redirect:${path}`);
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => redirect(path) }));
vi.mock('@/shared/session/profile', () => ({ getAuthState: () => getAuthState() }));
vi.mock('../internal/commands', () => ({
  requestPasswordReset: (email: string) => requestPasswordReset(email),
  updatePassword: (password: string) => updatePassword(password),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUpAccount: vi.fn(),
}));

const { forgotPassword, resetPassword } = await import('../actions');
const { parseNewPasswordInput, parseResetRequestInput } = await import('../internal/input');
const { recoveryCallbackPath } = await import('../internal/reset-view');
const { RESET_REQUEST_MESSAGE } = await import('../internal/types');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('parseResetRequestInput', () => {
  it('trims a plausible address and rejects anything else', () => {
    expect(parseResetRequestInput(form({ email: ' a@b.co ' }))).toEqual({ ok: true, value: { email: 'a@b.co' } });
    expect(parseResetRequestInput(form({ email: 'nope' }))).toEqual({ ok: false, error: 'Enter a valid email address.' });
    expect(parseResetRequestInput(form({}))).toEqual({ ok: false, error: 'Enter a valid email address.' });
  });
});

describe('parseNewPasswordInput', () => {
  it('applies the signup length rule, then requires a matching confirmation', () => {
    expect(parseNewPasswordInput(form({ password: '1234567', confirmPassword: '1234567' }))).toEqual({
      ok: false,
      error: 'Use a password of at least 8 characters.',
    });
    expect(parseNewPasswordInput(form({ password: '12345678', confirmPassword: '12345679' }))).toEqual({
      ok: false,
      error: 'The two passwords do not match.',
    });
    expect(parseNewPasswordInput(form({ password: '12345678', confirmPassword: '12345678' }))).toEqual({
      ok: true,
      value: { password: '12345678' },
    });
  });
});

describe('forgotPassword', () => {
  it('answers with the same neutral message whether or not Supabase reports a problem', async () => {
    requestPasswordReset.mockResolvedValueOnce(null);
    const sent = await forgotPassword(null, form({ email: 'known@b.co' }));

    requestPasswordReset.mockResolvedValueOnce('Email rate limit exceeded');
    const failed = await forgotPassword(null, form({ email: 'unknown@b.co' }));

    const neutral = { success: true, data: { message: RESET_REQUEST_MESSAGE } };
    expect(sent).toEqual(neutral);
    expect(failed).toEqual(neutral);
    expect(RESET_REQUEST_MESSAGE).toBe('If that address has an account, an email is on its way.');
    expect(requestPasswordReset).toHaveBeenNthCalledWith(1, 'known@b.co');
  });

  it('rejects a malformed address without calling Supabase', async () => {
    expect(await forgotPassword(null, form({ email: 'nope' }))).toEqual({
      success: false,
      error: 'Enter a valid email address.',
    });
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });
});

describe('resetPassword', () => {
  const valid = { password: '12345678', confirmPassword: '12345678' };

  it('needs the session a recovery link opened', async () => {
    getAuthState.mockResolvedValue({ authUserId: null, profile: null });
    const result = await resetPassword(null, form(valid));
    expect(result.success).toBe(false);
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('updates the password and goes to the signed-in home', async () => {
    getAuthState.mockResolvedValue({ authUserId: 'user-1', profile: null });
    updatePassword.mockResolvedValueOnce(null);
    await expect(resetPassword(null, form(valid))).rejects.toThrow('redirect:/today');
    expect(updatePassword).toHaveBeenCalledWith('12345678');
  });

  it('shows the Supabase error and does not redirect', async () => {
    getAuthState.mockResolvedValue({ authUserId: 'user-1', profile: null });
    updatePassword.mockResolvedValueOnce('New password should be different from the old password.');
    expect(await resetPassword(null, form(valid))).toEqual({
      success: false,
      error: 'New password should be different from the old password.',
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('recoveryCallbackPath', () => {
  it('forwards a PKCE code or a recovery token_hash to /auth/callback', () => {
    expect(recoveryCallbackPath({ code: 'abc' })).toBe('/auth/callback?next=%2Freset-password&code=abc');
    expect(recoveryCallbackPath({ token_hash: 'h1', type: 'recovery' })).toBe(
      '/auth/callback?next=%2Freset-password&token_hash=h1&type=recovery',
    );
  });

  it('ignores a plain visit and other token types', () => {
    expect(recoveryCallbackPath({})).toBeNull();
    expect(recoveryCallbackPath({ token_hash: 'h1', type: 'signup' })).toBeNull();
  });
});
