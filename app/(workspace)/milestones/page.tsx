import type { Metadata } from 'next';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { MilestoneChecklist } from '@/components/milestones/milestone-checklist';
import { OrganizationShowcase } from '@/components/milestones/organization-showcase';
import { currentPeriod } from '@/lib/analytics/engine';
import { requireProfile } from '@/lib/auth/profile';
import { MONTHLY_MILESTONES } from '@/lib/milestones/content';

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

  const achieved = MONTHLY_MILESTONES.filter(
    (milestone) => milestone.status === 'Achieved',
  ).length;

  return (
    <>
      <WorkspaceHeader
        title="Vision & milestones"
        description={`${period.label} · ${achieved} of ${MONTHLY_MILESTONES.length} milestones achieved`}
      />

      <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
        <OrganizationShowcase />
        <MilestoneChecklist periodLabel={period.label} />
      </div>
    </>
  );
}
