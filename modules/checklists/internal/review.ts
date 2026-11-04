// Objective review (migration 114, plan section 6, user decisions 3 November 2026).
// Pure rules shared by the chip, the review sheet and the mission page; PostgreSQL
// (`checklist_command('review')`, `assert_checklist_done`) enforces the same rules.
import type { TaskReviewerRole, UserRole } from '@/types/tracker';
import type { CompletionState } from './progress';

export const REVIEW_STATES = ['none', 'pending', 'acknowledged', 'work_needed'] as const;
export type ObjectiveReviewState = (typeof REVIEW_STATES)[number];
export const REVIEW_DECISIONS = ['acknowledged', 'work_needed'] as const;
export type ObjectiveReviewDecision = (typeof REVIEW_DECISIONS)[number];
/** The longest note a decision keeps (the database's limit). */
export const REVIEW_NOTE_MAX = 1000;

/** One objective's review, as `checklist_reviews` returns it. */
export interface ObjectiveReview {
  nodeId: string;
  checklistId: string;
  /** Set when the objective is inside a Quest: the Quest's own checklist is `checklistId`. */
  parentNodeId: string | null;
  section: 'setup' | 'activity' | 'closure' | null;
  title: string;
  state: ObjectiveReviewState;
  completedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  note: string | null;
  /**
   * The rows above a sent-back objective, nearest first, across Quest lists
   * (filled by the server read for Work-needed objectives), so a parent row, a
   * Quest and the section holding it can say "Changes needed".
   */
  trail?: readonly ReviewTrailStep[];
}

/** One row above an objective: where it sits. */
export interface ReviewTrailStep {
  nodeId: string;
  checklistId: string;
  section: 'setup' | 'activity' | 'closure' | null;
}

/** What the viewer may do about a mission's objectives, and the reviews that are not 'none'. */
export interface ObjectiveReviews {
  /** Managing director, project engineer, or a Primary / Secondary reviewer of this mission. */
  canDecide: boolean;
  viewerId: string | null;
  reviews: ObjectiveReview[];
}

export const NO_REVIEWS: ObjectiveReviews = { canDecide: false, viewerId: null, reviews: [] };

const MANAGERS: readonly UserRole[] = ['managing_director', 'project_engineer'];

/** Who may acknowledge or ask for work: managers and the mission's Primary or Secondary reviewers, never Observers. */
export function mayReviewObjectives(role: UserRole | null | undefined, reviewerRole: TaskReviewerRole | null | undefined): boolean {
  if (role && MANAGERS.includes(role)) return true;
  return reviewerRole === 'Primary' || reviewerRole === 'Secondary';
}

/**
 * The review state a tick leaves (the database trigger's rule): Yes waits for a
 * review when the mission has a Primary or Secondary reviewer; any other tick,
 * or no such reviewer, clears it.
 */
export function reviewStateAfterTick(state: CompletionState, hasDecidingReviewer: boolean, linked = false): ObjectiveReviewState {
  return state === 'Yes' && hasDecidingReviewer && !linked ? 'pending' : 'none';
}

/** Can this viewer decide this objective now? Only pending rows, never their own tick (D-D1). */
export function canDecideObjective(review: Pick<ObjectiveReview, 'state' | 'completedBy'> | null | undefined, viewer: Pick<ObjectiveReviews, 'canDecide' | 'viewerId'>): boolean {
  if (!review || review.state !== 'pending' || !viewer.canDecide || !viewer.viewerId) return false;
  return review.completedBy !== viewer.viewerId;
}

/** Why a decision cannot be sent, or null when it can. Work needed needs a note. */
export function reviewDecisionError(decision: string, note: string | null | undefined): string | null {
  if (!(REVIEW_DECISIONS as readonly string[]).includes(decision)) return 'Choose Acknowledge or Work needed.';
  const text = (note ?? '').trim();
  if (text.length > REVIEW_NOTE_MAX) return `Keep the note under ${REVIEW_NOTE_MAX} characters.`;
  if (decision === 'work_needed' && !text) return 'Say what work is needed.';
  return null;
}

export type ReviewChipTone = 'attention' | 'success' | 'danger';
export interface ReviewChip {
  label: string;
  tone: ReviewChipTone;
  /** Longer text for the tooltip and screen readers. */
  description: string;
}

