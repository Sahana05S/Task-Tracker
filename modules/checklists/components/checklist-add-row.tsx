'use client';

import * as React from 'react';
import { PlusIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Input } from '@/shared/ui/input';
import type { ChecklistSection } from '../internal/progress';
import { ChecklistVersionField } from './checklist-state-control';
import type { ActionResponse } from '@/types/tracker';

/**
 * The last row of a checklist table: type a title, add. Every row is the same
 * kind; rows go under any row from its menu, and links, estimates and
 * instructions are added afterwards there too, so adding stays one line.
 */
export function ChecklistAddRow({
  taskId,
  checklistId,
  parentId,
  section,
  version,
  action,
  label,
}: {
  taskId: string;
  checklistId: string;
  parentId: string | null;
  section: ChecklistSection;
  version: number;
  action: (form: FormData) => Promise<ActionResponse<unknown>>;
  label: string;
}) {
  const titleId = React.useId();

  return (
    <ExecutionForm action={action} scope={`checklist-add:${checklistId}:${parentId ?? 'root'}:${section}`}>
      <input type="hidden" name="command" value="add" />
      <input type="hidden" name="checklist_id" value={checklistId} />
      <input type="hidden" name="taskId" value={taskId} />
      <ChecklistVersionField fallback={version} />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="parent_id" value={parentId ?? ''} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={titleId} className="sr-only">{label}</label>
        <Input id={titleId} name="title" required maxLength={500} placeholder={`Add a row to ${label.toLowerCase()}`} className="h-9 min-w-48 flex-1 basis-56" />
        <Button type="submit" size="sm" className="h-9">
          <PlusIcon aria-hidden="true" />Add row
        </Button>
      </div>
    </ExecutionForm>
  );
}
