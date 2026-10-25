'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { deleteReportSnapshotAction, saveReportSnapshotAction } from '@/modules/support/actions';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { kolkataDate } from '@/shared/time/kolkata';
import type { ReportSnapshot, User } from '@/types/tracker';

function monthBounds(): { start: string; end: string } {
  const today = kolkataDate();
  const [year, month] = today.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${today.slice(0, 8)}01`, end: `${today.slice(0, 8)}${String(last).padStart(2, '0')}` };
}

/**
 * Create or edit a saved report: labelled fields, the period defaulting to the
 * current month, a saving state and the form kept on a refused save.
 */
export function ReportForm({ members, report, folderUrl, summary }: {
  members: readonly User[];
  report?: ReportSnapshot;
  folderUrl?: string | null;
  summary?: string | null;
}) {
  const month = monthBounds();
  return (
    <ExecutionForm action={saveReportSnapshotAction} scope="report-snapshot" className="mt-3 grid gap-3">
      {report ? <input type="hidden" name="id" value={report.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field-label">Title<input name="title" defaultValue={report?.title ?? ''} className="field" placeholder="October 2026 team report" required /></label>
        <label className="field-label">Type<input name="reportType" defaultValue={report?.reportType ?? 'General Report'} className="field" required /></label>
        <label className="field-label">Status
          <select name="status" defaultValue={report?.status ?? 'Draft'} className="field">
            <option value="Draft">Draft</option>
            <option value="Final">Final</option>
          </select>
        </label>
        <label className="field-label">For
          <select name="employeeId" defaultValue={report?.employeeId ?? ''} className="field">
            <option value="">The whole team</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}
          </select>
        </label>
        <label className="field-label">From<input type="date" name="periodStart" defaultValue={report?.periodStart ?? month.start} className="field" /></label>
        <label className="field-label">To<input type="date" name="periodEnd" defaultValue={report?.periodEnd ?? month.end} className="field" /></label>
      </div>
      <label className="field-label">Folder or file link<input name="folderUrl" type="url" inputMode="url" defaultValue={folderUrl ?? ''} className="field" placeholder="https://…" /></label>
      <label className="field-label">Summary<textarea name="summary" defaultValue={summary ?? ''} className="field min-h-20" /></label>
      <Button type="submit" size="sm" className="justify-self-start">{report ? 'Save report' : 'Create report'}</Button>
    </ExecutionForm>
  );
}

/** Deletes a saved report after a confirmation; it cannot be undone. */
export function DeleteReportButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="destructive"
      disabled={pending}
      className="mt-2"
      onClick={() => {
        if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
        start(async () => {
          const form = new FormData();
          form.set('id', id);
          const result = await deleteReportSnapshotAction(form);
          if (result.success) {
            toast.success('Report deleted');
            router.refresh();
          } else toast.error(result.error ?? 'The report was not deleted.');
        });
      }}
    >
      {pending ? 'Deleting…' : 'Delete'}
    </Button>
  );
}
