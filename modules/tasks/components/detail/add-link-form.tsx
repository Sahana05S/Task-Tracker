'use client';

import { LinkIcon } from 'lucide-react';

import { addTaskAsset } from '@/modules/tasks/detail-actions';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';

/**
 * "Add a link instead": the small secondary option in a Files group (Input,
 * Process or Output). Saves a pasted link with that IPO role
 * (`task_details_command` 'link'); it never creates, renames or shares the file.
 */
export function AddLinkForm({ taskId, version, ipoRole }: { taskId: string; version: number; ipoRole: 'input' | 'process' | 'output' }) {
  return (
    <details className="group">
      <summary className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium">
        <LinkIcon aria-hidden="true" className="size-3.5" />
        Add a link instead
      </summary>
      <div className="mt-2">
        <ExecutionForm action={addTaskAsset} scope={`addLink:${taskId}:${ipoRole}`} className="grid gap-2">
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="expectedVersion" value={version} />
          <input type="hidden" name="ipoRole" value={ipoRole} />
          <input type="hidden" name="linkType" value="Raw Link" />
          <label className="grid min-w-0 gap-1 text-xs">
            <span className="text-foreground font-medium">Name</span>
            <input name="label" required maxLength={120} className="field h-9 w-full" />
          </label>
          <label className="grid min-w-0 gap-1 text-xs">
            <span className="text-foreground font-medium">Link</span>
            <input name="url" type="url" required placeholder="https://" className="field h-9 w-full" />
          </label>
          <p className="text-muted-foreground text-xs">Saved as a link only: make sure the right people can open it.</p>
          <Button type="submit" size="sm" variant="outline" className="justify-self-start">Save link</Button>
        </ExecutionForm>
      </div>
    </details>
  );
}
