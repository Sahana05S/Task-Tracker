import 'server-only';
import { createClient } from '@/shared/supabase/server';
import { parseObjectiveReviews, type ObjectiveReview, type ObjectiveReviews, type ReviewTrailStep } from './review';

type Db = Awaited<ReturnType<typeof createClient>>;
type Place = { parent: string | null; checklistId: string; section: ReviewTrailStep['section'] };

/** Quest levels (3) times rows nested in each, with room to spare; the walk stops at the root. */
const MAX_STEPS = 24;

/** The mission's objective reviews that are not 'none', and whether the viewer decides them (`checklist_reviews`, 114). */
export async function getObjectiveReviews(taskId: string): Promise<ObjectiveReviews> {
  const db = await createClient();
  const { data, error } = await db.rpc('checklist_reviews', { p_task: taskId });
  if (error) throw new Error(`Objective reviews unavailable: ${error.message}`);
  const parsed = parseObjectiveReviews(data);
  // The rows above each sent-back objective, so its parent rows, Quests and section say
  // "Changes needed". A failed read only leaves them saying In progress / Not started.
  const trails = await sentBackTrails(db, taskId, parsed.reviews).catch(() => null);
  if (!trails) return parsed;
  return { ...parsed, reviews: parsed.reviews.map((review) => (trails.has(review.nodeId) ? { ...review, trail: trails.get(review.nodeId) } : review)) };
}

/**
 * Walks up from each Work-needed objective: through parent rows, and from a
 * Quest's list to the Quest row that owns it, until the mission's checklist.
 * Reads only the rows on those paths, a level at a time (bounded).
 */
async function sentBackTrails(db: Db, taskId: string, reviews: readonly ObjectiveReview[]): Promise<Map<string, ReviewTrailStep[]> | null> {
  const sentBack = reviews.filter((review) => review.state === 'work_needed');
  if (!sentBack.length) return null;
  const lists = await db.from('task_checklists').select('id, owner_node_id').eq('task_id', taskId);
  if (lists.error) return null;
  const owner = new Map<string, string | null>((lists.data ?? []).map((list: { id: string; owner_node_id: string | null }) => [list.id, list.owner_node_id]));
  const places = new Map<string, Place>(sentBack.map((review) => [review.nodeId, { parent: review.parentNodeId, checklistId: review.checklistId, section: review.section }]));
  const above = (id: string): string | null => {
    const place = places.get(id);
    return place ? place.parent ?? owner.get(place.checklistId) ?? null : null;
  };

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const missing = new Set<string>();
    for (const review of sentBack) {
      const seen = new Set<string>();
      for (let id = above(review.nodeId); id && !seen.has(id); id = above(id)) {
        seen.add(id);
        if (!places.has(id)) { missing.add(id); break; }
      }
    }
    if (!missing.size) break;
    const read = await db.from('checklist_nodes').select('id, parent_node_id, checklist_id, detail_section').in('id', [...missing]);
    if (read.error || !read.data?.length) break;
    for (const row of read.data as { id: string; parent_node_id: string | null; checklist_id: string; detail_section: ReviewTrailStep['section'] }[]) {
      places.set(row.id, { parent: row.parent_node_id, checklistId: row.checklist_id, section: row.detail_section });
    }
  }

  const trails = new Map<string, ReviewTrailStep[]>();
  for (const review of sentBack) {
    const trail: ReviewTrailStep[] = [];
    const seen = new Set<string>();
    for (let id = above(review.nodeId); id && !seen.has(id) && places.has(id); id = above(id)) {
      seen.add(id);
      const place = places.get(id)!;
      trail.push({ nodeId: id, checklistId: place.checklistId, section: place.section });
    }
    trails.set(review.nodeId, trail);
  }
  return trails;
}
