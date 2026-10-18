import { FileTextIcon, PencilIcon, TriangleAlertIcon } from 'lucide-react';

import { MissionPanel } from '@/shared/ui/mission-ui';
import { Disclosure, SmartGoalTile, TextBlock } from '@/modules/tasks/components/detail/detail-tiles';
import { InitializeDetailsForm, NativeDetailsEditor } from '@/modules/tasks/components/native-details-editor';
import { DETAIL_FIELDS, type NativeTemplate } from '@/modules/tasks/internal/details-contract';
import type { NativeDetailState, ReportChoice } from '@/modules/tasks/internal/native-details';
import { cn } from '@/shared/utils';
import type { Task, TaskDetailSection, User } from '@/types/tracker';

/** The content of a native detail section, or null when it is empty. */
export function sectionValue(sectionsByKey: ReadonlyMap<string, TaskDetailSection>, key: string): string | null {
  return sectionsByKey.get(key)?.content ?? null;
}

/** Description, details needed, SMART goals, notes and the native details editor. */
export function MissionBrief({
  task,
  sections,
  native,
  templates,
  canManage,
  tasks,
  members,
  reports,
}: {
  task: Task;
  sections: readonly TaskDetailSection[];
  native: NativeDetailState;
  templates: readonly NativeTemplate[];
  canManage: boolean;
  tasks: readonly Task[];
  members: readonly User[];
  reports: readonly ReportChoice[];
}) {
  const sectionsByKey = new Map(sections.map((section) => [section.keyName, section]));
  const smartFields = DETAIL_FIELDS.filter((f) => f.group === 'smart');
  const smartGoals = smartFields.map((f) => sectionValue(sectionsByKey, f.key));
  const nativeDescription = sectionValue(sectionsByKey, 'description');
  const template = templates.find((t) => t.id === native.instance?.templateVersionId);

  return (
    <MissionPanel
      icon={FileTextIcon}
      title="Mission brief & scope"
      action={
        <span className={cn('badge-soft', native.instance ? 'badge-status-done' : 'badge-neutral')}>
          {native.instance?'Native task/details ready':'Native details not initialized'}
        </span>
      }
    >
      <div className="grid gap-5">
        {task.description ? (
          <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p>
        ) : null}
        {nativeDescription && nativeDescription !== task.description ? (
          <TextBlock title="Description" body={nativeDescription} />
        ) : null}
        {!task.description && !nativeDescription ? (
          <p className="text-muted-foreground text-sm">No description has been written yet.</p>
        ) : null}

        <div className="bg-muted/70 rounded-xl px-4 py-3">
          <p className="eyebrow text-muted-foreground">Details needed</p>
          <p className="text-foreground mt-1 text-sm">
            {sectionValue(sectionsByKey, 'task_details_needed') ?? '[Direct Task]'}
          </p>
        </div>

        <div>
          <h3 className="text-foreground mb-2 text-sm font-semibold">SMART goal statements</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {smartFields.map(f=>f.label).map((label, index) => (
              <SmartGoalTile key={label} label={label} value={smartGoals[index]} />
            ))}
          </div>
        </div>

        {sectionValue(sectionsByKey,'reviewer_notes')?<TextBlock title="Reviewer notes" body={sectionValue(sectionsByKey,'reviewer_notes')!}/>:null}
        {task.comments ? <TextBlock title="Comments" body={task.comments} /> : null}

        {native.instance ? (
          <Disclosure summary={`Template instructions · ${template?.name ?? 'Template'} · version ${template?.version}`}>
            <div className="grid gap-2 text-sm">
              {DETAIL_FIELDS.map(f=>native.instance?.instructions[f.key]?<p key={f.key}><strong>{f.label}:</strong> {native.instance.instructions[f.key]}</p>:null)}
            </div>
          </Disclosure>
        ) : canManage ? (
          <div className="bg-muted/70 grid gap-2 rounded-xl p-4">
            <InitializeDetailsForm task={task} templates={templates}/>
          </div>
        ) : null}

        {canManage ? (
          <Disclosure summary="Edit structured details and links" icon={PencilIcon}>
            <NativeDetailsEditor task={task} sections={sections} tasks={tasks} members={members} reports={reports}/>
          </Disclosure>
        ) : null}

        {native.flags.length ? (
          <Disclosure summary={`Legacy content retained · review required (${native.flags.length})`} icon={TriangleAlertIcon}>
            <div className="grid gap-3 text-sm">
              {native.flags.map(flag=>{const source=sections.find(s=>s.id===flag.source_section_id);return <div key={flag.id}><p className="font-medium">{source?.title} · {flag.reason}</p><p className="text-muted-foreground whitespace-pre-wrap">{source?.content}</p></div>;})}
            </div>
          </Disclosure>
        ) : null}
      </div>
    </MissionPanel>
  );
}
