'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FlagIcon, LoaderCircleIcon, RocketIcon } from 'lucide-react';
import { toast } from 'sonner';

import { missionPromptState, moveMissionFromPrompt } from '@/modules/tasks/actions';
import { Button } from '@/shared/ui/button';
import { MissionNotice } from '@/shared/ui/mission-ui';
import { onMissionProgress } from '@/shared/ui/mission-progress-event';
import type { TaskStatus } from '@/types/tracker';

/** Missions whose prompt was answered "Not now" in this tab. */
const snoozed = new Set<string>();
/** Missions known to be past Not Started, so no read is needed. */
const started = new Set<string>();

async function move(taskId: string, taskTag: string, from: TaskStatus, to: TaskStatus): Promise<boolean> {
  try {
    const result = await moveMissionFromPrompt(taskId, from, to, crypto.randomUUID());
    if (!result.success) {
      toast.error(`${taskTag} is still ${from}`, { description: result.error });
      return false;
    }
    started.add(taskId);
    toast.success(`${taskTag} is now ${to}`);
    return true;
  } catch {
    toast.error(`${taskTag} may not have changed`, { description: 'The connection was interrupted. Reload to check its status.' });
    return false;
  }
}

/**
 * Mounted once in the workspace shell. When work is recorded on a mission
 * that is still Not Started, offers to mark it In Progress straight away.
 */
export function MissionStartToaster() {
  const router = useRouter();
  React.useEffect(() => onMissionProgress(async ({ taskId }) => {
    if (started.has(taskId) || snoozed.has(taskId)) return;
    const state = await missionPromptState(taskId).catch(() => null);
    if (!state) return;
    if (state.status !== 'Not Started') { started.add(taskId); return; }
    toast(`${state.taskTag} hasn't started yet`, {
      id: `mission-start:${taskId}`,
      description: 'Work is being recorded on it. Mark it In progress?',
      duration: 10000,
      action: {
        label: 'Mark In progress',
        onClick: async () => { if (await move(taskId, state.taskTag, 'Not Started', 'In Progress')) router.refresh(); },
      },
      cancel: { label: 'Not now', onClick: () => snoozed.add(taskId) },
    });
  }), [router]);
  return null;
}

/**
 * The lasting version of the prompt on the mission and checklist pages:
 * "hasn't started yet" while Not Started with work recorded, and "ready to
 * finish" once every phase is complete.
 */
export function MissionStatusBanner({
  taskId,
  taskTag,
  status,
  hasWork,
  readyToFinish,
  canChange,
}: {
  taskId: string;
  taskTag: string;
  status: TaskStatus;
  /** Progress above zero or time logged. */
  hasWork: boolean;
  /** Setup, Activity and Closure are all complete. */
  readyToFinish: boolean;
  canChange: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const closed = status === 'Done' || status === 'Discarded';
  const notStarted = status === 'Not Started' && hasWork;
  const finish = !closed && !notStarted && readyToFinish;
  if (!canChange || (!notStarted && !finish)) return null;

  const to: TaskStatus = notStarted ? 'In Progress' : 'Done';
  const run = async () => {
    setPending(true);
    const moved = await move(taskId, taskTag, status, to);
    setPending(false);
    if (moved) router.refresh();
  };

  return (
    <MissionNotice tone={notStarted ? 'attention' : 'info'} icon={notStarted ? RocketIcon : FlagIcon} role="status">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p>
          {notStarted ? (
            <><span className="font-semibold">This mission hasn&apos;t started yet,</span> but work is already recorded on it.</>
          ) : (
            <><span className="font-semibold">Ready to finish?</span> Setup, Activity and Closure are all complete.</>
          )}
        </p>
        <Button size="sm" shape="pill" onClick={run} disabled={pending}>
          {pending ? <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden="true" /> : null}
          {notStarted ? 'Mark In progress' : 'Mark Done'}
        </Button>
      </div>
    </MissionNotice>
  );
}
