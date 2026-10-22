import type { Task, TaskFreshness, TaskPriority, TaskStatus } from '@/types/tracker';

export const PRIORITY_WEIGHTS: Record<TaskPriority, number> = { No: 0.25, Low: 0.5, Medium: 0.75, High: 1, Focus: 1.2 };
export const FRESHNESS_SCORES: Record<TaskFreshness, number> = { 'Super Fresh': 3, Fresh: 2, 'Almost Fresh': 1, 'Almost Stale': -1, Stale: -2, Rotten: -3 };
export function eligibilityReasons(task: Pick<Task, 'priority' | 'status' | 'taskScale' | 'progressPercentage'>): string[] {
  const reasons: string[] = [];
  if (task.priority === 'No') reasons.push('priority_no');
  if (task.status === 'Not Started') reasons.push('not_started');
  if (task.status === 'Discarded') reasons.push('discarded');
  if (task.progressPercentage === null || !Number.isFinite(task.progressPercentage)) reasons.push('progress_missing');
  else if (task.progressPercentage < 15) reasons.push('progress_below_15');
  if (task.taskScale === null || !Number.isFinite(task.taskScale)) reasons.push('scale_missing');
  else if (task.taskScale <= 0) reasons.push('scale_nonpositive');
  return reasons;
}
import { kolkataDate } from '@/shared/time/kolkata';
function calendarDay(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed / 86400000 : null;
}
export interface FreshnessResult { state: TaskFreshness | null; reason: string | null }
export function classifyFreshness(input: { assignedDate: string | null; dueDate: string | null; completedDate: string | null; status: TaskStatus }, asOf = kolkataDate()): FreshnessResult {
  const unavailable = (reason: string): FreshnessResult => ({ state: null, reason });
  if (input.status === 'Discarded') return unavailable('discarded_unavailable');
  const reference = calendarDay(input.completedDate ?? asOf), assigned = calendarDay(input.assignedDate), due = calendarDay(input.dueDate);
  if (reference === null || assigned === null || due === null) return unavailable('missing_or_invalid_dates');
  if (input.status === 'Done' && !input.completedDate) return unavailable('completion_date_missing');
  if (assigned > reference) return unavailable('future_assignment');
  if ((input.completedDate && reference > (calendarDay(asOf) ?? -Infinity))) return unavailable('inconsistent_dates');
  const age = reference - assigned, overdue = reference - due;
  const state: TaskFreshness = age <= 3 ? 'Super Fresh' : overdue <= 0 ? 'Fresh' : overdue <= 2 ? 'Almost Fresh' : overdue <= 4 ? 'Almost Stale' : overdue <= 7 ? 'Stale' : 'Rotten';
  return { state, reason: null };
}
export function scaleValue(mode: string, inputs: Record<string, number>, hours = 0, linkedScale: number | null = null, override: number | null = null): number {
  if (override !== null) return override;
  if (mode === 'manual') return inputs.value;
  if (mode === 'hours') return hours * 12.5 * inputs.multiplier;
  if (mode === 'activity_count') return inputs.activity_count * inputs.unit_scale;
  if (mode === 'linked' && linkedScale !== null) return linkedScale * inputs.percentage / 100;
  throw new Error('Scale input is unavailable.');
}
