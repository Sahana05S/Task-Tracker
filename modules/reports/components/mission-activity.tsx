import Link from 'next/link';
import { HistoryIcon } from 'lucide-react';

import type { MissionChoice } from '@/modules/tasks';
import { TimerRecords } from '@/modules/time-tracking/components/timer-panels';
import type { TimerSessionActivity } from '@/modules/time-tracking/client';
import { Button } from '@/shared/ui/button';
import { EmptyState, MissionNotice, MissionPanel } from '@/shared/ui/mission-ui';
import { NativeSelect } from '@/shared/ui/native-select';
import type { TaskTimer } from '@/types/tracker';

export interface MissionActivityProps {
  choices: readonly MissionChoice[];
  selected: MissionChoice | null;
  /** The timer sessions the viewer may see on the selected mission, newest first. */
  timers: readonly TaskTimer[];
  memberNames: ReadonlyMap<string, string>;
  /** What each stopped session covered (migration 110); null when the database cannot say. */
  sessions: ReadonlyMap<string, TimerSessionActivity> | null;
  /** Managers see every session; members their own. */
  seesEveryone: boolean;
}

/** Hours from whole seconds, to two decimals ("3.75"). */
function hoursOf(seconds: number): string {
  return (Math.round((seconds / 3600) * 100) / 100).toFixed(2);
}

/**
 * Reports > Mission activity: one mission's timer sessions, who ran each, how
 * long, and what they changed while it ran (the same list as the mission's
 * History tab, without its Stop and Discard controls). Filters are a plain GET form.
 */
export function MissionActivityView({ choices, selected, timers, memberNames, sessions, seesEveryone }: MissionActivityProps) {
  const stopped = timers.filter((timer) => timer.status === 'Stopped');
  const seconds = stopped.reduce((sum, timer) => sum + timer.elapsedSeconds, 0);
  const people = new Set(stopped.map((timer) => timer.userId)).size;

  return (
    <div className="grid gap-5 lg:gap-6">
      <form method="get" action="/reports" className="soft-card flex flex-wrap items-end gap-3 p-4 sm:p-5" aria-label="Choose mission">
        <input type="hidden" name="tab" value="activity" />
        <label className="field-label min-w-64 flex-1">
          Mission
          <NativeSelect name="mission" defaultValue={selected?.taskTag ?? ''} required>
            <option value="" disabled>Choose a mission</option>
            {choices.map((choice) => <option key={choice.id} value={choice.taskTag}>{choice.taskTag} · {choice.title}</option>)}
          </NativeSelect>
        </label>
        <Button type="submit" variant="outline">Show activity</Button>
      </form>

      {!selected ? (
        <EmptyState icon={HistoryIcon} title="Choose a mission">
          See every timer session on it: who worked, for how long, and what they changed while the timer ran.
        </EmptyState>
      ) : (
        <MissionPanel
          icon={HistoryIcon}
          title={`${selected.taskTag} · ${selected.title}`}
          subtitle={`${stopped.length} ${stopped.length === 1 ? 'session' : 'sessions'} · ${hoursOf(seconds)} h${seesEveryone ? ` · ${people} ${people === 1 ? 'person' : 'people'}` : ' · your sessions only'}`}
        >
          <div className="grid gap-3">
            {sessions === null ? (
              <MissionNotice tone="attention" role="status">What each session changed is not available on this database yet; the times are.</MissionNotice>
            ) : null}
            <TimerRecords timers={timers} memberNames={memberNames} taskTag={selected.taskTag} canManage={false} currentUserId="" sessionActivity={sessions ?? undefined} />
            <Link href={`/tasks/${encodeURIComponent(selected.taskTag)}?tab=history`} className="link justify-self-start text-sm">Open the mission’s history</Link>
          </div>
        </MissionPanel>
      )}
    </div>
  );
}
