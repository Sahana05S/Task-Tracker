import { MissionProgress } from '@/shared/ui/mission-ui';

/** Progress from the last milestone to the next one, in days. */
export function MilestoneMeter({ current, nextMilestone, daysToMilestone, reached }: {
  current: number; nextMilestone: number | null; daysToMilestone: number | null; reached: readonly number[];
}) {
  if (nextMilestone === null || daysToMilestone === null) {
    return <p className="text-streak-foreground text-sm font-semibold">Past every milestone. {current} days and counting.</p>;
  }
  const previous = reached.length ? reached[reached.length - 1] : 0;
  const span = nextMilestone - previous;
  const value = span > 0 ? ((current - previous) / span) * 100 : 0;
  return (
    <div className="grid gap-1.5">
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>{daysToMilestone === 1 ? '1 day' : `${daysToMilestone} days`} to the {nextMilestone}-day milestone</span>
        <span className="tabular-nums">{current}/{nextMilestone}</span>
      </div>
      <MissionProgress value={value} label={`Progress to the ${nextMilestone}-day milestone`} className="streak-meter" />
    </div>
  );
}
