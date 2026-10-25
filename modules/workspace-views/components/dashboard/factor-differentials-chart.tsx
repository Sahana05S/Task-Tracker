import { Exact, displayPerformance, type ExactInput } from '@/shared/math/exact';
import { cn } from '@/shared/utils';
import { ChartShell, EmptyNote } from '@/modules/workspace-views/components/dashboard/chart-shell';

interface FactorDifferentialMember {
  userId: string;
  fullName: string;
  /** Raw factor value minus the team median, from the shared engine. Null when not compared. */
  delta: ExactInput | null;
}

interface FactorDifferentialsChartProps {
  /** Card title, e.g. the factor's name. */
  title: string;
  /** Rows in the order they should be drawn; members without a delta are counted, not drawn. */
  members: readonly FactorDifferentialMember[];
  median: ExactInput | null;
  unit: string;
  /** Engine reason codes, shown when no member can be compared. */
  reasons?: readonly string[];
  subtitle?: string;
}

/**
 * One factor's differences with the team median: a diverging bar per member
 * around a zero line that stands for the median, above the median to the
 * right in green, below it to the left in rose. The signed value is printed on
 * every row (sign plus position, never colour alone), so phones and keyboards
 * read it without a hover. Values use the six-decimal factor display.
 *
 * With no comparable member the chart is replaced by the engine's reasons;
 * an unavailable factor never draws as zero.
 */
export function FactorDifferentialsChart({
  title,
  members,
  median,
  unit,
  subtitle,
}: FactorDifferentialsChartProps) {
  const rows = members.flatMap((member) =>
    member.delta === null ? [] : [{ ...member, value: Exact.from(member.delta).number(), text: signed(member.delta) }],
  );
  const max = Math.max(0, ...rows.map((row) => Math.abs(row.value)));
  const description = subtitle ?? `Difference from the team median · ${unit}`;

  // No reasons or codes on the page (decision 25 Oct 2026): an empty chart just says so.
  if (rows.length === 0) {
    return (
      <ChartShell title={title} subtitle={description}>
        <EmptyNote>No values to compare yet.</EmptyNote>
      </ChartShell>
    );
  }

  return (
    <ChartShell
      title={title}
      subtitle={description}
      footer={`Team median ${displayPerformance(median)}`}
    >
      <div className="soft-inset grid gap-2 p-3">
        {/* Phones put the bar under the name and value; wider screens use one line per member. */}
        <div aria-hidden="true" className={cn(ROW, 'text-muted-foreground text-[11px]')}>
          <span className="col-span-2 grid grid-cols-3 sm:col-span-1 sm:col-start-2">
            <span>Below</span>
            <span className="text-center">Median</span>
            <span className="text-right">Above</span>
          </span>
        </div>
        <ul aria-label={`${title}: difference from the team median per member`} className="grid gap-2.5 sm:gap-2">
          {rows.map((row) => {
            const width = max === 0 ? 0 : (Math.abs(row.value) / max) * 50;
            return (
              <li key={row.userId} className={cn(ROW, 'text-xs')}>
                <span className="text-foreground truncate font-medium" title={row.fullName}>{row.fullName}</span>
                <span aria-hidden="true" className="bg-muted relative col-span-2 row-start-2 h-2.5 rounded-full sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  <span className="bg-chart-reference/40 absolute inset-y-[-3px] left-1/2 w-px" />
                  <span
                    className={cn(
                      'absolute inset-y-0 rounded-full',
                      row.value >= 0 ? 'bg-chart-positive left-1/2' : 'bg-chart-negative right-1/2',
                    )}
                    style={{ width: `${width}%` }}
                  />
                </span>
                <span className="text-foreground tabular col-start-2 row-start-1 text-right sm:col-start-3">{row.text}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </ChartShell>
  );
}

const ROW = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,6.5rem)_1fr_5.5rem]';

/** Signed six-decimal text with a true minus; zero (the median itself) has no sign. */
function signed(value: ExactInput): string {
  const text = displayPerformance(value);
  if (text.startsWith('-')) return `−${text.slice(1)}`;
  return /[1-9]/.test(text) ? `+${text}` : text;
}
