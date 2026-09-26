import type { Metadata } from 'next';

import { MilestoneChecklist } from '@/components/milestones/milestone-checklist';
import { OrganizationShowcase } from '@/components/milestones/organization-showcase';
import { currentPeriod } from '@/lib/analytics/engine';
import { requireProfile } from '@/lib/auth/profile';

export const metadata: Metadata = {
  title: 'Milestones · TaskPulse',
};

/**
 * Organisational vision, mission, values and monthly milestones.
 *
 * Content is static and typed, in `lib/milestones/content.ts`. The profile is
 * still required so the route stays behind the same gate as the rest of the
 * workspace.
 */
export default async function MilestonesPage() {
  await requireProfile();
  const period = currentPeriod();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <h2 className="text-base font-semibold text-slate-900">
          Vision, mission &amp; milestones
        </h2>
        <p className="text-xs text-slate-500">
          What the organisation is working toward, and where this month stands
          against it.
        </p>
      </div>

      <OrganizationShowcase />
      <MilestoneChecklist periodLabel={period.label} />
    </div>
  );
}
