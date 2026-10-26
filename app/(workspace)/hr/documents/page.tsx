import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2Icon, ChevronRightIcon, CircleDashedIcon, FileTextIcon, ScrollTextIcon } from 'lucide-react';

import { getCodeOfConduct } from '@/modules/hr';
import { HrTabs } from '@/modules/hr/components/hr-tabs';
import { requireProfile } from '@/shared/session/profile';
import { formatDate } from '@/shared/tracker/format';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'HR documents' };

/** HR > Documents (M19): the company's branded templates. */
export default async function HrDocumentsPage() {
  const profile = await requireProfile();
  const conduct = await getCodeOfConduct();
  const director = profile.role === 'managing_director';
  const accepted = conduct?.acknowledgements?.filter(row => row.acknowledgedAt).length ?? 0;
  const conductStatus = !conduct
    ? 'Needs the latest database update (migration 80).'
    : !conduct.current
      ? director ? 'Not published yet: review the starting draft and publish it.' : 'Not published yet.'
      : director
        ? `Version ${conduct.current.version} · ${accepted} of ${conduct.acknowledgements?.length ?? 0} accepted`
        : conduct.acknowledgedAt
          ? `Version ${conduct.current.version} · you accepted it on ${formatDate(conduct.acknowledgedAt.slice(0, 10))}`
          : `Version ${conduct.current.version} · please read and accept it`;
  const done = Boolean(conduct?.current && (director || conduct.acknowledgedAt));

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="HR"
        title="Documents"
        description="Company templates on the branded letterhead. Open one and use Download PDF to save or print it."
        tabs={<HrTabs current="documents" />}
      />
      <ul className="grid gap-3 md:grid-cols-2">
        <DocumentCard
          href="/hr/documents/code-of-conduct"
          icon={ScrollTextIcon}
          title="Code of Conduct"
          detail={conductStatus}
          done={done}
        />
        <DocumentCard
          href="/hr/documents/letterhead"
          icon={FileTextIcon}
          title="Company letterhead"
          detail={director ? 'Blank letterhead. Set the address and contact lines in Settings > Company > Letterhead.' : 'Blank letterhead for official letters.'}
        />
      </ul>
    </MissionPage>
  );
}

function DocumentCard({ href, icon: Icon, title, detail, done }: {
  href: string; icon: typeof FileTextIcon; title: string; detail: string; done?: boolean;
}) {
  return (
    <li>
      <Link href={href} className="soft-card hover:border-primary/40 flex h-full items-center gap-4 p-5 transition-colors">
        <span aria-hidden="true" className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-foreground flex items-center gap-1.5 font-semibold">
            {title}
            {done === undefined ? null : done
              ? <CheckCircle2Icon aria-label="Done" className="text-success-strong size-4" />
              : <CircleDashedIcon aria-label="Waiting" className="text-muted-foreground size-4" />}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-sm">{detail}</span>
        </span>
        <ChevronRightIcon aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />
      </Link>
    </li>
  );
}
