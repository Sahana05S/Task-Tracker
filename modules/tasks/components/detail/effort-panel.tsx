import { GaugeIcon } from 'lucide-react';

import { MissionPanel } from '@/components/missions/mission-ui';
import { CompactMetric } from '@/modules/tasks/components/detail/detail-tiles';
import { ELIGIBILITY_LABELS } from '@/modules/tasks/internal/contract';
import type { TaskDetailData } from '@/modules/tasks/internal/detail';
import { formatHours, formatNumeric, formatPercent } from '@/shared/tracker/format';

/** Scale, progress, hours and productivity inputs, with eligibility and share notes. */
export function EffortPanel({
  data,
  todayHours,
  memberNames,
}: {
  data: TaskDetailData;
  /** Hours worked today, or null when the breakdown is unavailable. */
  todayHours: number | null;
  memberNames: ReadonlyMap<string, string>;
}) {
  const task = data.task;
  return (
    <MissionPanel icon={GaugeIcon} title="Effort & scoring inputs">
      <dl className="grid gap-2.5">
        <CompactMetric label="Scale" value={formatNumeric(task.taskScale)} />
        <CompactMetric label="Progress" value={formatPercent(task.progressPercentage)} />
        <CompactMetric label="Scaled progress" value={formatNumeric(task.scaledProgress)} />
        <CompactMetric label="Activity checklist progress" value={formatPercent(data.checklistProgressPercentage)} />
        <CompactMetric label="Total hours" value={formatHours(data.effort.hoursLogged)} />
        <CompactMetric label="Hours worked today" value={todayHours !== null ? formatHours(todayHours) : 'Unavailable'} />
        <CompactMetric label="Task productivity" value={formatNumeric(task.taskProductivity)} />
        <CompactMetric label="Log entries" value={String(data.effort.logCount)} />
        <CompactMetric label="Metrics eligible" value={task.validForMetrics ? 'Yes' : 'No'} />
      </dl>
      <div className="border-border text-muted-foreground mt-4 grid gap-2 border-t pt-3 text-xs">
        <p>Metric eligibility: {task.validForMetrics ? "Eligible" : (task.eligibilityReasons ?? []).map(reason=>ELIGIBILITY_LABELS[reason] ?? reason).join(", ")}. Hours are required separately for productivity.</p>
        <p>Participant shares: {task.participantShares ? Object.entries(task.participantShares).map(([id,units])=>`${memberNames.get(id) ?? id}: ${units/10000}%`).join(", ") : "Legacy attribution awaiting reconciliation"}. Completion, criticality and freshness attribution remain undecided for shared work.</p>
      </div>
    </MissionPanel>
  );
}
