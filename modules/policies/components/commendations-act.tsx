import Link from 'next/link';
import { ScaleIcon, TriangleAlertIcon } from 'lucide-react';

import type { Section } from '@/shared/async/settle';
import { EmptyState, MissionNotice } from '@/shared/ui/mission-ui';

import { PERIOD_LABELS, periodLabel } from '@/modules/policies/client';
import { BadgeSeal, pointsLabel } from '@/modules/policies/components/badge-seal';
import type { MemberCommendations } from '@/modules/policies/internal/ceremony';

/**
 * The ceremony's closing act: everyone who met a company policy for a whole
 * period that ended this month. A quiet coda after the monthly star (bronze
 * seals, no confetti), so the star stays the peak. Points are recognition only.
 */
export function CommendationsAct({ section, monthLabel, viewerId }: {
  section: Section<MemberCommendations[]>; monthLabel: string; viewerId: string;
}) {
  return (
    <div className="soft-card grid gap-4 p-5 sm:p-6">
      <div>
        <p className="eyebrow">After the awards</p>
        <h2 className="text-foreground text-lg font-bold tracking-tight">Commendations</h2>
        <p className="text-muted-foreground text-sm">Company policies met for a whole period that ended in {monthLabel}.</p>
      </div>
      {section.status !== 'ready' ? (
        <MissionNotice tone="attention" icon={TriangleAlertIcon}>Commendations could not be loaded right now. They are also listed on the Policies page.</MissionNotice>
      ) : !section.data.length ? (
        <EmptyState icon={ScaleIcon} title={`No commendations for ${monthLabel}`}
          action={<Link href="/policies" className="link text-sm">See the policies in force</Link>}>
          Meet a policy for a whole week or month to be commended here.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {section.data.map((member) => (
            <li key={member.employeeId} className="border-border grid content-start gap-2.5 rounded-2xl border bg-white p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-foreground font-semibold break-words">
                  {member.name}{member.employeeId === viewerId ? <span className="text-muted-foreground font-normal"> (you)</span> : null}
                </p>
                {member.points > 0 ? <p className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">{pointsLabel(member.points)}</p> : null}
              </div>
              <ul className="grid gap-2">
                {member.commendations.map((c) => (
                  <li key={`${c.policyId}:${c.periodKey}`} className="grid gap-0.5">
                    <BadgeSeal badge={c.badge} points={c.points} />
                    <p className="text-muted-foreground pl-7.5 text-xs">
                      {c.policyName} · {PERIOD_LABELS[c.periodKind].adjective.toLowerCase()}, {periodLabel({ kind: c.periodKind, start: c.periodStart, end: c.periodEnd })}
                    </p>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
