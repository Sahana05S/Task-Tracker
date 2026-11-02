import type { NextConfig } from 'next';

/** The Supabase origin the browser talks to (REST, storage uploads, realtime). */
function supabaseOrigins(): string[] {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    return [url.origin, `${url.protocol === 'http:' ? 'ws' : 'wss'}://${url.host}`];
  } catch {
    return [];
  }
}

/**
 * Enforced now: directives no page relies on breaking. Framing stays denied,
 * plugins are off, a <base> tag cannot re-point relative URLs and forms post
 * only to this origin (server actions).
 */
const ENFORCED_CSP = ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');

/**
 * Report-only until signed-in pages are seen clean in browsers: everything
 * this origin, plus Supabase, https/blob/data images (branding, signed photo
 * links, the camera preview) and the OpenStreetMap check-in embed. The two
 * inline layout scripts and Next.js' own bootstrap still need 'unsafe-inline';
 * removing it needs per-request nonces (a later step).
 */
const REPORT_ONLY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  ["connect-src 'self'", ...supabaseOrigins()].join(' '),
  'frame-src https://www.openstreetmap.org',
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Response headers for every page and route. The workspace shows salary and
 * personal documents, so no other site may frame it, and signed file links
 * must not leak through the Referer header. Camera and location are used by
 * attendance check-in on this origin only (the Android app loads the site at
 * the top level, so none of this affects it).
 */
const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: ENFORCED_CSP },
  { key: 'Content-Security-Policy-Report-Only', value: REPORT_ONLY_CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // No other site's window keeps a handle on ours, and our files are not
  // loadable by other sites (ZAP baseline, 2 November 2026).
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // no X-Powered-By: Next.js on responses
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
