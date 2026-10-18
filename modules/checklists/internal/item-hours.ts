/**
 * Hours by checklist item for an employee report (sheet-parity gap 5). Item
 * time is ordinary task logs tagged with a checklist item (migration 34), so
 * these hours are a breakdown of the employee's task hours, not extra hours.
 */

export interface ItemHourLog {
  readonly taskId: string;
  readonly taskTag: string;
  readonly taskTitle: string;
  readonly nodeId: string;
  readonly nodeTitle: string;
  readonly hours: number;
}

export interface ItemHourRow {
  readonly nodeId: string;
  readonly title: string;
  readonly hours: number;
  readonly entries: number;
}

export interface ItemHourTask {
  readonly taskId: string;
  readonly taskTag: string;
  readonly taskTitle: string;
  readonly hours: number;
  readonly items: readonly ItemHourRow[];
}

/** Groups tagged logs by task, then item; largest totals first, ties by name. */
export function groupItemHours(logs: readonly ItemHourLog[]): ItemHourTask[] {
  const tasks = new Map<string, { taskTag: string; taskTitle: string; items: Map<string, { title: string; hours: number; entries: number }> }>();
  for (const log of logs) {
    if (!Number.isFinite(log.hours)) continue;
    const task = tasks.get(log.taskId) ?? { taskTag: log.taskTag, taskTitle: log.taskTitle, items: new Map() };
    const item = task.items.get(log.nodeId) ?? { title: log.nodeTitle, hours: 0, entries: 0 };
    item.hours += log.hours;
    item.entries += 1;
    task.items.set(log.nodeId, item);
    tasks.set(log.taskId, task);
  }
  return [...tasks.entries()]
    .map(([taskId, t]) => {
      const items = [...t.items.entries()]
        .map(([nodeId, i]) => ({ nodeId, title: i.title, hours: i.hours, entries: i.entries }))
        .sort((a, b) => b.hours - a.hours || a.title.localeCompare(b.title));
      return { taskId, taskTag: t.taskTag, taskTitle: t.taskTitle, hours: items.reduce((s, i) => s + i.hours, 0), items };
    })
    .sort((a, b) => b.hours - a.hours || a.taskTag.localeCompare(b.taskTag));
}
