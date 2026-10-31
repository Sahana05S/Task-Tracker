/**
 * The site's public origin, for links that leave the app (password-reset and
 * sign-up emails, the auth callback's redirects). Configuration comes first:
 * NEXT_PUBLIC_SITE_URL, else Vercel's production host. Only without either is
 * the request's own host used, so a forwarded host header can never point an
 * emailed link at another site on a configured deployment.
 */
export function publicOrigin(getHeader: (name: string) => string | null, fallback = ''): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;
  if (process.env.NODE_ENV !== 'development') {
    const forwarded = getHeader('x-forwarded-host');
    if (forwarded) return `https://${forwarded}`;
  }
  const host = getHeader('host');
  if (host) return `${getHeader('x-forwarded-proto') || (process.env.NODE_ENV === 'development' ? 'http' : 'https')}://${host}`;
  return fallback;
}
