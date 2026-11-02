import { beforeEach, describe, expect, it, vi } from 'vitest';

// An emailed reset or confirmation link must not move a signed-in browser onto another account.
const cookieAuth = { getUser: vi.fn(), verifyOtp: vi.fn(), setSession: vi.fn() };
const detachedAuth = { verifyOtp: vi.fn(), signOut: vi.fn(async () => ({ error: null })) };

vi.mock('@/shared/supabase/server', () => ({
  createClient: async () => ({ auth: cookieAuth }),
  createDetachedClient: () => ({ auth: detachedAuth }),
}));

const { verifyEmailToken } = await import('../internal/commands');
const { handleAuthCallback } = await import('../internal/callback');

const session = (userId: string) => ({
  data: { user: { id: userId }, session: { access_token: `access-${userId}`, refresh_token: `refresh-${userId}` } },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  cookieAuth.verifyOtp.mockResolvedValue(session('member-a'));
  cookieAuth.setSession.mockResolvedValue({ error: null });
});

describe('verifyEmailToken', () => {
  it('signs a signed-out browser in, as before', async () => {
    cookieAuth.getUser.mockResolvedValue({ data: { user: null } });
    expect(await verifyEmailToken('t', 'recovery')).toBe('verified');
    expect(cookieAuth.verifyOtp).toHaveBeenCalledWith({ token_hash: 't', type: 'recovery' });
    expect(detachedAuth.verifyOtp).not.toHaveBeenCalled();
  });

  it('refuses another account\'s link in a signed-in browser and leaves its session alone', async () => {
    cookieAuth.getUser.mockResolvedValue({ data: { user: { id: 'member-a' } } });
    detachedAuth.verifyOtp.mockResolvedValue(session('member-b'));
    expect(await verifyEmailToken('token-of-b', 'recovery')).toBe('other_account');
    expect(cookieAuth.verifyOtp).not.toHaveBeenCalled();
    expect(cookieAuth.setSession).not.toHaveBeenCalled();
    expect(detachedAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('accepts the signed-in member\'s own link', async () => {
    cookieAuth.getUser.mockResolvedValue({ data: { user: { id: 'member-a' } } });
    detachedAuth.verifyOtp.mockResolvedValue(session('member-a'));
    expect(await verifyEmailToken('own', 'recovery')).toBe('verified');
    expect(cookieAuth.setSession).toHaveBeenCalledWith({ access_token: 'access-member-a', refresh_token: 'refresh-member-a' });
  });

  it('fails a dead link without touching the session', async () => {
    cookieAuth.getUser.mockResolvedValue({ data: { user: { id: 'member-a' } } });
    detachedAuth.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'expired' } });
    expect(await verifyEmailToken('dead', 'recovery')).toBe('failed');
    expect(cookieAuth.setSession).not.toHaveBeenCalled();
  });
});

describe('handleAuthCallback', () => {
  it('keeps a signed-in member on their own account when opening someone else\'s reset link', async () => {
    cookieAuth.getUser.mockResolvedValue({ data: { user: { id: 'member-a' } } });
    detachedAuth.verifyOtp.mockResolvedValue(session('member-b'));
    const response = await handleAuthCallback(
      new Request('https://app.test/auth/callback?token_hash=token-of-b&type=recovery&next=/reset-password'),
    );
    expect(response.headers.get('location')).toBe('https://app.test/today');
    expect(cookieAuth.setSession).not.toHaveBeenCalled();
  });

  it('refuses an unknown link type', async () => {
    const response = await handleAuthCallback(new Request('https://app.test/auth/callback?token_hash=t&type=magiclink'));
    expect(response.headers.get('location')).toBe('https://app.test/login?error=callback');
    expect(cookieAuth.getUser).not.toHaveBeenCalled();
  });
});
