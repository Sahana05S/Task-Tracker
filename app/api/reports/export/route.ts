import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/profile';
import { viewContext } from '@/lib/presentation/context';
import { getLivePresentation } from '@/lib/presentation/queries';
import { liveReport,reportCsv,reportText } from '@/lib/presentation/export';
import { archivedReport,archivedText,archivedCsv,monthRevision } from '@/lib/month/archive';
export async function GET(request:Request){
 const profile=await getCurrentProfile();if(!profile?.isActive)return NextResponse.json({error:'Active authentication required.'},{status:403});
 const p=new URL(request.url).searchParams,employee=p.get('employee');
 if(employee&&employee!==profile.id&&!['managing_director','project_engineer'].includes(profile.role))return NextResponse.json({error:'Employee detail access denied.'},{status:403});
 let context;try{context=viewContext(p.get('period')??undefined,p.get('asOf')??undefined);}catch{return NextResponse.json({error:'Invalid report context.'},{status:400});}
 const format=p.get('format')??'json';if(!['json','csv','text'].includes(format))return NextResponse.json({error:'Unsupported export format.'},{status:400});
 const revisionText=p.get('revision'),revision=revisionText===null?null:Number(revisionText);
 if(revision!==null&&(!Number.isSafeInteger(revision)||revision<1))return NextResponse.json({error:'Invalid revision.'},{status:400});
 try{
  const archived=revision===null?null:await monthRevision(context.period.startDate,revision,employee);
  if(revision!==null&&!archived)return NextResponse.json({error:'Archived revision not found.'},{status:404});
  const model=archived?null:await getLivePresentation(context,employee);
  const body=archived?(format==='csv'?archivedCsv(archived):format==='text'?archivedText(archived):JSON.stringify(archivedReport(archived),null,2)):
   format==='csv'?reportCsv(model!):format==='text'?reportText(model!):JSON.stringify(liveReport(model!),null,2);
  return new Response(body,{headers:{'Content-Type':format==='csv'?'text/csv; charset=utf-8':format==='text'?'text/plain; charset=utf-8':'application/json','Content-Disposition':`attachment; filename="taskpulse-${context.period.startDate}${revision!==null?'-revision-'+revision:'-live'}.${format==='text'?'txt':format}"`,'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Report evidence unavailable. Retry after the source or schema issue is resolved.'},{status:503});}
}
