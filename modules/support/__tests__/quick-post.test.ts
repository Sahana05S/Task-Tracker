import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => toastSuccess(...args) } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/modules/support/actions', () => ({ loadPostChoices: vi.fn() }));
vi.mock('@/modules/records/actions', () => ({ writeDatedRecord: vi.fn() }));

import {
  announcePosted,
  POST_KINDS,
  QuickPostForm,
  readLastPostKind,
  rememberPostKind,
} from '@/modules/support/components/quick-post-drawer';
import type { RecordKind } from '@/modules/support/client';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const choices = {
  user: { id: 'u1', role: 'data_manager' as const },
  members: [{ id: 'u1', fullName: 'Kaviya', isActive: true }],
  tasks: [{ id: TASK_ID, tag: 'TT-1', title: 'Site survey' }],
};

type FormProps = Parameters<typeof QuickPostForm>[0];

function form(kind: RecordKind, extra: Partial<FormProps> = {}) {
  return renderToStaticMarkup(createElement(QuickPostForm, {
    kind, onKindChange: () => undefined, choices, loadError: null, onSaved: () => undefined, ...extra,
  }));
}

function stubStorage(storage: Partial<Storage>) {
  vi.stubGlobal('window', { localStorage: storage });
}

afterEach(() => {
  vi.unstubAllGlobals();
  toastSuccess.mockReset();
});

describe('quick Post drawer form', () => {
  it('offers the five record kinds and marks the chosen one', () => {
    expect(POST_KINDS.map((kind) => kind.value)).toEqual(['fact', 'idea', 'suggestion', 'sale', 'meeting']);
    expect(form('idea')).toMatch(/aria-pressed="true"[^>]*>Idea</);
  });

  it('shows the sale extras only for a sale', () => {
    const html = form('sale');
    expect(html).toContain('name="is_new_project"');
    expect(html).toContain('name="basement_payment_received"');
    expect(html).toContain('Post sale');
    expect(form('fact')).not.toContain('is_new_project');
  });

  it('shows the meeting-point extras only for a meeting point', () => {
    const html = form('meeting');
    expect(html).toContain('name="meeting_type"');
    expect(html).toContain('name="point_type"');
    expect(html).toContain('name="owner_id"');
    expect(html).toContain('Post meeting point');
    expect(form('suggestion')).not.toContain('meeting_type');
  });

  it('presets the related mission', () => {
    expect(form('fact', { presetTaskId: TASK_ID })).toMatch(new RegExp(`<option value="${TASK_ID}" selected="">TT-1`));
  });

  it('shows loading and load errors instead of the editor', () => {
    expect(form('fact', { choices: null })).toContain('Loading missions and members');
    expect(form('fact', { loadError: 'Members could not be loaded' })).toContain('Members could not be loaded');
  });
});

describe('last-used kind', () => {
  it('opens on Fact the first time and then on the last posted kind', () => {
    const saved = new Map<string, string>();
    stubStorage({ getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => void saved.set(key, value) });
    expect(readLastPostKind()).toBe('fact');
    rememberPostKind('sale');
    expect(readLastPostKind()).toBe('sale');
  });

  it('ignores an unknown stored value', () => {
    stubStorage({ getItem: () => 'attendance' });
    expect(readLastPostKind()).toBe('fact');
  });

  it('survives storage that throws', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    stubStorage({ getItem: blocked, setItem: blocked });
    expect(readLastPostKind()).toBe('fact');
    expect(() => rememberPostKind('idea')).not.toThrow();
  });
});

describe('after a successful post', () => {
  it('closes, remembers the kind and toasts with View and Post another', () => {
    const setItem = vi.fn();
    stubStorage({ setItem });
    const close = vi.fn();
    const navigate = vi.fn();
    const onPostAnother = vi.fn();

    announcePosted('meeting', { close, navigate, onPostAnother });

    expect(close).toHaveBeenCalledOnce();
    expect(setItem).toHaveBeenCalledWith('taskpulse:quick-post-kind', 'meeting');
    const [title, options] = toastSuccess.mock.calls[0];
    expect(title).toBe('Meeting point posted');
    expect(options.action.label).toBe('View');
    options.action.onClick();
    expect(navigate).toHaveBeenCalledWith('/meeting-points');
    expect(options.cancel.label).toBe('Post another');
    options.cancel.onClick();
    expect(onPostAnother).toHaveBeenCalledWith('meeting');
  });
});
