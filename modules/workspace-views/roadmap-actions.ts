'use server';

import { getAssignedMissionBatch, getAssignedRoadmapMission } from '@/modules/tasks';
import type { MissionBatchOptions, RoadmapMission, RoadmapMissionBatch } from '@/modules/tasks/client';
import { getFocusedChecklistItemTime, getChecklistBranch } from '@/modules/checklists';
import type { ChecklistBranch, ChecklistBranchOptions, ChecklistItemTime } from '@/modules/checklists/client';
import { getCurrentProfile } from '@/shared/session/profile';
import { UUID_PATTERN } from '@/shared/forms/form-data';
import { TASK_MANAGER_ROLES } from '@/shared/tracker/enums';
import type { ActionResponse } from '@/types/tracker';

function isManager(role: string): boolean {
  return (TASK_MANAGER_ROLES as readonly string[]).includes(role);
}

export async function loadRoadmapMissions(options: MissionBatchOptions): Promise<ActionResponse<RoadmapMissionBatch>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Sign in to load your missions.' };
  // Whole team only for the managing director and project engineers; everyone also sees what they review or observe.
  const team = options.scope === 'team' && isManager(profile.role);
  try { return { success: true, data: await getAssignedMissionBatch(profile.id, { ...options, scope: team ? 'team' : 'mine', watching: true }) }; }
  catch { return { success: false, error: 'Your missions could not be loaded. Retry this batch.' }; }
}

export async function loadRoadmapBranch(taskId: string, options: ChecklistBranchOptions = {}): Promise<ActionResponse<{ mission: RoadmapMission; branch: ChecklistBranch | null }>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Sign in to open your mission.' };
  if (!UUID_PATTERN.test(taskId) || (options.checklistId && !UUID_PATTERN.test(options.checklistId))
    || (options.parentNodeId && !UUID_PATTERN.test(options.parentNodeId))) return { success: false, error: 'This checklist address is invalid. Open the mission again.' };
  try {
    const mission = await getAssignedRoadmapMission(taskId, profile.id, { anyOpen: isManager(profile.role) });
    if (!mission) return { success: false, error: 'This open mission is no longer assigned to you. Refresh your roadmap.' };
    const branch = await getChecklistBranch(taskId, options);
    return { success: true, data: { mission, branch } };
  } catch { return { success: false, error: 'The checklist could not be loaded. Retry this branch.' }; }
}

export async function loadRoadmapItemTime(taskId: string, nodeId: string): Promise<ActionResponse<ChecklistItemTime>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive || !UUID_PATTERN.test(taskId) || !UUID_PATTERN.test(nodeId)) return { success: false, error: 'Sign in and open this item again.' };
  try {
    if (!await getAssignedRoadmapMission(taskId, profile.id, { anyOpen: isManager(profile.role) })) return { success: false, error: 'This open mission is no longer assigned to you.' };
    return { success: true, data: await getFocusedChecklistItemTime(taskId, nodeId, profile.id) };
  } catch { return { success: false, error: 'Item time could not be loaded. Retry this item.' }; }
}
