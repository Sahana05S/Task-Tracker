import { awardGroupLabel, groupAwardDays, isReasonCode, type AwardDay, type AwardDayGroup, type AwardReadModel } from '@/modules/scoring/client';
import { ListChecksIcon } from 'lucide-react';
import { displayPerformance } from '@/shared/math/exact';
import { formatDateTime } from '@/shared/tracker/format';
import { codeLabel, codeLabels } from '@/shared/tracker/labels';
import { InitialsAvatar } from '@/shared/ui/mission-ui';

import { AWARD_KIND, AWARD_KIND_ORDER, AwardKindBadge, ReasonChipView, awardKindCount } from './award-day-kind';

/**
 * Day-by-day daily star calculation, for the dashboard's collapsed
 * calculation details. Consecutive days that read the same (same status and
 * reasons) share one row; starred days stand alone. Each row keeps the
 * candidate eligibility and scores behind a disclosure.
 *
 * `holidays`: team holiday dates (the company calendar, migration 53, or every
 * active member on Holiday, migration 37); `holidayNames` names calendar dates.
 */
export function AwardStatus({awards,names={},holidays,holidayNames={}}:{awards:AwardReadModel;names?:Record<string,string>;holidays?:ReadonlySet<string>|null;holidayNames?:Record<string,string>}) {
  const name = (id: string | null) => (id ? names[id] ?? 'Team member' : 'None');
  const groups = groupAwardDays(awards.days, holidays);
  const counts = new Map<string, number>();
  for (const group of groups) counts.set(group.kind, (counts.get(group.kind) ?? 0) + group.days.length);

  return (
    <section className="grid gap-3" aria-label="Daily star calculation">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-foreground flex items-center gap-2 text-sm font-semibold">
          <ListChecksIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          Daily star calculation
        </h3>
        {groups.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Days by status">
            {AWARD_KIND_ORDER.filter(kind => counts.get(kind)).map(kind => {
              const meta = AWARD_KIND[kind];
              const Icon = meta.icon;
              return (
                <li key={kind} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.tone}`}>
                  <Icon className="size-3 shrink-0" aria-hidden="true" />
                  {awardKindCount(kind, counts.get(kind)!)}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        Monthly award: {codeLabel(awards.monthly.status).toLowerCase()}, {awards.monthly.winnerId ? `winner ${name(awards.monthly.winnerId)}` : 'no winner yet'}
        {awards.monthly.reasons.length ? ` (${codeLabels(awards.monthly.reasons).toLowerCase()})` : ''}. Nightly calculation {awards.scheduleEnabled ? 'on' : 'off'} · {awards.policyApproved ? 'award rules approved' : 'award rules not approved yet'}
        {awards.legacy.length ? ` · ${awards.legacy.length} older stars from the sheet kept for reference, not counted` : ''}.
      </p>

      {groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">No award days in this period yet.</p>
      ) : (
        <div className="border-border relative overflow-x-auto rounded-xl border">
          <table className="sheet-grid w-full min-w-[40rem]">
            <thead>
              <tr><th>Days</th><th>Result</th><th>Why</th><th>Calculated</th></tr>
            </thead>
            <tbody>
              {groups.map(group => <GroupRow key={group.from} group={group} name={name} holidayNames={holidayNames} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GroupRow({group,name,holidayNames}:{group:AwardDayGroup<AwardDay>;name:(id:string|null)=>string;holidayNames:Record<string,string>}) {
  const first = group.days[0];
  const calculated = group.days.map(day => day.lastSuccessAt).filter((at): at is string => Boolean(at)).sort().at(-1);
  const withCandidates = group.days.filter(day => day.candidates.length);
  const winnerScore = first.winnerId ? first.candidates.find(c => c.userId === first.winnerId)?.calculation.compositeExact : undefined;
  const error = group.days.map(day => day.lastError).find(Boolean);
  const named = group.days.map(day => holidayNames[day.date]).filter(Boolean);

  return (
    <tr className={group.kind === 'holiday' ? 'text-muted-foreground' : undefined}>
      <td className="whitespace-nowrap">
        <time dateTime={group.from}>{awardGroupLabel(group.from, group.to)}</time>
        {group.days.length > 1 ? <span className="text-muted-foreground block text-xs">{group.days.length} days</span> : null}
      </td>
      <td><AwardKindBadge kind={group.kind} /></td>
      <td>
        {group.kind === 'awarded' ? (
          <span className="flex items-center gap-2">
            <InitialsAvatar name={name(first.winnerId)} className="size-6 text-[0.625rem]" />
            <span className="text-foreground font-medium">{name(first.winnerId)}</span>
            {winnerScore !== undefined ? <span className="text-muted-foreground text-xs">score {displayPerformance(winnerScore, 2)}</span> : null}
            {first.override ? <span className="text-muted-foreground text-xs">· changed by the director</span> : null}
          </span>
        ) : group.kind === 'holiday' ? (
          <span className="text-xs">{named.length ? named.join(', ') : 'No star on team holidays'}</span>
        ) : group.kind === 'queued' ? (
          <span className="text-muted-foreground text-xs">Runs in the next nightly calculation</span>
        ) : group.kind === 'failed' ? (
          <span className="text-xs">{error ? (isReasonCode(error) ? codeLabel(error) : error) : 'The calculation stopped'}. It will be retried.</span>
        ) : group.chips.length ? (
          <span className="flex flex-wrap gap-1">{group.chips.map(chip => <ReasonChipView key={`${chip.key}:${chip.code}`} chip={chip} />)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {group.days.map(day => day.overrideReason).filter(Boolean).map((reason, index) => <p key={index} className="mt-1 text-xs">{reason}</p>)}
        {withCandidates.length ? (
          <details className="mt-1">
            <summary className="text-primary cursor-pointer text-xs font-semibold">Candidate eligibility and scores</summary>
            <div className="mt-1 grid gap-2 text-xs">
              {withCandidates.map(day => (
                <div key={day.date}>
                  {group.days.length > 1 ? <p className="text-foreground font-semibold">{awardGroupLabel(day.date, day.date)}</p> : null}
                  {day.candidates.map(c => (
                    <p key={c.userId}>
                      {name(c.userId)}: {codeLabel(c.gate.state)}
                      {c.gate.reasons.length ? ` (${codeLabels(c.gate.reasons)})` : ''}, score {displayPerformance(c.calculation.compositeExact, 2)}
                      {c.calculation.reasons.length ? `; ${codeLabels(c.calculation.reasons)}` : ''}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </td>
      <td className="whitespace-nowrap text-xs">{calculated ? formatDateTime(calculated) : 'Not yet'}</td>
    </tr>
  );
}
