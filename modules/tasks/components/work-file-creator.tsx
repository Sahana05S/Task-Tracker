'use client';

import { useState } from 'react';
import { CheckIcon, CopyIcon, FileSpreadsheetIcon, FileTextIcon, PresentationIcon } from 'lucide-react';

import { ExecutionForm } from '@/shared/ui/execution-form';
import { Button } from '@/shared/ui/button';
import { addTaskAsset } from '@/modules/tasks/detail-actions';
import { cn } from '@/shared/utils';

const FIELD = 'border-input bg-background w-full min-w-0 rounded-xl border px-3 text-sm';

const KINDS = [
  { label: 'Google Doc', href: 'https://docs.new', icon: FileTextIcon },
  { label: 'Google Sheet', href: 'https://sheets.new', icon: FileSpreadsheetIcon },
  { label: 'Google Slides', href: 'https://slides.new', icon: PresentationIcon },
] as const;

/**
 * "Create work file" without Google Drive credentials (the sheet tracker's
 * Create Work Files menu, quick option). The new file is created by Google in
 * the person's own account; TaskPulse only saves the link they paste back, and
 * says so: it never claims to create, rename or share the file.
 */
export function WorkFileCreator({
  taskId,
  taskTag,
  title,
  version,
}: {
  taskId: string;
  taskTag: string;
  title: string;
  version: number;
}) {
  const suggested = `${taskTag} - ${title}`.slice(0, 120);
  const [copied, setCopied] = useState(false);

  async function copyName() {
    try {
      await navigator.clipboard.writeText(suggested);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-primary/15 bg-primary-subtle/40 grid gap-4 rounded-2xl border p-4">
      <div>
        <h3 className="text-foreground text-sm font-bold">Create work file</h3>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Opens a new file in your own Google account. Name it, then paste its link below. TaskPulse saves the link only; it does not create, rename or share the file.
        </p>
      </div>

      <ol className="grid gap-3 text-sm">
        <li className="grid gap-2">
          <span className="text-foreground font-medium">1. Create the file</span>
          <div className="flex flex-wrap gap-2">
            {KINDS.map(({ label, href, icon: Icon }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="border-border hover:border-primary/40 text-foreground inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium transition-colors"
              >
                <Icon className="text-primary size-4" aria-hidden="true" />
                New {label}
              </a>
            ))}
          </div>
        </li>
        <li className="grid gap-2">
          <span className="text-foreground font-medium">2. Name it</span>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="bg-background border-border min-w-0 max-w-full truncate rounded-lg border px-2.5 py-1.5 text-xs">{suggested}</code>
            <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={copyName}>
              {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy name'}
            </Button>
          </div>
        </li>
        <li className="grid gap-2">
          <span className="text-foreground font-medium">3. Paste its link</span>
          <ExecutionForm action={addTaskAsset} scope={`workFile:${taskId}`}>
            <input type="hidden" name="taskId" value={taskId} />
            <input type="hidden" name="expectedVersion" value={version} />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="text-foreground font-medium">Goes under</span>
                <select name="ipoRole" defaultValue="process" className={cn(FIELD, 'h-10')}>
                  <option value="input">Inputs</option>
                  <option value="process">Process</option>
                  <option value="output">Outputs</option>
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="text-foreground font-medium">File type</span>
                <select name="linkType" defaultValue="Document" className={cn(FIELD, 'h-10')}>
                  {['Document', 'Folder', 'Drawing', 'Flowchart', 'Engineering', 'Other'].map(t => <option key={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-foreground font-medium">File name</span>
              <input name="label" defaultValue={suggested} required maxLength={120} className={cn(FIELD, 'h-10')} />
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-foreground font-medium">File link</span>
              <input name="url" type="url" required placeholder="https://docs.google.com/…" className={cn(FIELD, 'h-10')} />
            </label>
            <Button type="submit" className="justify-self-start rounded-xl">Save work file link</Button>
          </ExecutionForm>
        </li>
      </ol>
    </div>
  );
}
