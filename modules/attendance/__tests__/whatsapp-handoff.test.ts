import { afterEach, describe, expect, it, vi } from 'vitest';

import { cancelHandoff, HANDOFF_TTL_MS, handoffSaved, handoffStep, runHandoff, startHandoff, type Handoff } from '../client';
import { resetHandoffs } from '../internal/whatsapp-handoff';
import { whatsappHref } from '@/shared/ui/share-link';

/** A stand-in for the blank tab opened in the Save tap. */
function fakeTab() {
  return { closed: false, opener: {}, location: { href: 'about:blank' }, document: { write: vi.fn() }, close() { this.closed = true; } };
}
type Tab = ReturnType<typeof fakeTab>;
const asWindow = (tab: Tab) => tab as unknown as Window;

const GREETING = { kind: 'in' as const, text: '*Good morning*, team' };
const REPORT = { kind: 'out' as const, text: 'Checked in 9:30 AM, out 6:30 PM' };

afterEach(() => resetHandoffs());

describe('handoffStep', () => {
  const saved: Handoff = { kind: 'in', operationId: 'a', state: 'saved', savedAt: 1000, target: null, native: true };
  it('opens only for a saved action whose message of the same kind is shown', () => {
    expect(handoffStep(null, GREETING, 1000)).toBe('none');
    expect(handoffStep({ ...saved, state: 'saving' }, GREETING, 1000)).toBe('wait');
    expect(handoffStep(saved, null, 1000)).toBe('wait');
    expect(handoffStep(saved, REPORT, 1000)).toBe('wait');
    expect(handoffStep(saved, { kind: 'in', text: '  ' }, 1000)).toBe('wait');
    expect(handoffStep(saved, GREETING, 1000)).toBe('open');
  });
  it('gives up once the message is too late', () => {
    expect(handoffStep(saved, GREETING, 1000 + HANDOFF_TTL_MS)).toBe('open');
    expect(handoffStep(saved, GREETING, 1001 + HANDOFF_TTL_MS)).toBe('expire');
  });
});

describe('in the Android app', () => {
  it('goes to WhatsApp with the check-in greeting once, after the save', () => {
    const navigate = vi.fn();
    const openTab = vi.fn();
    startHandoff('in', 'op-1', true, openTab);
    expect(openTab).not.toHaveBeenCalled();
    expect(runHandoff(GREETING, 10, navigate)).toBe(false); // still saving
    handoffSaved('op-1', 10);
    expect(runHandoff(GREETING, 20, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledWith(whatsappHref(GREETING.text));
    // A second render, or the same panel after a refresh, opens nothing.
    expect(runHandoff(GREETING, 30, navigate)).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('sends the check-out report, not the greeting still on the page', () => {
    const navigate = vi.fn();
    startHandoff('out', 'op-2', true, vi.fn());
    handoffSaved('op-2', 10);
    expect(runHandoff(GREETING, 20, navigate)).toBe(false);
    expect(runHandoff(REPORT, 30, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(whatsappHref(REPORT.text));
  });

  it('opens nothing when the save fails', () => {
    const navigate = vi.fn();
    startHandoff('in', 'op-3', true, vi.fn());
    cancelHandoff('op-3');
    expect(runHandoff(GREETING, 10, navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens nothing on a page that saved nothing (a reload)', () => {
    const navigate = vi.fn();
    expect(runHandoff(GREETING, 10, navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('in a browser', () => {
  it('sends the tab opened in the Save tap to WhatsApp', () => {
    const tab = fakeTab();
    const navigate = vi.fn();
    startHandoff('in', 'op-4', false, () => asWindow(tab));
    handoffSaved('op-4', 10);
    expect(runHandoff(GREETING, 20, navigate)).toBe(true);
    expect(tab.location.href).toBe(whatsappHref(GREETING.text));
    expect(tab.opener).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('closes the tab when the save fails or the message never comes', () => {
    const failed = fakeTab();
    startHandoff('in', 'op-5', false, () => asWindow(failed));
    cancelHandoff('op-5');
    expect(failed.closed).toBe(true);

    const late = fakeTab();
    startHandoff('out', 'op-6', false, () => asWindow(late));
    handoffSaved('op-6', 0);
    expect(runHandoff(null, HANDOFF_TTL_MS + 1, vi.fn())).toBe(false);
    expect(late.closed).toBe(true);
  });

  it('leaves the share panel as the fallback when the browser blocks the tab', () => {
    const navigate = vi.fn();
    startHandoff('in', 'op-7', false, () => null);
    handoffSaved('op-7', 10);
    expect(runHandoff(GREETING, 20, navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('reuses the tab when a lost response is retried with the same action', () => {
    const tab = fakeTab();
    const openTab = vi.fn(() => asWindow(tab));
    startHandoff('in', 'op-8', false, openTab);
    startHandoff('in', 'op-8', false, openTab);
    expect(openTab).toHaveBeenCalledTimes(1);
  });
});
