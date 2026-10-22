// PRIVATE. The template catalogue, in the order the policy dialog offers them.
import { activeDayStreak, allMissionsFresh, noOverdueAtPeriodEnd, validatedContributions } from './activity';
import { fullAttendance, hoursWithinAttendance, loggedEveryWorkingDay } from './attendance';
import { onTimeAllPeriod } from './on-time';
import type { PolicyTemplate } from './spec';

export const TEMPLATES: readonly PolicyTemplate[] = [
  onTimeAllPeriod,
  fullAttendance,
  loggedEveryWorkingDay,
  hoursWithinAttendance,
  activeDayStreak,
  validatedContributions,
  noOverdueAtPeriodEnd,
  allMissionsFresh,
];

const BY_KEY = new Map(TEMPLATES.map((t) => [t.key, t]));

export function templateFor(key: string): PolicyTemplate | undefined {
  return BY_KEY.get(key);
}

export type { ParameterSpec, PolicyTemplate, TemplateContext } from './spec';
