import Link from 'next/link';

import { MissionProgress } from '@/shared/ui/mission-ui';
import { StatusBadge } from '@/shared/ui/tracker-badges';
import { formatPercent } from '@/shared/tracker/format';
import type { Task } from '@/types/tracker';

/**
 * A mission's sub-missions (migration 68): real missions linked as rows of its
 * checklist. Each one's progress feeds its row; the row completes when it is Done.
 */
export function SubMissionsPanel({ subMissions }: { subMissions: readonly Task[] }) {
  return (
    <ul className="grid gap-2.5">
      {subMissions.map((sub) => (
        <li key={sub.id} className="bg-muted/50 grid gap-1.5 rounded-xl px-3 py-2.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <Link href={`/tasks/${encodeURIComponent(sub.taskTag)}`} className="link min-w-0 truncate text-sm font-semibold">
              <span className="task-tag text-primary">{sub.taskTag}</span> · {sub.title}
            </Link>
            <StatusBadge status={sub.status} />
          </div>
          <div className="flex items-center gap-2">
            <MissionProgress value={sub.progressPercentage} label={`${sub.taskTag} progress`} className="h-1.5 flex-1" />
            <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">{formatPercent(sub.progressPercentage)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The parent mission and sub-missions of a mission, from its 'Subtask' dependencies. */
export function subMissionFamily(
  taskId: string,
  dependencies: readonly { dependency: { predecessorTaskId: string; successorTaskId: string; relationType: string }; otherTask: Task | null }[],
): { parent: Task | null; children: Task[] } {
  const subtasks = dependencies.filter((d) => d.dependency.relationType === 'Subtask' && d.otherTask);
  return {
    parent: subtasks.find((d) => d.dependency.successorTaskId === taskId)?.otherTask ?? null,
    children: subtasks.filter((d) => d.dependency.predecessorTaskId === taskId).map((d) => d.otherTask!),
  };
}
