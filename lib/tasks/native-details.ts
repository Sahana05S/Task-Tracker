import { createClient } from '@/lib/supabase/server';
import type { DetailInstance, NativeTemplate } from './details-contract';
export async function getNativeTemplates():Promise<NativeTemplate[]> {
 const db=await createClient();
 const [templates,versions]=await Promise.all([db.from('task_detail_templates').select('*'),db.from('task_detail_template_versions').select('*').order('version',{ascending:false})]);
 if(templates.error || versions.error) throw new Error(templates.error?.message ?? versions.error?.message);
 return (versions.data??[]).map(v=>({id:v.id,templateId:v.template_id,name:templates.data?.find(t=>t.id===v.template_id)?.name ?? 'Template',version:v.version,instructions:(v.payload as {instructions:NativeTemplate['instructions']}).instructions,requiresReview:v.requires_review,checklistNodes:(v.payload as {checklist_nodes?:NativeTemplate['checklistNodes']}).checklist_nodes??[],legacyDescription:(v.payload as {legacy_description?:string|null}).legacy_description,legacyNodes:(v.payload as {legacy_nodes?:NativeTemplate['legacyNodes']}).legacy_nodes}));
}
export async function getNativeDetailState(taskId:string) {
 const db=await createClient();
 const [instance,flags]=await Promise.all([db.from('task_detail_instances').select('*').eq('task_id',taskId).maybeSingle(),db.from('task_detail_review_flags').select('*').eq('task_id',taskId)]);
 if(instance.error || flags.error) throw new Error(instance.error?.message ?? flags.error?.message);
 const i=instance.data;
 return {instance:i ? {taskId:i.task_id,templateVersionId:i.template_version_id,instructions:i.instructions as DetailInstance['instructions'],initializedAt:i.initialized_at,providerState:i.provider_state} : null,flags:flags.data??[]};
}
export async function getVisibleReportChoices(){
 const db=await createClient();const result=await db.from('report_snapshots').select('id,title,employee_id').order('created_at',{ascending:false});
 if(result.error) throw new Error(result.error.message);return result.data;
}
