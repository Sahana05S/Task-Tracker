import type { Metadata } from 'next';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { MilestoneBoard } from '@/components/milestones/milestone-board';
import { OrganizationShowcase } from '@/components/milestones/organization-showcase';
import { currentPeriod } from '@/lib/analytics/engine';
import { requireProfile } from '@/lib/auth/profile';
import { summariseMilestones } from '@/lib/milestones/goals';
import { getMilestonesPageData } from '@/lib/milestones/queries';
import { canManageMilestones } from '@/lib/tracker/enums';

export const metadata: Metadata = {
  title: 'Milestones · TaskPulse',
};

/**
 * Organisational vision, mission, values and monthly milestones.
 *
 * All of it is live data from `company_statements` and `company_milestones`, added
 * by `04_milestones_and_vision.sql`. Every authenticated member reads the page;
 * `managing_director` and `project_engineer` additionally get the inline editors,
 * matching the `Leadership can manage …` policies exactly — so what the UI offers
 * and what the database permits cannot drift.
 *
 * `canManage` only decides whether controls render. The Server Actions re-check
 * the role and RLS re-checks it again, because a hidden button is not access
 * control.
 */
export default async function MilestonesPage() {
  const profile = await requireProfile();
  const { statements, milestones, members } = await getMilestonesPageData();

  const period = currentPeriod();
  const summary = summariseMilestones(milestones);
  const canManage = canManageMilestones(profile.role);

  return (
    <>
      <WorkspaceHeader
        title="Vision & milestones"
        description={`${period.label} · ${summary.achieved} of ${summary.total} milestones achieved`}
      />

      <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
        <OrganizationShowcase statements={statements} canManage={canManage} />
        <MilestoneBoard
          milestones={milestones}
          members={members}
          periodLabel={period.label}
          canManage={canManage}
        />
      </div>
    </>
  );
}
