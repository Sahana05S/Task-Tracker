import 'server-only';

import { createHash, createSign } from 'node:crypto';

/**
 * Google Drive REST calls for the company Shared Drive. PRIVATE. The service
 * account key comes only from the server environment
 * (TASKPULSE_DRIVE_SERVICE_ACCOUNT_JSON, go-live Part F7); nothing here logs or
 * returns it. Every call names the Shared Drive (supportsAllDrives), and the
 * app finds its own folders and files by an app property, never by name.
 */

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
const SCOPE = 'https://www.googleapis.com/auth/drive';
const APP_PROPERTY = 'taskpulse';

export class DriveError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

interface ServiceKey { client_email: string; private_key: string }

function readKey(): ServiceKey | null {
  try {
    const value = JSON.parse(process.env.TASKPULSE_DRIVE_SERVICE_ACCOUNT_JSON ?? '') as Partial<ServiceKey>;
    return typeof value.client_email === 'string' && typeof value.private_key === 'string' && value.private_key
      ? { client_email: value.client_email, private_key: value.private_key }
      : null;
  } catch {
    return null;
  }
}

/** The service account the key belongs to (not secret), or null when no usable key is set. */
export function serviceAccountEmail(): string | null {
  return readKey()?.client_email ?? null;
}

let cached: { token: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.until > Date.now()) return cached.token;
  const key = readKey();
  if (!key) throw new DriveError('The Drive service account key is not set on the server.');
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: key.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  let signature: string;
  try {
    signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  } catch {
    throw new DriveError('The Drive service account key could not be read.');
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new DriveError(`Google refused the service account (${response.status}).`, response.status);
  const value = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!value.access_token) throw new DriveError('Google returned no access token.');
  cached = { token: value.access_token, until: Date.now() + Math.max(0, Math.min(value.expires_in ?? 0, 3600) - 120) * 1000 };
  return cached.token;
}

async function call(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const token = await accessToken();
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    let reason = '';
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      reason = body.error?.message ? `: ${body.error.message}` : '';
    } catch { /* not JSON */ }
    throw new DriveError(`Google Drive answered ${response.status}${reason}`.slice(0, 400), response.status);
  }
  return response;
}

const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

async function findByKey(driveId: string, parentId: string, key: string, folder: boolean): Promise<string | null> {
  const q = [
    `${quote(parentId)} in parents`,
    `appProperties has { key=${quote(APP_PROPERTY)} and value=${quote(key)} }`,
    `mimeType ${folder ? '=' : '!='} ${quote(FOLDER)}`,
    'trashed = false',
  ].join(' and ');
  const params = new URLSearchParams({
    q, corpora: 'drive', driveId, includeItemsFromAllDrives: 'true', supportsAllDrives: 'true',
    orderBy: 'createdTime', pageSize: '1', fields: 'files(id)',
  });
  const response = await call(`${DRIVE}/files?${params}`);
  const body = (await response.json()) as { files?: { id: string }[] };
  return body.files?.[0]?.id ?? null;
}

/** The Shared Drive's name; fails when the drive is missing or the service account is not a member. */
export async function sharedDriveName(driveId: string): Promise<string> {
  const response = await call(`${DRIVE}/drives/${encodeURIComponent(driveId)}?fields=id,name`, {}, 15_000);
  return ((await response.json()) as { name?: string }).name ?? driveId;
}

/** The app's folder for `key` under the parent, created with `name` the first time. */
export async function folderFor(driveId: string, parentId: string, key: string, name: string): Promise<string> {
  const found = await findByKey(driveId, parentId, key, true);
  if (found) return found;
  const response = await call(`${DRIVE}/files?supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId], appProperties: { [APP_PROPERTY]: key } }),
  });
  return ((await response.json()) as { id: string }).id;
}

/** A stable app key for one stored file, so a retried move finds the copy it already made. */
export function fileKey(bucket: string, path: string): string {
  return `file:${createHash('sha256').update(`${bucket}:${path}`).digest('hex').slice(0, 40)}`;
}

export async function existingFile(driveId: string, parentId: string, key: string): Promise<string | null> {
  return findByKey(driveId, parentId, key, false);
}

/** Uploads through a resumable session (any size up to the app's limits); returns the new file id. */
export async function uploadFile(input: { parentId: string; name: string; mimeType: string; key: string; body: ArrayBuffer }): Promise<string> {
  const session = await call(`${UPLOAD}/files?uploadType=resumable&supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': input.mimeType,
      'X-Upload-Content-Length': String(input.body.byteLength),
    },
    body: JSON.stringify({ name: input.name, mimeType: input.mimeType, parents: [input.parentId], appProperties: { [APP_PROPERTY]: input.key } }),
  });
  const location = session.headers.get('location');
  if (!location) throw new DriveError('Google Drive did not open an upload session.');
  const response = await call(location, { method: 'PUT', headers: { 'Content-Type': input.mimeType }, body: input.body }, 120_000);
  const id = ((await response.json()) as { id?: string }).id;
  if (!id) throw new DriveError('Google Drive did not return the uploaded file.');
  return id;
}

/** The file's bytes as a streaming response. */
export async function openFile(fileId: string): Promise<Response> {
  return call(`${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {}, 60_000);
}

/** Moves a file to the Shared Drive's trash (Google keeps it 30 days). A file already gone is fine. */
export async function trashFile(fileId: string): Promise<void> {
  try {
    await call(`${DRIVE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
    });
  } catch (error) {
    if (error instanceof DriveError && error.status === 404) return;
    throw error;
  }
}
