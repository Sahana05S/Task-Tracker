import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/modules/records/actions', () => ({ writeDatedRecord: vi.fn() }));

import { DatedRecordModule, type DatedEntry } from '@/modules/support/components/dated-record-module';
import type { User } from '@/types/tracker';

const user = { id: 'u1', fullName: 'Kaviya', role: 'team_member', isActive: true, employeeId: 'K1', email: 'k@x.test', createdAt: '2026-10-01T00:00:00Z' } as User;

function card(extras: DatedEntry['extras']) {
  const entry: DatedEntry = {
    id: 'm1', businessDate: '2026-10-20', authorId: 'u1', content: 'Site safety', assetUrl: null, recordVersion: 1,
    validationState: 'pending', validationAt: null, validatorId: null, validationReason: null, relatedTaskId: null, extras,
  } as DatedEntry;
  return renderToStaticMarkup(createElement(DatedRecordModule, { kind: 'meeting', entries: [entry], members: [user], user }));
}

describe('meeting point card', () => {
  it('leaves out rows with nothing recorded', () => {
    const html = card({ meeting_type: 'Weekly', point_type: 'Concern', owner_id: null, resolution: null, comments: '', resolution_status: 'Not Started', resolution_due: null, resolved_on: null });
    expect(html).toContain('<dd class="break-words">Weekly / Concern</dd>');
    expect(html).toContain('Not Started</dd>');
    expect(html).not.toContain('<dt>Comments</dt>');
    expect(html).not.toContain('<dt>Dates</dt>');
    expect(html).not.toContain('undefined');
  });

  it('joins due and resolved dates', () => {
    expect(card({ meeting_type: 'Daily', resolution_due: '2026-10-25', resolved_on: '2026-10-24' })).toContain('due 2026-10-25, resolved 2026-10-24');
  });
});
