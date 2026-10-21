import { FileBarChartIcon } from 'lucide-react';

import { generateReportSnapshotAction } from '@/modules/reports/report-actions';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Input } from '@/shared/ui/input';
import { MissionPanel } from '@/shared/ui/mission-ui';
import { NativeSelect } from '@/shared/ui/native-select';
import type { AnalyticsPeriod } from '@/shared/time/period';
import type { User } from '@/types/tracker';

/**
 * Month close: save a computed report snapshot for the month, for the team or
 * one member (managing director only; the action and RLS enforce it). It was
 * on the Tools page before Tools became history only.
 */
export function ReportSnapshotForm({ period, members }: { period: AnalyticsPeriod; members: readonly User[] }) {
  return (
    <MissionPanel icon={FileBarChartIcon} title="Generate report snapshot" subtitle={`Saves ${period.label} as calculated now into the saved reports below.`}>
      <ExecutionForm action={generateReportSnapshotAction} scope={`report-snapshot:${period.startDate}`} className="grid gap-3">
        <input type="hidden" name="year" value={period.year} />
        <input type="hidden" name="month" value={period.month} />
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="field-label">
            Title
            <Input name="title" defaultValue={`${period.label} Task Report`} required />
          </label>
          <label className="field-label">
            Report type
            <Input name="reportType" defaultValue="Monthly Task Report" required />
          </label>
          <label className="field-label">
            For
            <NativeSelect name="employeeId" defaultValue="">
              <option value="">Whole team</option>
              {members.filter((m) => m.isActive).map((m) => <option key={m.id} value={m.id}>{m.fullName} · {m.employeeId}</option>)}
            </NativeSelect>
          </label>
        </div>
        <Button type="submit" className="justify-self-start">Generate snapshot</Button>
      </ExecutionForm>
    </MissionPanel>
  );
}
