import Link from 'next/link';

import type { TaskDependencyDetail } from '@/modules/tasks/internal/detail';

/** Missions this one blocks or depends on. */

export function DependencyList({
  dependencies,
  taskId,
}: {
  dependencies: readonly TaskDependencyDetail[];
  taskId: string;
}) {
  if (dependencies.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No dependency missions are linked yet.
      </p>
    );
  }

  return (
    <ul className="grid gap-2">
      {dependencies.map(({ dependency, otherTask }) => {
        const direction =
          dependency.predecessorTaskId === taskId ? 'Blocks' : 'Depends on';

        return (
          <li
            key={dependency.id}
            className="bg-muted/70 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-3.5 py-2.5 text-sm"
          >
            <span className="text-muted-foreground font-medium">{direction}</span>
            {otherTask ? (
              <Link
                href={`/tasks/${encodeURIComponent(otherTask.taskTag)}`}
                className="task-tag text-primary hover:underline"
              >
                {otherTask.taskTag}
              </Link>
            ) : (
              <span className="task-tag">Unknown mission</span>
            )}
            {otherTask ? <span className="text-foreground truncate">{otherTask.title}</span> : null}
            <span className="badge-soft badge-neutral">{dependency.relationType}</span>
            {dependency.notes ? (
              <span className="text-muted-foreground basis-full">{dependency.notes}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
