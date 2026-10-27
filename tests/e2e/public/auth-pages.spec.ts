import { test, expect, horizontalOverflow } from '../fixtures';
import { WORKSPACE_ROUTES } from '../routes';

// Anonymous visitor: landing page, sign-in, password reset and the edge guard.
// Nothing here submits credentials; the role projects cover signed-in flows.

test.describe('landing page', () => {
  test('renders for an anonymous visitor without errors', async ({ page, diagnostics }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/Stellar/);
    await expect(page.locator('main#main')).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    diagnostics.assertClean();
  });

  test('sign-in link reaches the login page', async ({ page, isMobile }) => {
    await page.goto('/');
    const signIn = page.getByRole('link', { name: /sign in/i }).first();
    // On a phone the header link may sit behind a menu button.
    if (isMobile && !(await signIn.isVisible())) {
      await page.getByRole('button', { name: /menu/i }).first().click();
    }
    await signIn.click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('login page', () => {
  test('shows the sign-in form', async ({ page, diagnostics }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Sign in/);
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true }).last()).toBeVisible();
    await expect(page.getByRole('link', { name: /forgot password/i })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    diagnostics.assertClean();
  });

  test('empty submit is stopped by required fields', async ({ page }) => {
    await page.goto('/login');
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
    // Native validation keeps the user on the page with the email field invalid.
    await expect(page).toHaveURL(/\/login/);
    expect(await page.getByLabel('Email').evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  });

  test('invitation tab asks for an 8+ character password', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(page.getByLabel('Invited email')).toBeVisible();
    await expect(page.getByLabel('Password')).toHaveAttribute('minlength', '8');
  });

  test('keeps a safe redirectTo for after sign-in', async ({ page }) => {
    await page.goto('/login?redirectTo=%2Ftasks%3Fview%3Dboard');
    await expect(page.locator('input[name="redirectTo"]')).toHaveValue('/tasks?view=board');
  });

  for (const hostile of ['//evil.example', '/\\evil.example', 'https://evil.example', '/\t/evil.example', '/\n/evil.example']) {
    test(`drops an off-site redirectTo (${JSON.stringify(hostile)})`, async ({ page, baseURL }) => {
      await page.goto(`/login?redirectTo=${encodeURIComponent(hostile)}`);
      const value = await page.locator('input[name="redirectTo"]').inputValue();
      // Whatever survives must resolve to this site, the way a browser reads it.
      expect(new URL(value, baseURL).origin).toBe(new URL(baseURL!).origin);
    });
  }

  test('does not show arbitrary text from the error parameter', async ({ page }) => {
    const planted = 'Your account is locked. Call 00000 to unlock it';
    await page.goto(`/login?error=${encodeURIComponent(planted)}`);
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByText(planted)).toHaveCount(0);
  });
});

test.describe('password reset', () => {
  test('request form validates the email', async ({ page, diagnostics }) => {
    await page.goto('/reset-password');
    await expect(page.getByLabel('Email')).toBeVisible();
    await page.getByLabel('Email').fill('not-an-email');
    await page.locator('form').getByRole('button').last().click();
    // Native type=email validation or the server message; either way no email is sent.
    const invalid = await page.getByLabel('Email').evaluate((el: HTMLInputElement) => !el.validity.valid);
    if (!invalid) await expect(page.getByRole('alert').filter({ hasText: /valid email/i })).toBeVisible();
    diagnostics.assertClean();
  });

  test('an expired link lands on a page that offers a new one', async ({ page }) => {
    await page.goto('/reset-password?error=link');
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('a bogus callback code returns to sign-in with a notice', async ({ page }) => {
    await page.goto('/auth/callback?code=qa-invalid-code');
    await expect(page).toHaveURL(/\/login\?error=/);
    await expect(page.getByRole('alert').filter({ hasText: /verification failed/i })).toBeVisible();
  });
});

test.describe('edge guard', () => {
  for (const route of WORKSPACE_ROUTES) {
    test(`anonymous ${route.path} goes to login`, async ({ request, baseURL }) => {
      const response = await request.get(route.path, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      const location = new URL(response.headers()['location'], baseURL);
      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('redirectTo')).toBe(route.path);
    });
  }

  test('unknown public path is a 404, not a crash', async ({ request }) => {
    const response = await request.get('/qa-no-such-page');
    expect(response.status()).toBe(404);
  });
});
