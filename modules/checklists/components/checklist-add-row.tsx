'use client';

import * as React from 'react';
import { FlagIcon, PlusIcon, RocketIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Input } from '@/shared/ui/input';
import type { ChecklistSection } from '../internal/progress';
import { ChecklistVersionField } from './checklist-state-control';
import type { ActionResponse } from '@/types/tracker';

const KINDS = [
  { key: 'add', label: 'Item', hint: 'A row you tick Yes, No or N/A' },
  { key: 'submission', label: 'Quest', hint: 'A page with its own Setup, Activity and Closure' },
  { key: 'sub-mission', label: 'Sub-mission', hint: 'A real mission of its own, linked here; its progress feeds this row' },
] as const;

/**
 * The last row of a checklist table: pick Item or Quest, type a title, add.
 * Rows go under any row from its menu, and links, estimates and instructions
 * are added afterwards there too, so adding stays one line.
 */
export function ChecklistAddRow({
  taskId,
  checklistId,
  parentId,
  section,
  version,
  action,
  subMissionAction,
  label,
}: {
  taskId: string;
  checklistId: string;
  parentId: string | null;
  section: ChecklistSection;
  version: number;
  action: (form: FormData) => Promise<ActionResponse<unknown>>;
  /** Present for managers: creates a Sub-mission (a linked real mission). */
  subMissionAction?: (form: FormData) => Promise<ActionResponse<unknown>>;
  label: string;
}) {
  const titleId = React.useId();
  const [kind, setKind] = React.useState<(typeof KINDS)[number]['key']>('add');
  const kinds = KINDS.filter((entry) => entry.key !== 'sub-mission' || subMissionAction);
  const chosen = kinds.find((entry) => entry.key === kind) ?? kinds[0];
  const subMission = chosen.key === 'sub-mission';

  return (
    <ExecutionForm action={subMission && subMissionAction ? subMissionAction : action} scope={`checklist-${kind}:${checklistId}:${parentId ?? 'root'}:${section}`}>
      <input type="hidden" name="command" value={subMission ? 'add' : chosen.key} />
      <input type="hidden" name="checklist_id" value={checklistId} />
      <input type="hidden" name="taskId" value={taskId} />
      <ChecklistVersionField fallback={version} />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="parent_id" value={parentId ?? ''} />
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Kind of row" className="bg-muted inline-flex shrink-0 rounded-lg p-0.5">
          {kinds.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="radio"
              aria-checked={chosen.key === entry.key}
              title={entry.hint}
              onClick={() => setKind(entry.key)}
              className="text-muted-foreground aria-checked:bg-card aria-checked:text-foreground focus-visible:ring-ring inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold outline-none focus-visible:ring-2 aria-checked:shadow-(--shadow-card)"
            >
              {entry.key === 'submission' ? <FlagIcon className="size-3.5" aria-hidden="true" /> : entry.key === 'sub-mission' ? <RocketIcon className="size-3.5" aria-hidden="true" /> : null}
              {entry.label}
            </button>
          ))}
        </div>
        <label htmlFor={titleId} className="sr-only">{label}</label>
        <Input id={titleId} name="title" required maxLength={500} placeholder={chosen.key === 'add' ? `Add a row to ${label.toLowerCase()}` : chosen.key === 'submission' ? 'Name the Quest' : 'Name the sub-mission (people and due date come from this mission)'} className="h-9 min-w-48 flex-1 basis-56" />
        <Button type="submit" size="sm" className="h-9">
          <PlusIcon aria-hidden="true" />Add {chosen.label.toLowerCase()}
        </Button>
      </div>
    </ExecutionForm>
  );
}
