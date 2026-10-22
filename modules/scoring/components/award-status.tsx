import type { AwardReadModel } from '@/modules/scoring/client';
import { TrophyIcon } from 'lucide-react';
import { displayPerformance } from '@/shared/math/exact';
import { formatDateTime } from '@/shared/tracker/format';
import { codeLabel, codeLabels } from '@/shared/tracker/labels';
/** `holidays`: team holiday dates (every active member on Holiday, migration 37), marked "H" as in the sheet's daily star log. */
export function AwardStatus({awards,names={},holidays}:{awards:AwardReadModel;names?:Record<string,string>;holidays?:ReadonlySet<string>|null}) {
 const name=(id:string|null)=>id?names[id]??'Team member':'None';
 return <section className="soft-card relative grid gap-2 p-5 sm:p-6"><h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight"><TrophyIcon className="text-recognition size-5 shrink-0" aria-hidden="true"/>Daily stars and monthly award</h2>
 <p className="text-sm">Month: {codeLabel(awards.monthly.status)}. Winner: {name(awards.monthly.winnerId)}. {codeLabels(awards.monthly.reasons)}</p>
 <p className="text-muted-foreground text-xs">Nightly calculation: {awards.scheduleEnabled?'on':'off'}. {awards.policyApproved?'Award rules approved.':'Award rules not approved yet.'}</p>
 <p className="text-muted-foreground text-xs">{awards.legacy.length} older stars from the sheet are kept for reference and not counted in the monthly award.</p>
 {holidays?<p className="text-sm">Holidays ({holidays.size}){holidays.size?`: ${[...holidays].sort().join(', ')}`:''}. A date is a team holiday when every active member's attendance is Holiday.</p>:null}
 {awards.monthly.missingDates.length?<p className="text-sm">Days not decided yet: {awards.monthly.missingDates.join(', ')}</p>:null}
 <div className="border-border mt-2 overflow-x-auto rounded-xl border"><table className="sheet-grid w-full min-w-[44rem]"><thead><tr><th>Date</th><th>Result</th><th>Winner</th><th>Why</th><th>Last calculated</th></tr></thead><tbody>{awards.days.map(day=><tr key={day.date}><td>{day.date}{holidays?.has(day.date)?<span className="badge-soft badge-neutral ml-1.5" title="Team holiday">H</span>:null}</td><td>{codeLabel(day.status)}{day.override?' · changed by the director':''}<p className="text-muted-foreground text-xs">{codeLabel(day.jobStatus)}{day.lastError?` - ${day.lastError}`:''}</p></td><td>{name(day.winnerId)}</td><td><p>{codeLabels(day.reasons??[])||'—'}</p>{day.overrideReason?<p>{day.overrideReason}</p>:null}<details className="mt-1"><summary className="text-primary cursor-pointer text-xs font-semibold">Candidate eligibility and scores</summary>{day.candidates.map(c=><p key={c.userId}>{name(c.userId)}: {codeLabel(c.gate.state)}{c.gate.reasons.length?` (${codeLabels(c.gate.reasons)})`:''}, score {displayPerformance(c.calculation.compositeExact,2)}{c.calculation.reasons.length?`; ${codeLabels(c.calculation.reasons)}`:''}</p>)}</details></td><td>{day.lastSuccessAt?formatDateTime(day.lastSuccessAt):'Not yet'}</td></tr>)}</tbody></table></div>
 </section>;
}
