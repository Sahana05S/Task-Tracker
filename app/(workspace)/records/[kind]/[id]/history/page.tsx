import { notFound } from 'next/navigation';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { requireProfile } from '@/lib/auth/profile';
import { createClient } from '@/lib/supabase/server';
import { USER_COLUMNS } from '@/lib/supabase/mappers';
import type { Json } from '@/types/database';
export default async function RecordHistoryPage({params}:{params:Promise<{kind:string;id:string}>}) {
  await requireProfile();const {kind,id}=await params;
  if(!['attendance','fact','idea','suggestion','sale','meeting'].includes(kind)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))notFound();
  const db=await createClient();const [{data,error},members]=await Promise.all([db.rpc('dated_record_history',{p_kind:kind,p_id:id}),db.from('users').select(USER_COLUMNS)]);
  if(error)throw new Error(`Record history unavailable: ${error.message}`);
  if(members.error)throw new Error(`History attribution unavailable: ${members.error.message}`);
  if(!Array.isArray(data))throw new Error('Record history unavailable: invalid response.');
  const names=new Map(members.data.map(m=>[m.id,m.full_name]));
  const object=(v:Json|undefined):Record<string,Json|undefined>=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  const text=(v:Json|undefined)=>typeof v==='string'?v:'Unknown';
  return <><WorkspaceHeader title="Retained record history" description="Business date and observed revision time remain separate."/><div className="grid gap-3 p-4">{data.map((entry,index)=>{const e=object(entry),s=object(e.source);const author=text(s.user_id??s.posted_by??s.sales_by);return <article key={index} className="soft-card grid gap-2 p-4"><h2 className="font-semibold">Revision {String(e.version)} - {text(e.command).replaceAll('_',' ')}</h2><dl className="grid grid-cols-2 gap-2 text-sm"><dt>Observed at</dt><dd>{text(e.recordedAt)}</dd><dt>Business date</dt><dd>{text(s.attendance_date??s.fact_date??s.idea_date??s.suggestion_date??s.sale_date??s.meeting_date)}</dd><dt>Attributed to</dt><dd>{names.get(author)??'Attribution unknown'}</dd><dt>Review state</dt><dd>{text(s.validation_state??s.record_state)}</dd><dt>Validator</dt><dd>{names.get(text(s.validated_by))??'Not recorded'}</dd><dt>Validation time</dt><dd>{text(s.validation_at)}</dd></dl><p className="whitespace-pre-wrap">{text(s.fact??s.idea??s.suggestion??s.point??s.notes)}</p>{kind==='attendance'?<p>Attendance: {String(s.attendance_hours)} h; off hours: {String(s.off_hours)} h; {s.hours_confirmed===true?'Measured input':'Legacy measurement needs confirmation'}.</p>:null}<p>Reason: {text(e.reason)}</p>{e.command==='legacy_current_baseline'?<p className="text-sm">This preserves the observed legacy record. Earlier validation/correction timing is unknown.</p>:null}</article>;})}</div></>;
}
