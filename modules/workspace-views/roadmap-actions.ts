'use server';

import { getAssignedMissionBatch, getAssignedRoadmapMission } from '@/modules/tasks';
import type { MissionBatchOptions, RoadmapMission, RoadmapMissionBatch } from '@/modules/tasks/client';
import { getFocusedChecklistItemTime, getChecklistBranch } from '@/modules/checklists';
import type { ChecklistBranch, ChecklistBranchOptions, ChecklistItemTime } from '@/modules/checklists/client';
import { getLabelCatalogue, getLabelled, getLabelsFor, labelSlug, type CatalogueLabel, type Label } from '@/modules/labels';
import type { HashtagRecords } from '@/modules/workspace-views/internal/graph-hashtags';
import { getCurrentProfile } from '@/shared/session/profile';
import { UUID_PATTERN } from '@/shared/forms/form-data';
import type { ActionResponse } from '@/types/tracker';

/**
 * The whole team's missions and anyone's checklist branch: the managing director
 * only. Project engineers read a checklist only when they are on the mission
 * (4 November 2026, migration 117), so they browse their own missions.
 */
function seesEveryMission(role: string): boolean {
  return role === 'managing_director';
}

/** A batch of Today missions with their labels (migration 112): one labels_for read per batch; null when it failed. */
export type RoadmapMissionBatchWithLabels = RoadmapMissionBatch & { labels?: Record<string, Label[]> | null };

export async function loadRoadmapMissions(options: MissionBatchOptions): Promise<ActionResponse<RoadmapMissionBatchWithLabels>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Sign in to load your missions.' };
  // Whole team only for the managing director; everyone also sees what they review or observe.
  const team = options.scope === 'team' && seesEveryMission(profile.role);
  try {
    const batch = await getAssignedMissionBatch(profile.id, { ...options, scope: team ? 'team' : 'mine', watching: true });
    const labels = await getLabelsFor('task', batch.missions.map((mission) => mission.id)).catch(() => null);
    return { success: true, data: { ...batch, labels } };
  }
  catch { return { success: false, error: 'Your missions could not be loaded. Retry this batch.' }; }
}

export async function loadRoadmapBranch(taskId: string, options: ChecklistBranchOptions = {}): Promise<ActionResponse<{ mission: RoadmapMission; branch: ChecklistBranch | null }>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Sign in to open your mission.' };
  if (!UUID_PATTERN.test(taskId) || (options.checklistId && !UUID_PATTERN.test(options.checklistId))
    || (options.parentNodeId && !UUID_PATTERN.test(options.parentNodeId))) return { success: false, error: 'This checklist address is invalid. Open the mission again.' };
  try {
    const mission = await getAssignedRoadmapMission(taskId, profile.id, { anyOpen: seesEveryMission(profile.role) });
    if (!mission) return { success: false, error: 'This open mission is no longer assigned to you. Refresh your roadmap.' };
    const branch = await getChecklistBranch(taskId, options);
    return { success: true, data: { mission, branch } };
  } catch { return { success: false, error: 'The checklist could not be loaded. Retry this branch.' }; }
}

export async function loadRoadmapItemTime(taskId: string, nodeId: string): Promise<ActionResponse<ChecklistItemTime>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive || !UUID_PATTERN.test(taskId) || !UUID_PATTERN.test(nodeId)) return { success: false, error: 'Sign in and open this item again.' };
  try {
    if (!await getAssignedRoadmapMission(taskId, profile.id, { anyOpen: seesEveryMission(profile.role) })) return { success: false, error: 'This open mission is no longer assigned to you.' };
    return { success: true, data: await getFocusedChecklistItemTime(taskId, nodeId, profile.id) };
  } catch { return { success: false, error: 'Item time could not be loaded. Retry this item.' }; }
}

/** The company's active labels for the Today map's hashtag picker (label_catalogue), read only when the picker opens. */
export async function loadGraphHashtags(): Promise<ActionResponse<CatalogueLabel[]>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Sign in to choose a hashtag.' };
  const catalogue = await getLabelCatalogue().catch(() => null);
  if (!catalogue) return { success: false, error: 'Hashtags could not be loaded. Retry.' };
  const labels = catalogue.labels.filter((label) => !label.archived)
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
  return { success: true, data: labels };
}

/**
 * The missions and learning notes carrying one label (labelled(slug): only records the viewer may read,
 * at most 500), reduced to ids and mission tags for the map's highlight.
 */
export async function loadGraphHashtag(slug: string): Promise<ActionResponse<HashtagRecords>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Sign in to choose a hashtag.' };
  if (typeof slug !== 'string' || !slug || labelSlug(slug) !== slug) return { success: false, error: 'Choose a hashtag from the list.' };
  const records = await getLabelled(slug).catch(() => null);
  if (!records) return { success: false, error: 'This hashtag could not be read. Retry.' };
  const taskIds = records.items.filter((item) => item.kind === 'task').map((item) => item.id);
  const learningTaskTags = [...new Set(records.items.flatMap((item) => item.kind === 'mission_learning' && item.taskTag ? [item.taskTag] : []))];
  return { success: true, data: { taskIds, learningTaskTags } };
}
