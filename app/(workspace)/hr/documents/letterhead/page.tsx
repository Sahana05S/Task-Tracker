import type { Metadata } from 'next';
import Link from 'next/link';

import { Letterhead } from '@/modules/hr/components/letterhead';
import { PrintButton } from '@/modules/hr/components/print-button';
import { getCompanySettings } from '@/modules/settings';
import { requireProfile } from '@/shared/session/profile';
import { Breadcrumb } from '@/shared/ui/page-nav';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'Letterhead · HR' };

/** A blank company letterhead to download as PDF (M19). */
export default async function LetterheadPage() {
  const profile = await requireProfile();
  const settings = await getCompanySettings();
  const missing = !settings.letterhead.address && !settings.letterhead.phone && !settings.letterhead.email;
  return (
    <MissionPage>
      <MissionPageHeader
        breadcrumb={<Breadcrumb back={{ href: '/hr/documents', label: 'Back to documents' }} items={[{ label: 'HR', href: '/hr/documents' }, { label: 'Letterhead' }]} />}
        title="Company letterhead"
        description={profile.role === 'managing_director' && missing
          ? 'Add the address and contact lines in Settings > Company > Letterhead; they print under the logo.'
          : 'A blank letterhead. Download it as PDF, then write or print on it.'}
        actions={
          <>
            {profile.role === 'managing_director' ? (
              <Link href="/settings?tab=company#letterhead" className="no-print text-primary text-sm font-medium hover:underline">Edit details</Link>
            ) : null}
            <PrintButton />
          </>
        }
      />
      <Letterhead branding={settings.branding} letterhead={settings.letterhead}>
        <div className="min-h-[60mm]" />
      </Letterhead>
    </MissionPage>
  );
}
