'use client';

import * as React from 'react';

import {
  buildSetupPayload,
  carryoverAvailable,
  defaultStandingSelection,
  previousRows,
  singleOwner,
  standingKey,
  weeklyPhases,
  type PreviousAction,
} from '@/modules/tasks/internal/tools/month-setup';
import type { MonthSetupContext } from '@/modules/tasks/internal/tools/month-setup-commands';

/**
 * Selections for one month's setup. The wizard keys this by month, so picking
 * another month starts from that month's defaults. Every change goes through
 * an event handler that also drops a stale preview (`onChange`).
 */

export const STEPS = ['Month', 'Standing missions', 'Weekly phases', 'Last month', 'Preview'] as const;
export type StepIndex = 0 | 1 | 2 | 3 | 4;

export interface SetupSelection {
  standing: ReadonlySet<string>;
  phasesOwnerId: string | null;
  previous: ReadonlyMap<string, PreviousAction>;
  reason: string;
}

function initialSelection(context: MonthSetupContext): SetupSelection {
  const done = new Set(context.standing.flatMap((mission) => mission.setUp.map((member) => standingKey(mission.id, member))));
  const standing = defaultStandingSelection(context.standing, context.members, context.directorId);
  for (const key of done) standing.delete(key);
  // A mission whose single owner is already set up is not ticked again for the MD.
  for (const mission of context.standing) {
    if (mission.ownerMode === 'single' && mission.setUp.length > 0) {
      for (const member of context.members) standing.delete(standingKey(mission.id, member.id));
    }
  }
  return {
    standing,
    phasesOwnerId: context.phasesSetUp.length > 0 ? null : context.directorId,
    previous: new Map(previousRows(context.previous, context.standing).map(({ mission, defaultAction }) => [mission.id, defaultAction])),
    reason: '',
  };
}

export function useMonthSetup(context: MonthSetupContext, onChange: () => void) {
  const [selection, setSelection] = React.useState(() => initialSelection(context));
  const rows = React.useMemo(() => previousRows(context.previous, context.standing), [context]);
  const phases = React.useMemo(() => weeklyPhases(context.month), [context.month]);
  const carry = carryoverAvailable(context.month, context.today);

  const update = React.useCallback((change: (current: SetupSelection) => SetupSelection) => {
    setSelection(change);
    onChange();
  }, [onChange]);

  const toggleCell = React.useCallback((missionId: string, memberId: string) => update((current) => {
    const standing = new Set(current.standing);
    const key = standingKey(missionId, memberId);
    if (standing.has(key)) standing.delete(key);
    else standing.add(key);
    return { ...current, standing };
  }), [update]);

  /** Per-member rows: all members on or off. Single rows: one owner or none. */
  const setRow = React.useCallback((missionId: string, memberIds: readonly string[]) => update((current) => {
    const standing = new Set([...current.standing].filter((key) => !key.startsWith(`${missionId}:`)));
    for (const member of memberIds) standing.add(standingKey(missionId, member));
    return { ...current, standing };
  }), [update]);

  const setPhasesOwner = React.useCallback((ownerId: string | null) => update((current) => ({ ...current, phasesOwnerId: ownerId })), [update]);

  const setAction = React.useCallback((taskId: string, action: PreviousAction) => update((current) => {
    const previous = new Map(current.previous);
    previous.set(taskId, action);
    return { ...current, previous };
  }), [update]);

  const setReason = React.useCallback((reason: string) => update((current) => ({ ...current, reason })), [update]);

  let repeats = 0;
  let carries = 0;
  let waiting = 0;
  for (const action of selection.previous.values()) {
    if (action === 'repeat') repeats += 1;
    else if (action === 'carryover' && carry) carries += 1;
    else if (action === 'carryover') waiting += 1;
  }
  const phaseCount = selection.phasesOwnerId ? phases.length : 0;
  const total = selection.standing.size + phaseCount + repeats + carries;

  const payload = () => {
    const body = buildSetupPayload({ month: context.month, standing: selection.standing, phasesOwnerId: selection.phasesOwnerId, previous: selection.previous }, context.today);
    return selection.reason.trim() ? { ...body, reason: selection.reason.trim() } : body;
  };

  return {
    selection,
    rows,
    phases,
    carry,
    counts: { standing: selection.standing.size, phases: phaseCount, repeats, carries, waiting, total },
    toggleCell,
    setRow,
    setPhasesOwner,
    setAction,
    setReason,
    payload,
    ownerOf: (missionId: string) => {
      const mission = context.standing.find((item) => item.id === missionId);
      return mission ? singleOwner(mission, context.members, context.directorId) : null;
    },
  };
}

export type MonthSetupState = ReturnType<typeof useMonthSetup>;
