import { notFound } from 'next/navigation';
import { WorkspaceHeader } from '@/modules/workspace-views/components/shell/workspace-header';
import { requireProfile } from '@/shared/session/profile';
import { getRecordHistory, isRecordReference } from '@/modules/records';
import type { Json } from '@/types/database';
import { formatHours } from '@/shared/tracker/format';
export default async function RecordHistoryPage({params}:{params:Promise<{kind:string;id:string}>}) {
  await requireProfile();const {kind,id}=await params;
  if(!isRecordReference(kind,id))notFound();
  const {entries:data,names}=await getRecordHistory(kind,id);
  const object=(v:Json|undefined):Record<string,Json|undefined>=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const text=(v:Json|undefined)=>typeof v==='string'?v:'Unknown';
  return <><WorkspaceHeader title="Retained record history" description="Business date and observed revision time remain separate."/><div className="grid gap-3 p-4">{data.map((entry,index)=>{const e=object(entry),s=object(e.source);const author=text(s.user_id??s.posted_by??s.sales_by);return <article key={index} className="soft-card grid gap-2 p-4"><h2 className="font-semibold">Revision {String(e.version)} - {text(e.command).replaceAll('_',' ')}</h2><dl className="grid grid-cols-2 gap-2 text-sm"><dt>Observed at</dt><dd>{text(e.recordedAt)}</dd><dt>Business date</dt><dd>{text(s.attendance_date??s.fact_date??s.idea_date??s.suggestion_date??s.sale_date??s.meeting_date)}</dd><dt>Attributed to</dt><dd>{names.get(author)??'Attribution unknown'}</dd><dt>Review state</dt><dd>{text(s.validation_state??s.record_state)}</dd><dt>Validator</dt><dd>{names.get(text(s.validated_by))??'Not recorded'}</dd><dt>Validation time</dt><dd>{text(s.validation_at)}</dd></dl><p className="whitespace-pre-wrap">{text(s.fact??s.idea??s.suggestion??s.point??s.notes)}</p>{kind==='attendance'?<p>Attendance: {formatHours(s.attendance_hours as number|string|null)} h; off hours: {formatHours(s.off_hours as number|string|null)} h; {s.hours_confirmed===true?'Measured input':'Legacy measurement needs confirmation'}.</p>:null}<p>Reason: {text(e.reason)}</p>{e.command==='legacy_current_baseline'?<p className="text-sm">This preserves the observed legacy record. Earlier validation/correction timing is unknown.</p>:null}</article>;})}</div></>;
}
