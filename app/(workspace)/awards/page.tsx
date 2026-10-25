import type { Metadata } from 'next';
import { DatabaseIcon, TriangleAlertIcon } from 'lucide-react';

import { CeremonyPublish } from '@/modules/recognition/components/ceremony-publish';
import { CeremonyStage } from '@/modules/recognition/components/ceremony-stage';
import { getCeremony, leaderboardPeriod } from '@/modules/recognition';
import { getCeremonyCommendations } from '@/modules/policies';
import { CommendationsAct } from '@/modules/policies/components/commendations-act';
import { settle } from '@/shared/async/settle';
import { requireProfile } from '@/shared/session/profile';
import { formatDateTime } from '@/shared/tracker/format';
import { buttonVariants } from '@/shared/ui/button';
import { MissionNotice, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { currentPeriod, resolvePeriod } from '@/shared/time/period';

export const metadata: Metadata = { title: 'Awards' };

/** The month before the current one: the ceremony people usually come for. */
function lastMonth(): string {
  const { year, month } = currentPeriod();
  return (month === 1 ? resolvePeriod(year - 1, 12) : resolvePeriod(year, month - 1)).startDate.slice(0, 7);
}

/**
 * The monthly award ceremony: one award per performance factor and the
 * monthly star, from the shared calculation and the daily award evidence.
 * Provisional while the month runs; official once the director publishes it.
 */
export default async function AwardsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const profile = await requireProfile();
  const query = await searchParams;
  let period = leaderboardPeriod(lastMonth());
  let monthError: string | null = null;
  try {
    period = leaderboardPeriod(query.month ?? lastMonth());
  } catch (error) {
    monthError = error instanceof Error ? error.message : 'Choose a valid month.';
  }
  const [ceremony, commendations] = await Promise.all([
    settle(() => getCeremony(profile, period)),
    settle(() => getCeremonyCommendations(period.startDate, period.endDate)),
  ]);
  const model = ceremony.status === 'ready' ? ceremony.data : null;
  // Results show as they stand ("As of" in the description); only the published state gets a chip.
  const chip = model?.status === 'official' ? `Official · revision ${model.publication!.revisionNumber}` : undefined;

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Team · Awards"
        title={`${period.label} awards`}
        chip={chip}
        description={model
          ? model.status === 'official'
            ? `Published ${formatDateTime(model.publication!.publishedAt)} · one award per factor, then the monthly star`
            : `As of ${formatDateTime(model.asOf)} · one award per factor, then the monthly star`
          : 'One award per factor, then the monthly star'}
        actions={
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="awards-month" className="sr-only">Month</label>
            <input id="awards-month" type="month" name="month" autoComplete="off" defaultValue={period.startDate.slice(0, 7)}
              max={currentPeriod().startDate.slice(0, 7)} className="field h-10 w-48 bg-card" />
            <button type="submit" className={buttonVariants({ variant: 'outline' })}>View</button>
          </form>
        }
      />

      {monthError ? <MissionNotice tone="attention" icon={TriangleAlertIcon} role="status">{monthError} Showing {period.label}.</MissionNotice> : null}

      {!model ? (
        <MissionNotice tone="danger" icon={TriangleAlertIcon} role="status">
          The ceremony couldn&apos;t be loaded right now. Refresh to try again.
        </MissionNotice>
      ) : (
        <>
          {!model.publishingAvailable ? (
            <MissionNotice tone="attention" icon={DatabaseIcon} role="status">
              Publishing needs a database update that this workspace doesn&apos;t have yet, so the ceremony stays a preview here.
            </MissionNotice>
          ) : null}
          {/* Categories nobody could be measured on are left out, not shown as "not measured" (decision 25 Oct 2026). */}
          <CeremonyStage
            model={{ ...model, categories: model.categories.filter((c) => c.status !== 'unavailable') }}
            viewerId={profile.id}
            commendations={<CommendationsAct section={commendations} monthLabel={period.label} viewerId={profile.id} />}
          />
          {model.canPublish ? <CeremonyPublish month={model.month} expectedRevision={model.expectedRevision} /> : null}
        </>
      )}
    </MissionPage>
  );
}
