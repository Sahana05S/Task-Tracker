'use client';

import * as React from 'react';
import { UserRoundIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Field } from '@/shared/ui/form-field';
import { ChecklistVersionField } from './checklist-state-control';
import type { ActionResponse } from '@/types/tracker';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

/** The mission's Crew, who may own a Quest (migration 122), and the viewer. */
interface QuestCrew {
  crew: readonly { id: string; name: string }[];
  viewerId: string | null;
}
const CrewContext = React.createContext<QuestCrew>({ crew: [], viewerId: null });

export function QuestCrewProvider({ crew, viewerId, children }: QuestCrew & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ crew, viewerId }), [crew, viewerId]);
  return <CrewContext.Provider value={value}>{children}</CrewContext.Provider>;
}

const SELECT = 'border-input bg-card text-foreground focus-visible:ring-ring h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2';

/**
 * The owner picker for a new Quest or a reassignment: the mission's Crew. The
 * viewer is chosen first when they are Crew; otherwise the database picks the
 * mission's primary. Nothing renders while the Crew is unknown.
 */
export function QuestOwnerSelect({ id, defaultValue, className }: { id: string; defaultValue?: string | null; className?: string }) {
  const { crew, viewerId } = React.useContext(CrewContext);
  if (!crew.length) return null;
  const initial = defaultValue ?? (crew.some((member) => member.id === viewerId) ? viewerId! : '');
  return (
    <select id={id} name="assignee_id" defaultValue={initial} className={className ?? SELECT}>
      {initial ? null : <option value="">Mission’s primary</option>}
      {crew.map((member) => <option key={member.id} value={member.id}>{member.name}{member.id === viewerId ? ' (you)' : ''}</option>)}
    </select>
  );
}

/** Row menu: give a Quest to another Crew member (`assign`, migration 122). */
export function AssignQuestForm({ row, taskId, version, action }: {
  row: { id: string; checklistId: string; title: string; assigneeId?: string | null };
  taskId: string;
  version: number;
  action: Command;
}) {
  const { crew } = React.useContext(CrewContext);
  const id = `row-${row.id}-owner`;
  if (!crew.length) return null;
  return (
    <section aria-labelledby={`${id}-heading`} className="soft-divider grid gap-3 pt-5">
      <h3 id={`${id}-heading`} className="text-foreground flex items-center gap-2 text-sm font-bold">
        <UserRoundIcon className="text-primary size-4" aria-hidden="true" />Assign
      </h3>
      <p className="text-muted-foreground text-sm">The owner, the owners of the Quests above it and managers change what is inside this Quest.</p>
      <ExecutionForm action={action} scope={`assign:${row.id}`}>
        <input type="hidden" name="command" value="assign" />
        <input type="hidden" name="checklist_id" value={row.checklistId} />
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="node_id" value={row.id} />
        <ChecklistVersionField fallback={version} />
        <div className="grid gap-3">
          <Field id={id} label="Owner">
            <QuestOwnerSelect id={id} defaultValue={row.assigneeId ?? crew[0].id} />
          </Field>
          <Button type="submit" variant="outline" className="justify-self-start">Assign Quest</Button>
        </div>
      </ExecutionForm>
    </section>
  );
}
