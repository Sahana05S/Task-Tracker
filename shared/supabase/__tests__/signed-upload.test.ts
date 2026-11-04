import { describe, expect, it, vi } from 'vitest';

import { NOT_SENT, readForUpload, sendWithRetry, type SendAttempt } from '../signed-upload';

const noWait = () => Promise.resolve();
/** One send per listed outcome: null arrives, a string is the error message. */
const attempts = (...results: (string | null)[]) => {
  const fn = vi.fn<SendAttempt>(async () => {
    const message = results.shift();
    return { error: message ? { message } : null };
  });
  return Object.assign(fn, { calls: () => fn.mock.calls.length });
};

describe('sending a file to a signed upload link', () => {
  it('reports arrival on the first try', async () => {
    const send = attempts(null);
    expect(await sendWithRetry(send, noWait)).toBeNull();
    expect(send.calls()).toBe(1);
  });

  it('retries once when the request never left the phone (Android WebView "Failed to fetch")', async () => {
    const send = attempts('Failed to fetch', null);
    expect(await sendWithRetry(send, noWait)).toBeNull();
    expect(send.calls()).toBe(2);
  });

  it('gives a plain message after a second network failure, never the raw "Failed to fetch"', async () => {
    const send = attempts('Failed to fetch', 'Load failed');
    expect(await sendWithRetry(send, noWait)).toBe(NOT_SENT);
    expect(send.calls()).toBe(2);
  });

  it('counts a file already stored under the path as arrived (repeat after a lost response)', async () => {
    expect(await sendWithRetry(attempts('The resource already exists'), noWait)).toBeNull();
    expect(await sendWithRetry(attempts('Failed to fetch', 'Duplicate'), noWait)).toBeNull();
  });

  it('keeps other storage errors and does not retry them', async () => {
    const send = attempts('new row violates row-level security policy');
    expect(await sendWithRetry(send, noWait)).toBe('The file did not upload: new row violates row-level security policy');
    expect(send.calls()).toBe(1);
  });
});

describe('reading the picked file first', () => {
  it('copies the file into memory with the given type', async () => {
    const copy = await readForUpload(new Blob(['%PDF-1.7']), 'application/pdf');
    expect(copy?.type).toBe('application/pdf');
    expect(await copy?.text()).toBe('%PDF-1.7');
  });

  it('returns null when the device will not hand the file over', async () => {
    const unreadable = { arrayBuffer: () => Promise.reject(new DOMException('denied', 'NotReadableError')) } as unknown as Blob;
    expect(await readForUpload(unreadable, 'application/pdf')).toBeNull();
  });
});
