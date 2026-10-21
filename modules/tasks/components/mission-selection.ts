/**
 * Row selection on the Missions table. Pure so the pruning rule is testable:
 * a row hidden by a filter leaves the selection for good (DECISIONS "Bulk
 * actions on the Missions table"), so a later batch can never act on a mission
 * the user can no longer see.
 */

export type Selection = ReadonlySet<string>;

export const EMPTY_SELECTION: Selection = new Set<string>();

/** Keeps only selected ids that are still visible. Returns the same set when nothing changed. */
export function pruneSelection(selected: Selection, visibleIds: Iterable<string>): Selection {
  if (selected.size === 0) return selected;
  const visible = new Set(visibleIds);
  let changed = false;
  const next = new Set<string>();
  for (const id of selected) {
    if (visible.has(id)) next.add(id);
    else changed = true;
  }
  return changed ? next : selected;
}

export function toggleRow(selected: Selection, id: string): Selection {
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
}

export type HeaderCheckState = boolean | 'indeterminate';

/** Header checkbox state over the visible rows. */
export function headerState(selected: Selection, visibleIds: readonly string[]): HeaderCheckState {
  if (visibleIds.length === 0) return false;
  const count = visibleIds.filter((id) => selected.has(id)).length;
  if (count === 0) return false;
  return count === visibleIds.length ? true : 'indeterminate';
}

/** The header checkbox selects every visible row, or clears them when all are selected. */
export function toggleVisible(selected: Selection, visibleIds: readonly string[]): Selection {
  return headerState(selected, visibleIds) === true ? EMPTY_SELECTION : new Set(visibleIds);
}
