import { describe, expect, it } from 'vitest';

import { averageScore, toLines } from '@/modules/hr/client';
import { parseReviewInput } from '@/modules/hr/internal/review-input';
import { mapReview } from '@/modules/hr/internal/review-model';

const OP = '11111111-1111-4111-8111-111111111111';
const REVIEW = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

function form(fields: Record<string, unknown>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  return data;
}

describe('performance review rules', () => {
  it('averages only the scores that are set', () => {
    expect(averageScore([4, 5, null, 3])).toBe(4);
    expect(averageScore([4, 5])).toBe(4.5);
    expect(averageScore([2, 3, 3])).toBe(2.67);
    expect(averageScore([null])).toBeNull();
  });

  it('turns a textarea into at most ten trimmed lines', () => {
    expect(toLines('- Reliable\n\n  • Clear updates  \r\n* Helps others')).toEqual(['Reliable', 'Clear updates', 'Helps others']);
    expect(toLines(Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n'))).toHaveLength(10);
  });

  it('reads a self-review save and submit', () => {
    const parsed = parseReviewInput(form({
      op: 'self', reviewId: REVIEW, version: '3', operationId: OP,
      payload: { ratings: [{ sort: 0, score: 4, comment: ' good ' }, { sort: 1, score: null }], pros: ['Fast', ' '], cons: [], finish: true },
    }));
    expect(parsed).toEqual({ ok: true, value: {
      op: 'self', reviewId: REVIEW, expectedVersion: 3, operationId: OP,
      payload: { ratings: [{ sort: 0, score: 4, comment: 'good' }, { sort: 1, score: null, comment: '' }], pros: ['Fast'], cons: [], submit: true },
    } });
  });

  it('refuses scores outside 1-5 and reviews without employees or metrics', () => {
    const bad = parseReviewInput(form({ op: 'director', reviewId: REVIEW, version: '0', operationId: OP, payload: { ratings: [{ sort: 0, score: 6 }] } }));
    expect(bad).toEqual({ ok: false, error: 'Scores go from 1 to 5.' });
    const empty = parseReviewInput(form({ op: 'create', version: '0', operationId: OP, payload: { employeeIds: [], metricIds: [REVIEW], title: 'Oct' } }));
    expect(empty).toEqual({ ok: false, error: 'Choose at least one employee.' });
    const ok = parseReviewInput(form({ op: 'create', version: '0', operationId: OP, payload: { employeeIds: [USER, 'x'], metricIds: [REVIEW], title: ' Oct review ' } }));
    expect(ok.ok && ok.value.payload).toEqual({ employeeIds: [USER], metricIds: [REVIEW], title: 'Oct review' });
  });

  it('keeps the director side empty when the database hides it', () => {
    const sheet = mapReview({ id: REVIEW, status: 'awaiting_md', mdVisible: false, mdPros: null, ratings: [{ sort: 0, metric: 'Teamwork', selfScore: 4, mdScore: null }] });
    expect(sheet.mdVisible).toBe(false);
    expect(sheet.mdPros).toEqual([]);
    expect(sheet.ratings[0]).toMatchObject({ metric: 'Teamwork', selfScore: 4, mdScore: null });
  });
});
