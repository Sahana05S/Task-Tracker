/** One Quest of a mission and its logged time (`quest_time`, migration 123). Client-safe. */
export interface QuestTime {
  readonly nodeId: string;
  /** The Quest's own list (its home in the checklist). */
  readonly ownedChecklistId: string;
  /** The list the Quest row sits in. */
  readonly checklistId: string;
  /** The Quest it sits inside, or null at the mission's top level. */
  readonly parentQuestId: string | null;
  readonly title: string;
  /** The Quest's owner (migration 122). */
  readonly assigneeId: string | null;
  /** Logged on the Quest itself. */
  readonly ownSeconds: number;
  /** Logged on the Quest, everything inside it and its sub-Quests. */
  readonly totalSeconds: number;
}

/** Quests in reading order: each Quest followed by its sub-Quests, with their depth (0 = top level). */
export function questTree(quests: readonly QuestTime[]): { quest: QuestTime; depth: number }[] {
  const children = new Map<string | null, QuestTime[]>();
  const ids = new Set(quests.map((quest) => quest.nodeId));
  for (const quest of quests) {
    // A parent the reader cannot see (or a broken link) puts the Quest at the top level.
    const parent = quest.parentQuestId && ids.has(quest.parentQuestId) ? quest.parentQuestId : null;
    children.set(parent, [...(children.get(parent) ?? []), quest]);
  }
  const out: { quest: QuestTime; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const quest of children.get(parent) ?? []) {
      if (seen.has(quest.nodeId)) continue;
      seen.add(quest.nodeId);
      out.push({ quest, depth });
      walk(quest.nodeId, depth + 1);
    }
  };
  walk(null, 0);
  // Anything left over (a cycle in bad data) still appears once, at the top level.
  for (const quest of quests) if (!seen.has(quest.nodeId)) out.push({ quest, depth: 0 });
  return out;
}
