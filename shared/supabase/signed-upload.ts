import { createClient } from './client';

/** What a single attempt to send the file reports: nothing on success, else the error's message. */
export type SendAttempt = () => Promise<{ error: { message: string } | null }>;

export const UNREADABLE_FILE =
  'This file could not be read on this phone. Save it to the phone again (or pick it from Downloads) and try once more.';
export const NOT_SENT = 'The file could not be sent. Check the connection and try again.';

/** Browsers word a request that never reached the server like this ("Failed to fetch" in Chrome and Android WebView). */
const NETWORK_FAILURE = /failed to fetch|load failed|networkerror|network request failed/i;

/**
 * Sends once and retries once when the request never left the device; a file
 * already stored under the same path (a repeat after a lost response) counts as
 * arrived. Returns an error message for the person, or null when the file arrived.
 */
export async function sendWithRetry(send: SendAttempt, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<string | null> {
  for (let attempt = 1; ; attempt += 1) {
    const { error } = await send();
    if (!error) return null;
    if (/exists|duplicate/i.test(error.message)) return null;
    if (!NETWORK_FAILURE.test(error.message)) return `The file did not upload: ${error.message}`;
    if (attempt >= 2) return NOT_SENT;
    await wait(1500);
  }
}

/** Reads the picked file into memory; null when the device will not hand it over. */
export async function readForUpload(file: Blob, mimeType: string): Promise<Blob | null> {
  try {
    return new Blob([await file.arrayBuffer()], { type: mimeType });
  } catch {
    return null;
  }
}

/**
 * Browser half of every upload: sends a picked file to the signed upload link
 * the server made for one path in a storage bucket.
 *
 * The file is read into memory first. Android WebView (the Stellar app) often
 * cannot let its network stack open a file from the file chooser, so sending
 * the File itself failed with "Failed to fetch"; an in-memory copy avoids that.
 * Files are at most 25 MB.
 */
export async function sendToSignedUpload(bucket: string, ticket: { path: string; token: string }, file: Blob, mimeType: string): Promise<string | null> {
  const body = await readForUpload(file, mimeType);
  if (!body) return UNREADABLE_FILE;
  const storage = createClient().storage.from(bucket);
  return sendWithRetry(async () => {
    try {
      const { error } = await storage.uploadToSignedUrl(ticket.path, ticket.token, body, { contentType: mimeType, upsert: false });
      return { error: error ? { message: errorText(error) } : null };
    } catch (thrown) {
      return { error: { message: errorText(thrown) } };
    }
  });
}

/** The message, plus the cause's when storage-js wraps a fetch TypeError in StorageUnknownError. */
function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { originalError?: unknown; cause?: unknown }).originalError ?? error.cause;
  return cause instanceof Error && cause.message && cause.message !== error.message ? `${error.message} (${cause.message})` : error.message;
}
