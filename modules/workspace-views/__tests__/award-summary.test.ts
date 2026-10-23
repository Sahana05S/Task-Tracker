import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AwardReadModel } from '@/modules/scoring/client';
import { AwardSummary } from '@/modules/workspace-views/components/dashboard/award-summary';

const ASHA = '11111111-1111-4111-8111-111111111111';
const RAVI = '22222222-2222-4222-8222-222222222222';

type Day = AwardReadModel['days'][number];
const day = (date: string, over: Partial<Day>): Day =>
  ({ date, status: 'completed_winner', certified: true, winnerId: ASHA, reasons: [], jobStatus: 'complete', lastDecided: null, ...over } as Day);
const decided = (winnerId: string | null) =>
  ({ status: winnerId ? 'completed_winner' : 'completed_none', winnerId, runId: 'r', decidedAt: null, override: false } as const);

function model(days: Day[], missing: string[]): AwardReadModel {
  return {
    days, history: [], policy: null, policyApproved: true, scheduleEnabled: true, frozen: false, sourceWatermark: 'w', legacy: [],
    monthly: { status: 'incomplete', winnerId: null, counts: {}, tiedIds: [], reasons: [], missingDates: missing, tieBreak: {} },
  } as unknown as AwardReadModel;
}

const names = { [ASHA]: 'Asha Rao', [RAVI]: 'Ravi Kumar' };

describe('award summary while days are rechecked (migration 62)', () => {
  // 5 Oct certified (Asha); 6 Oct stale with Ravi's last star; 7 Oct stale without a winner; 8 Oct stale, never decided.
  const html = renderToStaticMarkup(createElement(AwardSummary, {
    names,
    awards: model([
      day('2026-10-05', {}),
      day('2026-10-06', { status: 'stale', certified: false, winnerId: null, jobStatus: 'pending', lastDecided: decided(RAVI) }),
      day('2026-10-07', { status: 'stale', certified: false, winnerId: null, jobStatus: 'pending', lastDecided: decided(null) }),
      day('2026-10-08', { status: 'stale', certified: false, winnerId: null, jobStatus: 'pending', lastDecided: null }),
    ], ['2026-10-06', '2026-10-07', '2026-10-08']),
  }));

  it('keeps the last decided results with the mark and counts them as rechecked', () => {
    expect(html).toContain('Mon 5 Oct: star awarded to Asha Rao<');
    expect(html).toContain('Tue 6 Oct: star awarded to Ravi Kumar (recalculating after a change)');
    expect(html).toContain('Wed 7 Oct: no winner (recalculating after a change)');
    expect(html).toContain('Thu 8 Oct: not calculated yet');
    expect(html).toContain('1 of 4</span> days decided, <span class="tabular font-semibold">2</span> being rechecked.');
    expect(html).toContain('Recalculating (2)</li>');
  });

  it('says why the marked days show an older result, and keeps the not-calculated sentence for the rest', () => {
    expect(html).toContain('2 days show their last decided result until the next run rechecks them after recent changes.');
    expect(html).toContain('1 day will be calculated in the next nightly run.');
  });
});
