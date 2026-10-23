import { awardDateRanges, awardDayLabel, isReasonCode, sharedReasons, type AwardReadModel } from '@/modules/scoring/client';
import { InfoIcon, TrophyIcon } from 'lucide-react';
import { displayPerformance } from '@/shared/math/exact';
import { formatDateTime } from '@/shared/tracker/format';
import { codeLabel, codeLabels } from '@/shared/tracker/labels';

/**
 * Daily stars and the monthly award for the period.
 *
 * `holidays`: team holiday dates (the company calendar, migration 53, or every
 * active member on Holiday, migration 37), marked "H" as in the sheet's daily
 * star log; `holidayNames` names the calendar dates.
 *
 * Reasons every undecided day shares are stated once above the table, so each
 * row shows only what is particular to that day.
 */
export function AwardStatus({awards,names={},holidays,holidayNames={}}:{awards:AwardReadModel;names?:Record<string,string>;holidays?:ReadonlySet<string>|null;holidayNames?:Record<string,string>}) {
  const name = (id: string | null) => (id ? names[id] ?? 'Team member' : 'None');
  const missing = awards.monthly.missingDates;
  const undecided = new Set(missing);
  const common = sharedReasons(awards.days.filter(day => undecided.has(day.date)).map(day => day.reasons));
  const holidayList = holidays ? [...holidays].sort() : [];
  const jobLine = (status: string | null, error: string | null) => {
    const label = status ? codeLabel(status) : '';
    const detail = error ? (isReasonCode(error) ? codeLabel(error) : error) : '';
    return [label, detail].filter(Boolean).join(' · ');
  };

  return (
    <section className="soft-card relative grid gap-4 p-5 sm:p-6">
      <div className="grid gap-1">
        <h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
          <TrophyIcon className="text-recognition size-5 shrink-0" aria-hidden="true" />
          Daily stars and monthly award
        </h2>
        <p className="text-sm">
          <span className="font-semibold">Month: {codeLabel(awards.monthly.status)}.</span>{' '}
          Winner: {name(awards.monthly.winnerId)}.
          {awards.monthly.reasons.length ? <> {codeLabels(awards.monthly.reasons)}.</> : null}
        </p>
        <p className="text-muted-foreground text-xs">
          Nightly calculation {awards.scheduleEnabled ? 'on' : 'off'} · {awards.policyApproved ? 'Award rules approved' : 'Award rules not approved yet'}
          {awards.legacy.length ? ` · ${awards.legacy.length} older stars from the sheet kept for reference, not counted` : ''}
        </p>
      </div>

      {missing.length || holidays ? (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          {missing.length ? (
            <>
              <dt className="text-muted-foreground">Not decided yet</dt>
              <dd>
                {awardDateRanges(missing)}{' '}
                <span className="text-muted-foreground">({missing.length} {missing.length === 1 ? 'day' : 'days'})</span>
              </dd>
            </>
          ) : null}
          {holidays ? (
            <>
              <dt className="text-muted-foreground">Team holidays</dt>
              <dd>
                {holidayList.length
                  ? holidayList.map((date, index) => (
                      <span key={date}>
                        {index ? ', ' : ''}
                        {awardDateRanges([date])}
                        {holidayNames[date] ? ` (${holidayNames[date]})` : ''}
                      </span>
                    ))
                  : 'None'}
                <span className="text-muted-foreground block text-xs">
                  On the company holiday calendar, or a day every active member is on Holiday. Marked H below.
                </span>
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {common.length ? (
        <p className="border-border bg-muted/40 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm">
          <InfoIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">Undecided days are waiting for:</span> {codeLabels(common)}.
          </span>
        </p>
      ) : null}

      <div className="border-border relative overflow-x-auto rounded-xl border">
        <table className="sheet-grid w-full min-w-[44rem]">
          <thead>
            <tr><th>Date</th><th>Result</th><th>Winner</th><th>Why</th><th>Last calculated</th></tr>
          </thead>
          <tbody>
            {awards.days.map(day => {
              const own = (day.reasons ?? []).filter(code => !(undecided.has(day.date) && common.includes(code)));
              const job = jobLine(day.jobStatus, day.lastError);
              return (
                <tr key={day.date}>
                  <td className="whitespace-nowrap">
                    <time dateTime={day.date}>{awardDayLabel(day.date)}</time>
                    {holidays?.has(day.date) ? (
                      <span className="badge-soft badge-neutral ml-1.5" title={holidayNames[day.date] ?? 'Team holiday'}>
                        H<span className="sr-only">: {holidayNames[day.date] ?? 'team holiday'}</span>
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {codeLabel(day.status)}{day.override ? ' · changed by the director' : ''}
                    {job ? <p className="text-muted-foreground text-xs">{job}</p> : null}
                  </td>
                  <td>{name(day.winnerId)}</td>
                  <td>
                    <p>
                      {own.length
                        ? <>{common.length && undecided.has(day.date) && day.reasons?.length ? 'Also: ' : ''}{codeLabels(own)}</>
                        : day.reasons?.length
                          ? <span className="text-muted-foreground">See above</span>
                          : '—'}
                    </p>
                    {day.overrideReason ? <p>{day.overrideReason}</p> : null}
                    {day.candidates.length ? (
                      <details className="mt-1">
                        <summary className="text-primary cursor-pointer text-xs font-semibold">Candidate eligibility and scores</summary>
                        {day.candidates.map(c => (
                          <p key={c.userId}>
                            {name(c.userId)}: {codeLabel(c.gate.state)}
                            {c.gate.reasons.length ? ` (${codeLabels(c.gate.reasons)})` : ''}, score {displayPerformance(c.calculation.compositeExact, 2)}
                            {c.calculation.reasons.length ? `; ${codeLabels(c.calculation.reasons)}` : ''}
                          </p>
                        ))}
                      </details>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap">{day.lastSuccessAt ? formatDateTime(day.lastSuccessAt) : 'Not yet'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
