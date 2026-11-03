import { describe, expect, it } from 'vitest';

import {
  blockingReviews,
  canDecideObjective,
  mayReviewObjectives,
  parseObjectiveReviews,
  reviewChip,
  reviewDecisionError,
  reviewStateAfterTick,
  reviewsAwaiting,
  type ObjectiveReview,
} from '@/modules/checklists/client';

const ME = '00000000-0000-0000-0000-000000000004';
const OTHER = '00000000-0000-0000-0000-000000000005';

function review(overrides: Partial<ObjectiveReview> = {}): ObjectiveReview {
  return {
    nodeId: '30000000-0000-0000-0000-000000000001', checklistId: '20000000-0000-0000-0000-000000000001',
    parentNodeId: null, section: 'activity', title: 'Survey', state: 'pending', completedBy: OTHER,
    reviewedBy: null, reviewedAt: null, note: null, ...overrides,
  };
}

describe('who may review objectives', () => {
  it('allows managers and Primary / Secondary reviewers, never Observers or plain members', () => {
    expect(mayReviewObjectives('managing_director', null)).toBe(true);
    expect(mayReviewObjectives('project_engineer', 'Observer')).toBe(true);
    expect(mayReviewObjectives('team_member', 'Primary')).toBe(true);
    expect(mayReviewObjectives('team_member', 'Secondary')).toBe(true);
    expect(mayReviewObjectives('team_member', 'Observer')).toBe(false);
    expect(mayReviewObjectives('data_manager', null)).toBe(false);
    expect(mayReviewObjectives(null, null)).toBe(false);
  });

  it('decides only pending objectives, and never the viewer\'s own tick (D-D1)', () => {
    const viewer = { canDecide: true, viewerId: ME };
    expect(canDecideObjective(review(), viewer)).toBe(true);
    expect(canDecideObjective(review({ completedBy: ME }), viewer)).toBe(false);
    expect(canDecideObjective(review({ state: 'acknowledged' }), viewer)).toBe(false);
    expect(canDecideObjective(review({ state: 'work_needed' }), viewer)).toBe(false);
    expect(canDecideObjective(review(), { canDecide: false, viewerId: ME })).toBe(false);
    expect(canDecideObjective(null, viewer)).toBe(false);
  });

  it('lists only what this viewer can decide for "Your review is requested"', () => {
    const data = { canDecide: true, viewerId: ME, reviews: [review(), review({ nodeId: 'b', completedBy: ME }), review({ nodeId: 'c', state: 'acknowledged' })] };
    expect(reviewsAwaiting(data).map((r) => r.nodeId)).toEqual([review().nodeId]);
  });
});

describe('ticks and decisions', () => {
  it('Yes waits for review only when the mission has a deciding reviewer; any other tick clears it', () => {
    expect(reviewStateAfterTick('Yes', true)).toBe('pending');
    expect(reviewStateAfterTick('Yes', false)).toBe('none');
    expect(reviewStateAfterTick('No', true)).toBe('none');
    expect(reviewStateAfterTick('N/A', true)).toBe('none');
    expect(reviewStateAfterTick('Yes', true, true)).toBe('none');
  });

  it('Work needed requires a note; Acknowledge does not', () => {
    expect(reviewDecisionError('acknowledged', '')).toBeNull();
    expect(reviewDecisionError('work_needed', '  ')).toBe('Say what work is needed.');
    expect(reviewDecisionError('work_needed', 'Redo the drawing')).toBeNull();
    expect(reviewDecisionError('approve', 'x')).toBe('Choose Acknowledge or Work needed.');
    expect(reviewDecisionError('acknowledged', 'x'.repeat(1001))).toMatch(/under 1000/);
  });

  it('pending and Work needed block Done (D-D2); Acknowledged does not', () => {
    expect(blockingReviews([review(), review({ state: 'work_needed' }), review({ state: 'acknowledged' }), review({ state: 'none' })]))
      .toEqual({ pending: 1, workNeeded: 1 });
  });
});

describe('review chip', () => {
  it('shows Pending, Acknowledged and Work needed with its note; nothing for none', () => {
    expect(reviewChip(review())).toMatchObject({ label: 'Pending', tone: 'attention' });
    expect(reviewChip(review({ state: 'acknowledged' }), 'Asha')).toMatchObject({ label: 'Acknowledged', tone: 'success', description: 'Acknowledged by Asha.' });
    expect(reviewChip(review({ state: 'work_needed', note: 'Add the site photo' }), 'Asha'))
      .toMatchObject({ label: 'Work needed', tone: 'danger', description: 'Work needed by Asha: Add the site photo' });
    expect(reviewChip(review({ state: 'none' }))).toBeNull();
    expect(reviewChip(undefined)).toBeNull();
  });
});

describe('parseObjectiveReviews', () => {
  it('keeps well-formed rows and drops the rest', () => {
    const parsed = parseObjectiveReviews({
      canDecide: true, viewerId: ME,
      reviews: [
        { nodeId: 'n1', checklistId: 'c1', parentNodeId: null, section: 'activity', title: 'A', state: 'pending', completedBy: OTHER },
        { nodeId: 'n2', checklistId: 'c1', state: 'approved' },
        null,
      ],
    });
    expect(parsed.canDecide).toBe(true);
    expect(parsed.reviews).toHaveLength(1);
    expect(parsed.reviews[0]).toMatchObject({ nodeId: 'n1', state: 'pending', note: null, reviewedBy: null });
    expect(parseObjectiveReviews(null)).toEqual({ canDecide: false, viewerId: null, reviews: [] });
  });
});
