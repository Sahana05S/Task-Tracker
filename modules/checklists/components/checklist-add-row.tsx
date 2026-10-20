'use client';

import * as React from 'react';
import { PlusIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/utils';
import type { ChecklistSection } from '../internal/progress';
import { ChecklistVersionField } from './checklist-state-control';
import type { ActionResponse } from '@/types/tracker';

type Kind = 'Item' | 'Page' | 'Sub-mission';

const KIND_HINT: Record<Kind, string> = {
  Item: 'One piece of work with Yes / No / N/A.',
  Page: 'Opens its own table of rows inside this section.',
  'Sub-mission': 'Gets its own Setup, Activity and Closure; owners and deadline follow the mission.',
};

/**
 * The last row of a checklist table: type a title, pick Item / Page /
 * Sub-mission, add. Links, estimates and instructions are added afterwards
 * from the row menu, so adding stays one line.
 */
export function ChecklistAddRow({
  taskId,
  checklistId,
  parentId,
  section,
  version,
  action,
  allowSubMission = true,
  label,
}: {
  taskId: string;
  checklistId: string;
  parentId: string | null;
  section: ChecklistSection;
  version: number;
  action: (form: FormData) => Promise<ActionResponse<unknown>>;
  allowSubMission?: boolean;
  label: string;
}) {
  const [kind, setKind] = React.useState<Kind>('Item');
  const titleId = React.useId();
  const kinds: Kind[] = allowSubMission ? ['Item', 'Page', 'Sub-mission'] : ['Item', 'Page'];

  return (
    <ExecutionForm action={action} scope={`checklist-add:${checklistId}:${parentId ?? 'root'}:${section}`}>
      <input type="hidden" name="command" value={kind === 'Sub-mission' ? 'submission' : 'add'} />
      <input type="hidden" name="checklist_id" value={checklistId} />
      <input type="hidden" name="taskId" value={taskId} />
      <ChecklistVersionField fallback={version} />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="parent_id" value={parentId ?? ''} />
      {kind === 'Sub-mission' ? null : <input type="hidden" name="node_type" value={kind} />}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={titleId} className="sr-only">{label}</label>
        <Input id={titleId} name="title" required maxLength={500} placeholder={`Add a row to ${label.toLowerCase()}`} className="h-9 min-w-48 flex-1 basis-56" />
        <div role="group" aria-label="Row type" className="bg-muted inline-flex items-center gap-0.5 rounded-lg p-0.5">
          {kinds.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              onClick={() => setKind(option)}
              className={cn(
                'text-muted-foreground hover:text-foreground focus-visible:ring-ring h-8 rounded-md px-2.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2',
                'aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-(--shadow-card)',
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <Button type="submit" size="sm" className="h-9">
          <PlusIcon aria-hidden="true" />Add {kind === 'Sub-mission' ? 'Sub-mission' : kind.toLowerCase()}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{KIND_HINT[kind]}</p>
    </ExecutionForm>
  );
}
