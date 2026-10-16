import type { AwardReadModel } from '@/lib/stars/read-model';
import { TrophyIcon } from 'lucide-react';
import { displayPerformance } from '@/lib/performance/exact';
export function AwardStatus({awards,names={}}:{awards:AwardReadModel;names?:Record<string,string>}) {
 const name=(id:string|null)=>id?names[id]??id:'None';
 return <section className="soft-card relative grid gap-2 p-5 sm:p-6"><h2 className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight"><TrophyIcon className="text-recognition size-5 shrink-0" aria-hidden="true"/>Daily stars and monthly award</h2>
 <p className="text-sm">Month: {awards.monthly.status}. Winner: {name(awards.monthly.winnerId)}. {awards.monthly.reasons.join('; ')}</p>
 <p className="text-muted-foreground text-xs">Automatic schedule: {awards.scheduleEnabled?'configured; delivery requires verification':'not configured'}. {awards.policyApproved?'Approved policy recorded.':'Daily award policy awaits decisions.'}</p>
 <p className="text-muted-foreground text-xs">{awards.legacy.length} legacy records retained; excluded from certified monthly counts.</p>
 {awards.monthly.missingDates.length?<p className="text-sm">Missing/blocked coverage: {awards.monthly.missingDates.join(', ')}</p>:null}
 <div className="border-border mt-2 overflow-x-auto rounded-xl border"><table className="sheet-grid w-full min-w-[44rem]"><thead><tr><th>Kolkata date</th><th>Run</th><th>Winner</th><th>Context / reasons</th><th>Last successful calculation</th></tr></thead><tbody>{awards.days.map(day=><tr key={day.date}><td>{day.date}</td><td>{day.status}{day.override?' / director override':' / automatic'}<p className="text-muted-foreground text-xs">{day.jobStatus}{day.lastError?` - ${day.lastError}`:''}</p></td><td>{name(day.winnerId)}</td><td>{String(day.context?.policyId??'Policy unavailable')}<p>{day.reasons?.join('; ')}</p>{day.overrideReason?<p>{day.overrideReason}</p>:null}<details className="mt-1"><summary className="text-primary cursor-pointer text-xs font-semibold">Candidate eligibility and scores</summary>{day.candidates.map(c=><p key={c.userId}>{name(c.userId)}: {c.gate.state} ({c.gate.reasons.join('; ')}), score {displayPerformance(c.calculation.compositeExact,2)}; {c.calculation.reasons.join('; ')}</p>)}</details></td><td>{day.lastSuccessAt??'No successful calculation'}</td></tr>)}</tbody></table></div>
 </section>;
}
