'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { InfinityIcon } from 'lucide-react';

import { BUSINESS_PARAM, matchesBusiness, parseBusinessParam, type Business } from '@/modules/businesses/client';
import type { PermanentMission } from '@/modules/tasks/client';
import { TimerButton } from '@/modules/time-tracking/components/timer-button';

export interface AlwaysOnStripProps {
  missions: readonly PermanentMission[] | null;
  /**
   * The business chips' catalogue and the member's own businesses (migration 134). With them the
   * strip follows `?business=` like the page's missions (opening on the member's own); null shows all.
   */
  businesses?: { catalogue: readonly Business[]; mine: readonly string[] } | null;
}

/**
 * "Always on" (migration 135): the permanent missions the member is Crew on,
 * at the top of Today and Missions, each with a large Start / Stop timer, so
 * one tap starts the clock without opening the mission. Only Crew may time a
 * permanent mission, so the strip lists only those; a member on none (or none
 * in the chosen businesses) sees nothing. The running time is the timer
 * button's live clock.
 */
export function AlwaysOnStrip({ missions, businesses = null }: AlwaysOnStripProps) {
  const params = useSearchParams();
  const raw = params.getAll(BUSINESS_PARAM);
  const key = raw.join(',');
  const shown = React.useMemo(() => {
    if (!missions?.length) return [];
    if (!businesses) return missions;
    const selection = parseBusinessParam(key ? key.split(',') : null, businesses.catalogue, businesses.mine);
    return missions.filter((mission) => matchesBusiness(selection, mission.businessId));
  }, [missions, businesses, key]);
  if (!shown.length) return null;
  return (
    <section aria-labelledby="always-on-title" className="soft-card mb-5 p-4 sm:p-5">
      <h2 id="always-on-title" className="text-foreground mb-3 flex items-center gap-2 text-sm font-bold tracking-tight">
        <InfinityIcon className="text-primary size-4" aria-hidden="true" />
        Always on
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((mission) => (
          <li key={mission.id} className="border-border flex min-w-0 items-center justify-between gap-3 rounded-2xl border p-3">
            <Link
              href={`/tasks/${encodeURIComponent(mission.taskTag)}`}
              className="min-w-0 rounded underline-offset-4 hover:underline"
            >
              <span className="text-muted-foreground block text-xs font-semibold">{mission.taskTag}</span>
              <span className="text-foreground block truncate text-sm font-semibold">{mission.title}</span>
            </Link>
            <TimerButton taskId={mission.id} taskLabel={mission.taskTag} size="default" className="h-12 shrink-0 px-5 text-base" />
          </li>
        ))}
      </ul>
    </section>
  );
}
