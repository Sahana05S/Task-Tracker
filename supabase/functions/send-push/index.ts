/**
 * TaskPulse — send-push Edge Function (M20 phone notifications, migration 91)
 *
 * Drains taskpulse_private.push_outbox: claims due rows (public.push_claim),
 * sends each to Firebase Cloud Messaging (HTTP v1) and records the outcome
 * (public.push_complete, called with each company's x-taskpulse-organization
 * header). The database wakes it through pg_net when a notification is queued
 * and every minute while rows are due (pg_cron, taskpulse-push-retry).
 *
 * Deploy (done by .github/workflows/migrate-demo.yml and configure-push.yml):
 *   supabase functions deploy send-push --no-verify-jwt
 * The caller must send `Authorization: Bearer <PUSH_FUNCTION_SECRET>`; the
 * same value is in Vault as taskpulse_push_secret.
 *
 * Secrets (supabase secrets set, by configure-push.yml):
 *   PUSH_FUNCTION_SECRET      shared bearer secret
 *   FCM_SERVICE_ACCOUNT_JSON  Firebase service account key (project_id, client_email, private_key)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  injected by Supabase
 * Until both secrets exist it answers 503 without claiming anything, so rows
 * wait as pending.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { classifyFcmReply, fcmMessage, sameSecret, type PushItem, type PushResult } from './fcm.ts';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const MAX_ROUNDS = 5;
const BATCH = 100;
const PARALLEL = 10;

let cachedToken: { value: string; expiresAt: number } | null = null;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function readServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    return parsed.project_id && parsed.client_email && parsed.private_key ? (parsed as ServiceAccount) : null;
  } catch {
    return null;
  }
}

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signingKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

/** OAuth access token for FCM from the service account (JWT bearer grant), cached until near expiry. */
async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey(account.private_key), new TextEncoder().encode(`${header}.${claims}`));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${base64url(signature)}` }),
  });
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !data.access_token) throw new Error(`Google token request failed (${response.status} ${data.error ?? ''})`.trim());
  cachedToken = { value: data.access_token, expiresAt: now + (data.expires_in ?? 3600) };
  return data.access_token;
}

async function sendOne(item: PushItem, projectId: string, token: string): Promise<PushResult & { configError?: boolean }> {
  try {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(fcmMessage(item)),
    });
    const body = await response.json().catch(() => null);
    return { id: item.id, lease: item.lease, ...classifyFcmReply(response.status, body) };
  } catch (error) {
    return { id: item.id, lease: item.lease, outcome: 'retry', error: `Network: ${String(error)}`.slice(0, 300) };
  }
}

/** Records outcomes per company, each call scoped by the x-taskpulse-organization header. */
async function complete(url: string, key: string, items: PushItem[], results: PushResult[]): Promise<void> {
  const company = new Map(items.map((i) => [i.id, i.organizationId]));
  const byCompany = new Map<string, PushResult[]>();
  for (const r of results) {
    const org = company.get(r.id)!;
    byCompany.set(org, [...(byCompany.get(org) ?? []), { id: r.id, lease: r.lease, outcome: r.outcome, error: r.error }]);
  }
  for (const [org, rows] of byCompany) {
    const db = createClient(url, key, { auth: { persistSession: false }, global: { headers: { 'x-taskpulse-organization': org } } });
    const { error } = await db.rpc('push_complete', { p_results: rows });
    if (error) console.error('send-push: push_complete failed', org, error.message);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const secret = Deno.env.get('PUSH_FUNCTION_SECRET') ?? '';
  const given = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (secret.length < 32) return json(503, { status: 'not_configured', missing: 'PUSH_FUNCTION_SECRET' });
  if (!sameSecret(given, secret)) return json(401, { error: 'Unauthorized' });

  const account = readServiceAccount(Deno.env.get('FCM_SERVICE_ACCOUNT_JSON'));
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!account) return json(503, { status: 'not_configured', missing: 'FCM_SERVICE_ACCOUNT_JSON' });
  if (!url || !key) return json(500, { error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing' });

  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });
  const totals = { sent: 0, retry: 0, invalid_token: 0, failed: 0 };
  let token: string;
  try {
    token = await accessToken(account);
  } catch (error) {
    // Nothing claimed: rows stay pending and the retry tick wakes us again.
    console.error('send-push:', String(error));
    return json(502, { status: 'auth_failed', error: String(error).slice(0, 300) });
  }

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const { data, error } = await db.rpc('push_claim', { p_limit: BATCH });
    if (error) return json(500, { error: `push_claim failed: ${error.message}`, ...totals });
    const items = ((data as { items?: PushItem[] } | null)?.items ?? []);
    if (!items.length) break;

    const results: (PushResult & { configError?: boolean })[] = [];
    for (let i = 0; i < items.length; i += PARALLEL) {
      results.push(...(await Promise.all(items.slice(i, i + PARALLEL).map((item) => sendOne(item, account.project_id, token)))));
    }
    await complete(url, key, items, results);
    for (const r of results) totals[r.outcome] += 1;
    if (results.some((r) => r.configError)) {
      cachedToken = null;
      console.error('send-push: FCM rejected the credentials; rows wait for a retry');
      return json(502, { status: 'credentials_rejected', ...totals });
    }
    if (items.length < BATCH) break;
  }

  console.log(`send-push: sent=${totals.sent} retry=${totals.retry} invalid=${totals.invalid_token} failed=${totals.failed}`);
  return json(200, { status: 'ok', ...totals });
});
