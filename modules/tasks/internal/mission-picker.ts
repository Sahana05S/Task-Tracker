/**
 * The mission picker's order (meetings, 7 November 2026): permanent missions first, then every
 * other mission with its sub-missions indented under it. Client-safe. PRIVATE; exported through client.ts.
 */

export interface MissionPickerOption {
  readonly id: string;
  readonly tag: string;
  readonly title: string;
  readonly status: string | null;
  /** The mission this one is a sub-mission of (a Subtask link), when there is one. */
  readonly parentId: string | null;
  /** A permanent mission (tasks.is_permanent, migration 135). */
  readonly isPermanent: boolean;
  /** The mission's business (tasks.business_id, migration 134). */
  readonly businessId: string | null;
}
export interface OrderedMissionOption extends MissionPickerOption { readonly depth: number }

const byTag = (a: MissionPickerOption, b: MissionPickerOption) => a.tag.localeCompare(b.tag, 'en', { numeric: true });

/**
 * Permanent missions (depth 0, by tag), then each other top-level mission followed by its
 * sub-missions (depth 1, 2, ...). A sub-mission whose parent is not in the list stands on its own;
 * a loop in the links is cut, so every option appears exactly once.
 */
export function orderMissionOptions(options: readonly MissionPickerOption[]): OrderedMissionOption[] {
  const ids = new Set(options.map((option) => option.id));
  const children = new Map<string, MissionPickerOption[]>();
  const roots: MissionPickerOption[] = [];
  for (const option of options) {
    if (!option.isPermanent && option.parentId && ids.has(option.parentId) && option.parentId !== option.id) {
      children.set(option.parentId, [...(children.get(option.parentId) ?? []), option]);
    } else roots.push(option);
  }
  const out: OrderedMissionOption[] = [];
  const seen = new Set<string>();
  const walk = (option: MissionPickerOption, depth: number) => {
    if (seen.has(option.id)) return;
    seen.add(option.id);
    out.push({ ...option, depth });
    for (const child of (children.get(option.id) ?? []).sort(byTag)) walk(child, depth + 1);
  };
  for (const option of roots.filter((o) => o.isPermanent).sort(byTag)) walk(option, 0);
  for (const option of roots.filter((o) => !o.isPermanent).sort(byTag)) walk(option, 0);
  // Options only reachable through a loop of sub-mission links.
  for (const option of [...options].sort(byTag)) walk(option, 0);
  return out;
}

/** Options whose tag or title holds every word of the search; a match keeps its parent chain for context. */
export function searchMissionOptions(ordered: readonly OrderedMissionOption[], search: string): OrderedMissionOption[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...ordered];
  const byId = new Map(ordered.map((option) => [option.id, option]));
  const keep = new Set<string>();
  for (const option of ordered) {
    const text = `${option.tag} ${option.title}`.toLowerCase();
    if (!words.every((word) => text.includes(word))) continue;
    let current: OrderedMissionOption | undefined = option;
    while (current && !keep.has(current.id)) {
      keep.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return ordered.filter((option) => keep.has(option.id));
}
