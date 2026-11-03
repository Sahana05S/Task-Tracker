import type { MissionRelationship } from '@/shared/tracker/enums';
import type { TaskPriority, TaskStatus } from '@/types/tracker';

export type MissionDueFilter = 'all' | 'today' | 'overdue';
export interface RoadmapMission {
  id: string;
  taskTag: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  progress: number | null;
  lifecycleVersion: number;
  /**
   * The member's strongest tie to the mission (migration 108). Optional so
   * older callers and fixtures keep compiling; the batch read always sets it.
   */
  relationship?: MissionRelationship;
}
export interface MissionBatchOptions {
  due?: MissionDueFilter;
  cursor?: string | null;
  limit?: number;
  /** Also return missions the member reviews or observes. Off by default: Today's controls assume assigned work. */
  watching?: boolean;
}
const RELATIONSHIP_STRENGTH: Record<MissionRelationship, number> = { owner: 0, assignee: 1, collaborator: 2, reviewer: 3, observer: 4 };
/** The stronger of two relationships (owner > assignee > collaborator > reviewer > observer). */
export function strongerRelationship(a: MissionRelationship | undefined, b: MissionRelationship): MissionRelationship {
  return a !== undefined && RELATIONSHIP_STRENGTH[a] <= RELATIONSHIP_STRENGTH[b] ? a : b;
}
export interface RoadmapMissionBatch {
  missions: RoadmapMission[];
  hasMore: boolean;
  nextCursor: string | null;
}
export const MISSION_BATCH_SIZE = 20;
export function missionDueFilter(value: unknown): MissionDueFilter {
  return value === 'today' || value === 'overdue' ? value : 'all';
}
export function missionBatchLimit(value?: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(50, Math.floor(value!))) : MISSION_BATCH_SIZE;
}
export function compareRoadmapMissions(a: Pick<RoadmapMission, 'dueDate' | 'taskTag' | 'id'>, b: Pick<RoadmapMission, 'dueDate' | 'taskTag' | 'id'>): number {
  const due = (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31');
  // UUID order agrees with PostgreSQL independently of tag locale/case.
  return due || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export function missionDueLabel(due: string | null, today: string): string {
  if (!due) return 'No deadline';
  if (due === today) return 'Due today';
  const label = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${due}T00:00:00Z`));
  return due < today ? `Overdue · ${label}` : `Due ${label}`;
}
