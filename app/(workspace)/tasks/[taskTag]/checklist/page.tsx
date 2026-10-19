import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireProfile } from '@/shared/session/profile';
import { resolveTaskDetailRouteState } from '@/modules/tasks';
import { canManageTasks, canUpdateTaskOwnFields } from '@/modules/tasks/client';
import { getChecklistBranch, getFocusedChecklistItemTime } from '@/modules/checklists';
import { checklistWorkHref, parseChecklistLocation } from '@/modules/checklists/client';
import { ChecklistWorkspace } from '@/modules/checklists/components/checklist-workspace';
import { checklistCommand } from '@/modules/checklists/actions';
import { canStartTimerForTask } from '@/modules/time-tracking/client';
import { discardTaskTimer, startItemTimer, stopTaskTimer } from '@/modules/time-tracking/timer-actions';

export default async function ChecklistWorkPage({ params, searchParams }: {
  params: Promise<{ taskTag: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireProfile();
  const route = await resolveTaskDetailRouteState((await params).taskTag);
  if (route.status !== 'ready') notFound();
  const task = route.data.task;
  const location = parseChecklistLocation(await searchParams);
  let branch;
  try { branch = await getChecklistBranch(task.id, location); }
  catch {
    return <section className="mx-auto grid max-w-3xl gap-3 p-6"><h1 className="text-xl font-bold">Checklist unavailable</h1>
      <p role="alert">This checklist could not be loaded. Retry, or return to the mission. The test environment may need the checklist migrations.</p>
      <Link className="underline" href={checklistWorkHref(task.taskTag, location)}>Retry checklist</Link>
      <Link className="underline" href={`/tasks/${encodeURIComponent(task.taskTag)}`}>Back to mission</Link>
    </section>;
  }
  const selected = branch.rows.find(row => row.id === location.item);
  // A failed time read shows the retry note on the item instead of failing the whole page.
  const time = selected ? await getFocusedChecklistItemTime(task.id, selected.id, user.id)
    .catch(() => ({ available: false as const, secondsByNode: new Map(), runningByNode: new Map(), mine: null })) : undefined;
  return <ChecklistWorkspace task={task} branch={branch} location={location}
    manager={canManageTasks(user.role)} executor={canUpdateTaskOwnFields(user, task)} canTime={canStartTimerForTask(user, task)} time={time}
    actions={{ checklist: checklistCommand, start: startItemTimer, stop: stopTaskTimer, discard: discardTaskTimer }} />;
}
