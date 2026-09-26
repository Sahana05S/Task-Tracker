import { MILESTONE_STATUS_ORDER } from '@/lib/tracker/enums';
import type { CompanyMilestone } from '@/types/tracker';

/**
 * Pure helpers for the milestone list. No React and no Supabase.
 */

export interface MilestoneSummary {
  total: number;
  achieved: number;
  inProgress: number;
  planned: number;
}

/** Tallies a milestone list by status. */
export function summariseMilestones(
  milestones: readonly CompanyMilestone[],
): MilestoneSummary {
  return {
    total: milestones.length,
    achieved: milestones.filter((entry) => entry.status === 'Achieved').length,
    inProgress: milestones.filter((entry) => entry.status === 'In Progress')
      .length,
    planned: milestones.filter((entry) => entry.status === 'Planned').length,
  };
}

/** Milestones not yet delivered, which is what the navigation badge counts. */
export function openMilestoneCount(
  milestones: readonly CompanyMilestone[],
): number {
  return milestones.filter((entry) => entry.status !== 'Achieved').length;
}

/**
 * Orders the checklist: in-flight work first, then planned, then achieved, and
 * within a status the nearest deadline first.
 *
 * Undated milestones sort after dated ones rather than to the top, since a
 * missing deadline is not the most urgent thing on the list. Ties fall back to
 * title so the order is stable across renders.
 */
export function sortMilestones(
  milestones: readonly CompanyMilestone[],
): CompanyMilestone[] {
  return [...milestones].sort((a, b) => {
    const byStatus =
      MILESTONE_STATUS_ORDER[a.status] - MILESTONE_STATUS_ORDER[b.status];
    if (byStatus !== 0) return byStatus;

    if (a.dueDate !== b.dueDate) {
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }

    return a.title.localeCompare(b.title);
  });
}

/**
 * Completion percentage for a countable milestone, or `null` when there is no
 * target to measure against.
 *
 * Clamped at 100: over-delivery is permitted by the schema, and a progress bar
 * that overflows its track reads as a rendering fault rather than as good news.
 */
export function milestoneCompletion(
  milestone: CompanyMilestone,
): number | null {
  if (milestone.targetCount === null || milestone.targetCount <= 0) return null;
  return Math.min(
    100,
    (milestone.deliveredCount / milestone.targetCount) * 100,
  );
}
