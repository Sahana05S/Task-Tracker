import type { Metadata } from 'next';
import Link from 'next/link';
import { UsersIcon } from 'lucide-react';

import { DEFAULT_CONDUCT_BODY, DEFAULT_CONDUCT_TITLE, getCodeOfConduct, type ConductAcknowledgement } from '@/modules/hr';
import { ConductAcceptance, ConductEditor } from '@/modules/hr/components/conduct-controls';
import { ConductText } from '@/modules/hr/components/conduct-text';
import { Letterhead } from '@/modules/hr/components/letterhead';
import { PrintButton } from '@/modules/hr/components/print-button';
import { getCompanySettings } from '@/modules/settings';
import { requireProfile } from '@/shared/session/profile';
import { formatDate } from '@/shared/tracker/format';
import { Breadcrumb } from '@/shared/ui/page-nav';
import { EmptyState, MissionNotice, MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'Code of Conduct · HR' };

/**
 * The Code of Conduct on the company letterhead (M19). Every member reads and
 * accepts the current version; the managing director edits and publishes it
 * and sees who has accepted.
 */
export default async function CodeOfConductPage() {
  const profile = await requireProfile();
  const [conduct, settings] = await Promise.all([getCodeOfConduct(), getCompanySettings()]);
  const director = profile.role === 'managing_director';
  const current = conduct?.current ?? null;
  const title = current?.title ?? DEFAULT_CONDUCT_TITLE;
  const body = current?.body ?? DEFAULT_CONDUCT_BODY;

  return (
    <MissionPage>
      <MissionPageHeader
        breadcrumb={<Breadcrumb back={{ href: '/hr/documents', label: 'Back to documents' }} items={[{ label: 'HR', href: '/hr/documents' }, { label: 'Code of Conduct' }]} />}
        title="Code of Conduct"
        chip={current ? `Version ${current.version}` : director ? 'Draft' : undefined}
        description={current ? `Published ${formatDate(current.publishedAt.slice(0, 10))}` : 'How we work with each other, our customers and our partners'}
        actions={current || director ? <PrintButton /> : undefined}
      />
      {!conduct ? (
        <MissionNotice tone="danger">The Code of Conduct needs the latest database update (migration 80).</MissionNotice>
      ) : !current && !director ? (
        <EmptyState>The managing director has not published the Code of Conduct yet.</EmptyState>
      ) : (
        <>
          {current ? <ConductAcceptance version={current.version} acknowledgedAt={conduct.acknowledgedAt} /> : null}
          {director ? (
            <details className="no-print disclosure" open={!current}>
              <summary>{current ? 'Edit and publish a new version' : 'Review the draft and publish'}</summary>
              <div className="mt-3">
                <ConductEditor version={current?.version ?? 0} title={title} body={body} />
              </div>
            </details>
          ) : null}
          {director && conduct.acknowledgements ? <Acceptances rows={conduct.acknowledgements} /> : null}
          {!current ? <MissionNotice className="no-print">Preview of the draft. It is shared with the team only once you publish it.</MissionNotice> : null}
          <Letterhead branding={settings.branding} letterhead={settings.letterhead} footer={current ? `${title} · version ${current.version}` : 'Draft'}>
            <ConductText title={title} body={body} />
            <div className="paper-avoid-break mt-10 grid grid-cols-2 gap-8 text-[9.5pt]">
              <p className="paper-rule border-t pt-1">Employee name and signature</p>
              <p className="paper-rule border-t pt-1">Date</p>
            </div>
          </Letterhead>
        </>
      )}
      {director && !settings.letterhead.address ? (
        <p className="no-print text-muted-foreground text-xs">
          The letterhead has no address yet. <Link href="/settings?tab=company#letterhead" className="text-primary hover:underline">Add it in Settings</Link>.
        </p>
      ) : null}
    </MissionPage>
  );
}

function Acceptances({ rows }: { rows: readonly ConductAcknowledgement[] }) {
  const accepted = rows.filter(row => row.acknowledgedAt).length;
  return (
    <MissionPanel icon={UsersIcon} title={`Accepted by ${accepted} of ${rows.length}`} className="no-print">
      <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {rows.map(row => (
          <li key={row.userId} className="flex items-baseline justify-between gap-3">
            <Link href={`/team/${encodeURIComponent(row.employeeId)}`} className="text-foreground min-w-0 truncate hover:underline">{row.fullName}</Link>
            <span className={row.acknowledgedAt ? 'text-success-strong text-xs' : 'text-muted-foreground text-xs'}>
              {row.acknowledgedAt ? `Accepted ${formatDate(row.acknowledgedAt.slice(0, 10))}` : 'Not yet'}
            </span>
          </li>
        ))}
      </ul>
    </MissionPanel>
  );
}
