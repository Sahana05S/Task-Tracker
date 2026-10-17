import type { createClient } from '@/shared/supabase/server';
import type { Json } from '@/types/database';
import { calculateAward } from './calculation';
import { observationInstant } from '@/lib/presentation/clock';
import type { AwardPolicy } from './contract';
type Client=Awaited<ReturnType<typeof createClient>>;
export async function runAwardJobs(db:Client,limit=10,forOrganization?:(organizationId:string)=>Client) {
 const configuration=await db.rpc('award_policy_context',{});if(configuration.error)throw new Error('Award worker policy unavailable.');
 const config=configuration.data as unknown as {policy:AwardPolicy|null};
 const claim=await db.rpc('claim_award_jobs',{p_limit:limit});if(claim.error||!Array.isArray(claim.data))throw new Error('Award job claim failed.');
 const outcomes:{jobId:string;status:string}[]=[];
 for(const raw of claim.data){
  const job=raw as unknown as {id:string;date:string;leaseToken:string;version:number;isRevision?:boolean;organizationId?:string|null};
  // Each job runs inside its own company (migration 40).
  const jobDb=job.organizationId&&forOrganization?forOrganization(job.organizationId):db;
  if(!job||typeof job.id!=='string'||typeof job.date!=='string'||typeof job.leaseToken!=='string'||!Number.isSafeInteger(job.version))throw new Error('Invalid award lease.');
  const base={jobId:job.id,leaseToken:job.leaseToken,expectedVersion:job.version};
  let result:Awaited<ReturnType<typeof calculateAward>>;
  try{result=await calculateAward(jobDb,job.date,(await observationInstant(jobDb)).instant.toISOString(),config.policy,job.isRevision===true);}
  catch{const fail=await jobDb.rpc('award_command',{p_command:'fail',p_payload:{...base,errorCode:'source_query_failed'},p_operation:job.leaseToken});if(fail.error)throw new Error('Award source failure could not be recorded.');outcomes.push({jobId:job.id,status:'failed'});continue;}
  let finish=await jobDb.rpc('award_command',{p_command:'commit',p_payload:{...base,result:result as unknown as Json},p_operation:job.leaseToken});
  if(finish.error){const code=finish.error.code==='40001'?'source_changed':finish.error.code==='23514'&&finish.error.message.includes('Frozen')?'frozen_period':'calculation_failed';
   finish=await jobDb.rpc('award_command',{p_command:'fail',p_payload:{...base,errorCode:code},p_operation:job.leaseToken});if(finish.error)throw new Error('Award outcome could not be recorded.');outcomes.push({jobId:job.id,status:'failed'});
  }else outcomes.push({jobId:job.id,status:result.status});
 }return outcomes;
}
