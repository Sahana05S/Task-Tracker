import Link from 'next/link';
import type { LivePresentation } from '@/lib/presentation/model';
export function TaskRelations({model}:{model:LivePresentation}){
 const ref=(id:unknown)=>{const t=model.tasks.find(t=>t.id===id);return t?<Link className="underline" href={'/tasks/'+encodeURIComponent(t.taskTag)}>{t.taskTag} · {t.title}</Link>:<span>Referenced task {String(id)} (details unavailable in this context)</span>;};
 return <section className="soft-card grid gap-2 p-4"><h2 className="font-semibold">Dependencies and carryover</h2>{model.relations.map((r,i)=><p key={i}>{ref(r.predecessor_task_id)} → {ref(r.successor_task_id)} · {String(r.relation_type)}</p>)}{model.tasks.filter(t=>t.handoffSuccessorId).map(t=><p key={t.id}>{ref(t.id)} handed off to {ref(t.handoffSuccessorId)} · predecessor history retained</p>)}{!model.detailsAvailable?<p>Historical relationships unavailable before {model.detailsAvailableFrom}.</p>:null}</section>;
}
