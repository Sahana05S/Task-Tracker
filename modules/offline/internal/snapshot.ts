import 'server-only';

import { getDayCheckIns } from '@/modules/attendance';
import { getChecklistBranch } from '@/modules/checklists';
import { getCompanySettings } from '@/modules/settings';
import { getAssignedMissionBatch } from '@/modules/tasks';
import { getRunningTimers } from '@/modules/time-tracking';
import { createClient } from '@/shared/supabase/server';
import type { User } from '@/types/tracker';

import { OFFLINE_SCHEMA_VERSION, OFFLINE_SECTIONS, SNAPSHOT_LIMITS, type OfflineMission, type OfflineRow, type OfflineSection, type OfflineSnapshot } from './rules';

interface Grant {
  grantId: string;
  issuedAt: string;
  serverNow: string;
  kolkataDate: string;
}

/** Migration 97: one grant per snapshot; every offline entry later names it. */
async function issueGrant(): Promise<Grant> {
  const db = await createClient();
  const { data, error } = await db.rpc('offline_grant_issue');
  const grant = data as Partial<Grant> | null;
  if (error || !grant || typeof grant.grantId !== 'string' || typeof grant.issuedAt !== 'string'
    || typeof grant.serverNow !== 'string' || typeof grant.kolkataDate !== 'string') {
    throw new Error('Offline use could not be prepared. Try again with a connection.');
  }
  return grant as Grant;
}

interface Budget {
  rows: number;
  reads: number;
}

/** Every row of one section, level by level, within the shared budget. */
async function readSection(taskId: string, section: OfflineSection, budget: Budget): Promise<{ rows: OfflineRow[]; version: number | null; partial: boolean }> {
  const rows: OfflineRow[] = [];
  let version: number | null = null;
  const parents: (string | null)[] = [null];
  while (parents.length) {
    const parent = parents.shift()!;
    let cursor: number | null = 0;
    while (cursor !== null) {
      if (budget.reads >= SNAPSHOT_LIMITS.branchReads || budget.rows >= SNAPSHOT_LIMITS.rows) return { rows, version, partial: true };
      budget.reads += 1;
      const branch = await getChecklistBranch(taskId, { section, parentNodeId: parent ?? undefined, cursor, limit: SNAPSHOT_LIMITS.pageSize });
      version ??= branch.taskVersion;
      for (const row of branch.rows) {
        rows.push({
          id: row.id,
          parentNodeId: parent,
          section,
          title: row.title,
          state: row.completionState ?? null,
          childCount: row.childCount,
          progress: row.progressPercentage,
          applicable: row.applicable,
          linkedTaskTag: row.linkedTaskTag ?? null,
        });
        budget.rows += 1;
        // A linked mission's rows belong to that mission; its own snapshot entry carries them.
        if (row.childCount > 0 && !row.linkedTaskId) parents.push(row.id);
      }
      cursor = branch.nextCursor;
    }
  }
  return { rows, version, partial: false };
}

async function readMission(mission: Awaited<ReturnType<typeof getAssignedMissionBatch>>['missions'][number], budget: Budget): Promise<OfflineMission> {
  const rows: OfflineRow[] = [];
  let version = mission.lifecycleVersion;
  let partial = false;
  for (const section of OFFLINE_SECTIONS) {
    try {
      const read = await readSection(mission.id, section, budget);
      rows.push(...read.rows);
      if (read.version !== null) version = read.version;
      partial ||= read.partial;
    } catch {
      partial = true;
    }
  }
  return {
    id: mission.id,
    taskTag: mission.taskTag,
    title: mission.title,
    status: mission.status,
    dueDate: mission.dueDate,
    progress: mission.progress,
    taskVersion: version,
    rows,
    checklistPartial: partial,
  };
}

/** The member's own offline copy: open missions with their checklists, timers and today's check-ins. */
export async function buildOfflineSnapshot(profile: User): Promise<OfflineSnapshot> {
  const grant = await issueGrant();
  const [batch, timers, checkIns, settings] = await Promise.all([
    getAssignedMissionBatch(profile.id, { limit: SNAPSHOT_LIMITS.missions }),
    getRunningTimers(profile.id),
    getDayCheckIns(profile.id, grant.kolkataDate),
    getCompanySettings(),
  ]);
  const budget: Budget = { rows: 0, reads: 0 };
  const missions: OfflineMission[] = [];
  // One mission at a time keeps the database load of a refresh small and the budget fair to the earliest due.
  for (const mission of batch.missions) missions.push(await readMission(mission, budget));
  const mark = (value: { capturedAt: string; time: string } | null) => (value ? { capturedAt: value.capturedAt, time: value.time } : null);
  return {
    schemaVersion: OFFLINE_SCHEMA_VERSION,
    userId: profile.id,
    fullName: profile.fullName,
    grantId: grant.grantId,
    issuedAt: grant.issuedAt,
    serverNow: grant.serverNow,
    kolkataDate: grant.kolkataDate,
    checkInEnabled: settings.attendance.checkInEnabled,
    checkIns: { in: mark(checkIns.in), out: mark(checkIns.out) },
    runningTimers: timers.map(timer => ({
      id: timer.id,
      taskId: timer.taskId,
      taskTag: timer.taskTag,
      taskTitle: timer.taskTitle,
      startedAt: timer.startedAt,
      executionVersion: timer.executionVersion,
    })),
    missions,
    missionsPartial: batch.hasMore,
  };
}
