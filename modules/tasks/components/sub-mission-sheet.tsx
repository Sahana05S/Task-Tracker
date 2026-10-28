'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircleIcon, LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { addSubMission } from '@/modules/tasks/actions';
import { Button } from '@/shared/ui/button';
import { Field } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { SegmentedControl, type SegmentedOption } from '@/shared/ui/segmented-control';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import type { Task } from '@/types/tracker';

type Phase = 'setup' | 'activity' | 'closure';
const PHASES: readonly SegmentedOption<Phase>[] = [
  { value: 'setup', label: 'Setup' },
  { value: 'activity', label: 'Activity' },
  { value: 'closure', label: 'Closure' },
];

/**
 * Add a sub-mission from the Missions list: a real mission (people and due date
 * from the parent unless changed) linked as a row of the parent's checklist in
 * the chosen phase (migration 68).
 */
export function SubMissionSheet({ parent, onClose }: { parent: Task | null; onClose: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>('activity');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  // One operation per opening, so a retried submit cannot add the sub-mission twice.
  const operation = React.useRef('');
  const titleId = React.useId();
  const dueId = React.useId();

  React.useEffect(() => {
    if (!parent) return;
    setPhase('activity');
    setError(null);
    operation.current = crypto.randomUUID();
  }, [parent]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!parent) return;
    const form = new FormData(event.currentTarget);
    form.set('taskId', parent.id);
    form.set('section', phase);
    form.set('operationId', operation.current);
    startTransition(async () => {
      const result = await addSubMission(form);
      if (!result.success) {
        setError(result.error ?? 'The sub-mission could not be added.');
        return;
      }
      const tag = (result.data as { subMissionTag?: string } | null)?.subMissionTag;
      toast.success(tag ? `${tag} added under ${parent.taskTag}` : `Sub-mission added under ${parent.taskTag}`);
      onClose();
      router.refresh();
    });
  };

  return (
    <Sheet open={parent !== null} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <SheetContent side="bottom" className="sm:mx-auto sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <SheetHeader>
            <SheetTitle>Add sub-mission</SheetTitle>
            <SheetDescription>
              {parent ? (
                <>A mission of its own, shown as a row of <span className="task-tag">{parent.taskTag}</span>&rsquo;s checklist. It starts with the same people.</>
              ) : null}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <Field id={titleId} label="Name" required>
              <Input id={titleId} name="title" required maxLength={200} autoFocus autoComplete="off" />
            </Field>
            <Field id={dueId} label="Due date" hint="Leave as is to use the parent's due date.">
              <Input id={dueId} name="due_date" type="date" defaultValue={parent?.dueDate ?? ''} key={parent?.id ?? 'none'} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-foreground text-sm font-medium">Phase of {parent?.taskTag ?? 'the mission'}</span>
              <SegmentedControl label="Phase" value={phase} options={PHASES} onValueChange={setPhase} className="self-start" />
            </div>
            {error ? (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}
          </div>
          <SheetFooter className="flex-row justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <><LoaderCircleIcon className="animate-spin" aria-hidden="true" />Adding</> : 'Add sub-mission'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
