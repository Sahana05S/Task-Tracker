import Link from 'next/link';
import { IdCardIcon } from 'lucide-react';

import { readRecordsSummary } from '@/modules/personnel/internal/queries';
import { RECORD_KIND_LABELS, recordProgress } from '@/modules/personnel/internal/rules';
import { EmptyState, MissionPanel } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

/**
 * Manage people: who has uploaded their personal records (managing director
 * only; the read refuses anyone else). Hidden before migration 78.
 */
export async function RecordsOverview() {
  const rows = await readRecordsSummary();
  if (!rows) return null;
  const complete = rows.filter(row => recordProgress(row.kinds).complete).length;
  return (
    <MissionPanel title={`Personal records · ${complete} of ${rows.length} complete`} icon={IdCardIcon}>
      {rows.length === 0 ? (
        <EmptyState>No active members yet.</EmptyState>
      ) : (
        <div className="border-border overflow-x-auto rounded-xl border">
          <table className="sheet-grid min-w-[36rem]">
            <thead>
              <tr>
                <th>Member</th>
                <th className="text-right">Records</th>
                <th>Still needed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const progress = recordProgress(row.kinds);
                return (
                  <tr key={row.userId}>
                    <td className="text-xs">
                      <Link href={`/team/${encodeURIComponent(row.employeeId)}/personal`} className="text-primary font-semibold hover:underline">
                        {row.fullName}
                      </Link>
                      <span className="text-muted-foreground"> · {row.employeeId}</span>
                    </td>
                    <td className={cn('sheet-numeric text-xs font-semibold', progress.complete && 'text-success-strong')}>
                      {progress.done}/{progress.total}
                    </td>
                    <td className="text-muted-foreground text-xs">
                      {progress.complete ? 'All uploaded' : progress.missing.map(kind => RECORD_KIND_LABELS[kind]).join(', ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </MissionPanel>
  );
}
