'use client';
import { useEffect, useState } from 'react';
import { ChecklistItemWork } from '@/modules/checklists/components/checklist-item-work';
import { checklistCommand } from '@/modules/checklists/actions';
import { startItemTimer, stopTaskTimer, discardTaskTimer } from '@/modules/time-tracking/timer-actions';
import type { ChecklistBranchRow, ChecklistItemTime } from '@/modules/checklists/client';
import type { RoadmapMission } from '@/modules/tasks/client';
import { loadRoadmapItemTime } from '@/modules/workspace-views/roadmap-actions';

export function RoadmapItemWork({ mission, node, onCommitted, onOpen }: {
  mission: RoadmapMission; node: ChecklistBranchRow; onCommitted: () => void; onOpen: () => void;
}) {
  const [time, setTime] = useState<ChecklistItemTime>();
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setTime(undefined); setError(null);
    loadRoadmapItemTime(mission.id, node.id).then(result => {
      if (!current) return;
      if (result.success && result.data) setTime(result.data);
      else setError(result.error ?? 'Item time is unavailable. Retry.');
    }).catch(() => { if (current) setError('Item time is unavailable. Retry.'); });
    return () => { current = false; };
  }, [mission.id, node.id, retry]);
  return <>
    <ChecklistItemWork task={mission} node={node} time={time} actions={{ state: checklistCommand, start: startItemTimer, stop: stopTaskTimer, discard: discardTaskTimer }} onOpen={onOpen} onCommitted={onCommitted} />
    {error ? <p role="alert" className="text-danger mt-3 text-sm">{error} <button type="button" className="min-h-9 rounded px-2 underline focus-visible:outline-primary" onClick={() => setRetry(n => n + 1)}>Retry item time</button></p> : null}
  </>;
}
