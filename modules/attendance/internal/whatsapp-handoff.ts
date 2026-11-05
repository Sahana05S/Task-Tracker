import { whatsappHref } from '@/shared/ui/share-link';
import type { CheckInKind } from './check-in-model';

/**
 * Opening WhatsApp straight after a check-in or check-out (user request,
 * 5 November 2026), so the attendance message is not forgotten. The record is
 * saved first; WhatsApp opens only once the page shows the drafted message for
 * that same action, at most once per saved action, and never after a reload
 * (this state lives only in the open page). Nothing is recorded as sent.
 *
 * Inside the Android app the page itself goes to the wa.me link (the shell
 * hands links outside the site to the system, which opens WhatsApp). In a
 * browser a tab opened after the save would be blocked, so Save opens a blank
 * tab in the same tap and that tab is sent to WhatsApp once the message is
 * ready; if the browser refuses the tab, the share panel stays as the way to
 * send it.
 */
export interface Handoff {
  kind: CheckInKind;
  operationId: string;
  state: 'saving' | 'saved';
  /** When the save was confirmed (ms). */
  savedAt: number;
  /** The tab opened in the Save tap; null in the app or when the browser refused it. */
  target: Window | null;
  native: boolean;
}

/** How long after a save the drafted message may still open WhatsApp. */
export const HANDOFF_TTL_MS = 2 * 60_000;

export type HandoffStep = 'none' | 'wait' | 'open' | 'expire';

/** What to do with a pending handoff now that the page shows `ready` (the drafted message, if any). */
export function handoffStep(handoff: Handoff | null, ready: { kind: CheckInKind; text: string } | null, now: number): HandoffStep {
  if (!handoff) return 'none';
  if (handoff.state !== 'saved') return 'wait';
  if (now - handoff.savedAt > HANDOFF_TTL_MS) return 'expire';
  if (!ready || ready.kind !== handoff.kind || !ready.text.trim()) return 'wait';
  return 'open';
}

let pending: Handoff | null = null;
const opened = new Set<string>();

function close(target: Window | null) {
  try { if (target && !target.closed) target.close(); } catch { /* already gone */ }
}

/**
 * Called in the Save tap, before the request: remembers the action and, in a
 * browser, opens the blank tab WhatsApp will load into.
 */
export function startHandoff(kind: CheckInKind, operationId: string, native: boolean, openTab: () => Window | null): void {
  if (opened.has(operationId)) return;
  if (pending && pending.operationId !== operationId) close(pending.target);
  let target = pending?.operationId === operationId ? pending.target : null;
  if (!native && (!target || target.closed)) {
    try { target = openTab(); } catch { target = null; }
    try { target?.document.write('<title>WhatsApp</title><p style="font:16px sans-serif;padding:24px">Saving your attendance… WhatsApp opens here next.</p>'); } catch { /* not writable */ }
  }
  pending = { kind, operationId, state: 'saving', savedAt: 0, target, native };
}

/** The save succeeded: the next drafted message of this kind opens WhatsApp. */
export function handoffSaved(operationId: string, now: number): void {
  if (pending?.operationId === operationId) pending = { ...pending, state: 'saved', savedAt: now };
}

/** The save failed or was refused: close the blank tab, open nothing. */
export function cancelHandoff(operationId: string): void {
  if (pending?.operationId !== operationId) return;
  close(pending.target);
  pending = null;
}

/**
 * Run by the drafted-message panel whenever it shows a message. Opens WhatsApp
 * once when a saved action of the same kind is waiting; returns whether it did.
 */
export function runHandoff(ready: { kind: CheckInKind; text: string } | null, now: number, navigate: (href: string) => void): boolean {
  const step = handoffStep(pending, ready, now);
  if (step === 'expire') { cancelHandoff(pending!.operationId); return false; }
  if (step !== 'open' || !pending || !ready) return false;
  const { operationId, target, native } = pending;
  pending = null;
  if (opened.has(operationId)) { close(target); return false; }
  opened.add(operationId);
  const href = whatsappHref(ready.text);
  if (target && !target.closed) {
    try { target.opener = null; } catch { /* cross-origin already */ }
    target.location.href = href;
    return true;
  }
  if (native) { navigate(href); return true; }
  return false; // the browser refused the tab: the share panel is the fallback
}

/** Test hook: forget every pending and opened action. */
export function resetHandoffs(): void {
  pending = null;
  opened.clear();
}