/** The chip beside an objective's tick, or null when there is nothing to show. */
export function reviewChip(review: Pick<ObjectiveReview, 'state' | 'note'> | null | undefined, reviewerName?: string | null): ReviewChip | null {
  if (!review) return null;
  const by = reviewerName ? ` by ${reviewerName}` : '';
  switch (review.state) {
    case 'pending':
      return { label: 'Pending', tone: 'attention', description: 'Waiting for a reviewer to acknowledge this objective.' };
    case 'acknowledged':
      return { label: 'Acknowledged', tone: 'success', description: `Acknowledged${by}.${review.note ? ` ${review.note}` : ''}` };
    case 'work_needed':
      // Sent back (user report, 4 November 2026): said as what the objective needs now.
      return { label: 'Changes needed', tone: 'danger', description: `Changes needed${by}: ${review.note ?? ''}`.trim() };
    default:
      return null;
  }
}

/** Objectives that hold up Done (D-D2): pending or Work needed. */
export function blockingReviews(reviews: readonly Pick<ObjectiveReview, 'state'>[]): { pending: number; workNeeded: number } {
  let pending = 0;
  let workNeeded = 0;
  for (const review of reviews) {
    if (review.state === 'pending') pending += 1;
    else if (review.state === 'work_needed') workNeeded += 1;
  }
  return { pending, workNeeded };
}

/** Pending objectives this viewer can decide, for "Your review is requested". */
export function reviewsAwaiting(data: ObjectiveReviews): ObjectiveReview[] {
  return data.reviews.filter((review) => canDecideObjective(review, data));
}

/** Parses the `checklist_reviews` payload, dropping anything malformed. */
export function parseObjectiveReviews(value: unknown): ObjectiveReviews {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return NO_REVIEWS;
  const raw = value as Record<string, unknown>;
  const rows = Array.isArray(raw.reviews) ? raw.reviews : [];
  const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const reviews: ObjectiveReview[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const state = r.state as ObjectiveReviewState;
    if (typeof r.nodeId !== 'string' || typeof r.checklistId !== 'string' || !REVIEW_STATES.includes(state)) continue;
    const section = r.section === 'setup' || r.section === 'activity' || r.section === 'closure' ? r.section : null;
    reviews.push({
      nodeId: r.nodeId,
      checklistId: r.checklistId,
      parentNodeId: text(r.parentNodeId),
      section,
      title: typeof r.title === 'string' ? r.title : '',
      state,
      completedBy: text(r.completedBy),
      reviewedBy: text(r.reviewedBy),
      reviewedAt: text(r.reviewedAt),
      note: text(r.note),
      ...(Array.isArray(r.trail) ? { trail: parseTrail(r.trail) } : {}),
    });
  }
  return { canDecide: raw.canDecide === true, viewerId: text(raw.viewerId), reviews };
}

/** Reviews keyed by objective, for the checklist views. */
export function reviewsByNode(data: ObjectiveReviews): ReadonlyMap<string, ObjectiveReview> {
  return new Map(data.reviews.map((review) => [review.nodeId, review]));
}

function parseTrail(value: unknown[]): ReviewTrailStep[] {
  const steps: ReviewTrailStep[] = [];
  for (const step of value) {
    if (!step || typeof step !== 'object') continue;
    const s = step as Record<string, unknown>;
    if (typeof s.nodeId !== 'string' || typeof s.checklistId !== 'string') continue;
    const section = s.section === 'setup' || s.section === 'activity' || s.section === 'closure' ? s.section : null;
    steps.push({ nodeId: s.nodeId, checklistId: s.checklistId, section });
  }
  return steps;
}

/** Where sent-back (Work needed) objectives sit: the rows holding them and each list section. */
export interface SentBackIndex {
  /** Sent-back objectives and every row above them (parent rows, Quest rows). */
  readonly nodes: ReadonlySet<string>;
  /** `${checklistId}:${section}` for each list section holding one, at any level. */
  readonly places: ReadonlySet<string>;
}

/** Builds the index the views use to say "Changes needed" on rows, Quests and section headers. */
export function sentBackIndex(data: Pick<ObjectiveReviews, 'reviews'>): SentBackIndex & {
  hasRow: (nodeId: string) => boolean;
  hasSection: (checklistId: string | null | undefined, section: string | null | undefined) => boolean;
} {
  const nodes = new Set<string>();
  const places = new Set<string>();
  for (const review of data.reviews) {
    if (review.state !== 'work_needed') continue;
    for (const step of [review, ...(review.trail ?? [])]) {
      nodes.add(step.nodeId);
      places.add(`${step.checklistId}:${step.section ?? 'activity'}`);
    }
  }
  return {
    nodes,
    places,
    hasRow: (nodeId) => nodes.has(nodeId),
    hasSection: (checklistId, section) => !!checklistId && places.has(`${checklistId}:${section ?? 'activity'}`),
  };
}
