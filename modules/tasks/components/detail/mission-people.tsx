'use client';

import { UsersIcon } from 'lucide-react';

import { changeTaskPeople } from '@/modules/tasks/actions';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { NativeSelect } from '@/shared/ui/native-select';

interface Person {
  readonly id: string;
  readonly name: string;
}

/**
 * Collaborators, observers and ownership of one mission (migration 108).
 * Collaborators and ownership: the managing director, project engineers and the
 * mission's Owner. Observers: the managing director, the Owner and the mission's
 * assignees (migration 117). `task_people_command` decides. Collaborators edit the mission but hold no
 * share and log no time; observers follow it and never review it.
 */
export function MissionPeopleManager({
  canManageCollaborators = true,
  canManageObservers = true,
  taskId,
  version,
  owner,
  assignees,
  collaborators,
  observers,
  candidates,
}: {
  /** Collaborators and ownership transfer (managers and the Owner). */
  canManageCollaborators?: boolean;
  /** Observers (the managing director, the Owner and assignees). */
  canManageObservers?: boolean;
  taskId: string;
  version: number;
  owner: Person | null;
  /** Credited assignees other than the Owner: the only members ownership can move to. */
  assignees: readonly Person[];
  collaborators: readonly Person[];
  observers: readonly Person[];
  /** Active members with no tie to the mission yet. */
  candidates: readonly Person[];
}) {
  return (
    <details className="group border-border mt-4 border-t pt-4">
      <summary className="text-foreground flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
        <UsersIcon className="text-primary size-4" aria-hidden="true" />
        Manage people
      </summary>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {canManageCollaborators ? <PeopleGroup
          title="Collaborators"
          hint="Edit the mission, its checklist and details. No share of the credit, no time logged."
          taskId={taskId}
          version={version}
          people={collaborators}
          removeCommand="remove_collaborator"
          addCommand="add_collaborator"
          candidates={candidates}
        /> : null}
        {canManageObservers ? <PeopleGroup
          title="Observers"
          hint="Follow the mission, see its checklist and files. They cannot tick, edit, upload or review."
          taskId={taskId}
          version={version}
          people={observers}
          removeCommand="remove_observer"
          addCommand="add_observer"
          candidates={candidates}
        /> : null}
        {canManageCollaborators ? <div className="grid content-start gap-2 sm:col-span-2">
          <p className="text-foreground text-sm font-semibold">Owner</p>
          <p className="text-muted-foreground text-xs">
            {owner ? `${owner.name} owns this mission.` : 'No owner is recorded.'} Ownership moves to an assignee with a share; shares stay as they are.
          </p>
          {assignees.length > 0 ? (
            <ExecutionForm action={(form) => changeTaskPeople(null, form)} scope="task-people" className="grid gap-2">
              <PeopleFields taskId={taskId} version={version} command="transfer_owner" />
              <div className="flex flex-wrap items-center gap-2">
                <NativeSelect name="userId" aria-label="New owner" className="min-w-0 flex-1" required defaultValue="">
                  <option value="" disabled>Choose an assignee</option>
                  {assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </NativeSelect>
                <Button type="submit" size="sm" variant="outline">Transfer ownership</Button>
              </div>
            </ExecutionForm>
          ) : (
            <p className="text-muted-foreground text-xs">Add a second assignee with a share (Edit mission) to hand ownership over.</p>
          )}
        </div> : null}
      </div>
    </details>
  );
}

function PeopleFields({ taskId, version, command }: { taskId: string; version: number; command: string }) {
  return (
    <>
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="command" value={command} />
    </>
  );
}

function PeopleGroup({
  title,
  hint,
  taskId,
  version,
  people,
  removeCommand,
  addCommand,
  candidates,
}: {
  title: string;
  hint: string;
  taskId: string;
  version: number;
  people: readonly Person[];
  removeCommand: string;
  addCommand: string;
  candidates: readonly Person[];
}) {
  return (
    <section className="grid content-start gap-2" aria-label={title}>
      <p className="text-foreground text-sm font-semibold">{title}</p>
      <p className="text-muted-foreground text-xs">{hint}</p>
      {people.length === 0 ? <p className="text-muted-foreground text-sm">None yet.</p> : (
        <ul className="grid gap-1.5">
          {people.map((person) => (
            <li key={person.id}>
              <ExecutionForm action={(form) => changeTaskPeople(null, form)} scope="task-people" className="flex items-center gap-2">
                <PeopleFields taskId={taskId} version={version} command={removeCommand} />
                <input type="hidden" name="userId" value={person.id} />
                <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
                <Button type="submit" size="sm" variant="ghost" aria-label={`Remove ${person.name} from ${title.toLowerCase()}`}>Remove</Button>
              </ExecutionForm>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 ? (
        <ExecutionForm action={(form) => changeTaskPeople(null, form)} scope="task-people" className="grid gap-2">
          <PeopleFields taskId={taskId} version={version} command={addCommand} />
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect name="userId" aria-label={`Add to ${title.toLowerCase()}`} className="min-w-0 flex-1" required defaultValue="">
              <option value="" disabled>Choose a member</option>
              {candidates.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </NativeSelect>
            <Button type="submit" size="sm" variant="outline">Add</Button>
          </div>
        </ExecutionForm>
      ) : null}
    </section>
  );
}
