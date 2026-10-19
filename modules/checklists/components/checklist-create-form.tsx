'use client';

import { useState } from 'react';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Button } from '@/shared/ui/button';
import { CommandFields, FIELD, LABEL } from './checklist-rows';
import type { ChecklistSection } from '../client';
import type { ActionResponse, Task } from '@/types/tracker';

export function ChecklistCreateForm({ task, checklistId, parentId, section, action }: {
  task: Pick<Task, 'id' | 'taskTag' | 'lifecycleVersion'>;
  checklistId: string;
  parentId: string | null;
  section: ChecklistSection;
  action: (form: FormData) => Promise<ActionResponse<unknown>>;
}) {
  const [kind, setKind] = useState('Item');
  return <ExecutionForm action={action} scope={`checklist-add:${checklistId}:${parentId ?? 'root'}`}>
    <CommandFields ctx={{ task, checklistId }} command={kind === 'Sub-mission' ? 'submission' : 'add'} />
    <input type="hidden" name="section" value={section} />
    <input type="hidden" name="parent_id" value={parentId ?? ''} />
    <input type="hidden" name="node_type" value={kind === 'Page' ? 'Page' : 'Item'} />
    <label className={LABEL}>Add to this checklist
      <select value={kind} onChange={event => setKind(event.target.value)} className={`${FIELD} h-10`}>
        <option>Item</option><option>Sub-mission</option><option>Page</option>
      </select>
    </label>
    <p className="text-muted-foreground text-sm">{kind === 'Sub-mission'
      ? 'Creates its own Setup, Activity and Closure checklist. Owners and deadline follow the mission.'
      : kind === 'Page' ? 'Groups items within this checklist section.' : 'A single piece of work with a completion state.'}</p>
    <label className={LABEL}>Title<input name="title" required maxLength={500} className={`${FIELD} h-10`} /></label>
    <label className={LABEL}>Instructions<textarea name="description" className={`${FIELD} min-h-20 py-2`} /></label>
    <label className={LABEL}>Priority
      <select name="priority" defaultValue="0" className={`${FIELD} h-10`}>
        <option value="0">Normal</option><option value="1">Important</option><option value="2">High</option><option value="3">Urgent</option>
      </select>
    </label>
    {kind === 'Item' ? <>
      <label className={LABEL}>Links<input name="links" className={`${FIELD} h-10`} /></label>
      <label className={LABEL}>Estimate (minutes)<input name="estimated_minutes" type="number" min="0" step="1" className={`${FIELD} h-10`} /></label>
    </> : null}
    <Button type="submit">Add {kind === 'Sub-mission' ? 'Sub-mission' : kind.toLowerCase()}</Button>
  </ExecutionForm>;
}
