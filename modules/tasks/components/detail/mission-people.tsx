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
 * The Crew and observers of one mission (migration 121). Crew: the managing
 * director and Managers; everyone on the Crew logs time, marks Done and shares
 * the credit equally. Observers: the managing director, Managers and the Crew;
 * they follow the mission and never review it. `task_people_command` decides.
 */
export function MissionPeopleManager({
  canManageCrew = true,
  canManageObservers = true,
  taskId,
  version,
  crew,
  observers,
  candidates,
}: {
  /** The Crew (the managing director and Managers). */
  canManageCrew?: boolean;
  /** Observers (the managing director, Managers and the Crew). */
  canManageObservers?: boolean;
  taskId: string;
  version: number;
  crew: readonly Person[];
  observers: readonly Person[];
  /** Active members with no tie to the mission yet. */
  candidates: readonly Person[];
}) {
  return (
    <details className="group border-border mt-4 border-t pt-4">
      <summary className="text-foreground flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
        <UsersIcon className="text-primary size-4" aria-hidden="true" />
        Manage crew
      </summary>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {canManageCrew ? <PeopleGroup
          title="Crew"
          hint="Everyone on the crew logs time, can mark the mission Done and shares the credit equally."
          taskId={taskId}
          version={version}
          people={crew}
          removeCommand="remove_crew"
          addCommand="add_crew"
          candidates={candidates}
          keepOne
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
  keepOne = false,
}: {
  title: string;
  hint: string;
  taskId: string;
  version: number;
  people: readonly Person[];
  removeCommand: string;
  addCommand: string;
  candidates: readonly Person[];
  /** Hides Remove when only one person is left (a mission needs one crew member). */
  keepOne?: boolean;
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
                {keepOne && people.length < 2 ? null : <Button type="submit" size="sm" variant="ghost" aria-label={`Remove ${person.name} from ${title.toLowerCase()}`}>Remove</Button>}
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
