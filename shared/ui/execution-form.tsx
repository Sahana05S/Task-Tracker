'use client';

import { startTransition, useActionState, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon } from 'lucide-react';

import { prepareOperation } from '@/shared/commands/client-operation';
import { FormError } from '@/shared/ui/form-field';
import type { ActionResponse } from '@/types/tracker';
import { cn } from '@/shared/utils';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

const INTERRUPTED: ActionResponse<unknown> = {
  success: false,
  error: 'The response was interrupted. Submit the same values again to recover the saved result.',
  errorCode: 'unavailable',
};

/** Splits the legacy `taskVersion` field ("id:version") into the command's own fields. */
function expandTaskVersion(form: FormData) {
  if (!form.has('taskVersion')) return;
  const [id, version] = String(form.get('taskVersion')).split(':');
  form.delete('taskVersion');
  form.set('taskId', id);
  form.set('expectedVersion', version);
}

/**
 * A form for one retained command. It keys each submission with an operation
 * id (so a lost response can be recovered by resubmitting), refreshes the page
 * on success and reports the outcome beside the form. The form stays usable
 * after a save; the confirmation clears as soon as anything changes.
 */
export function ExecutionForm({ action, scope, children, className, fieldsClassName, onSuccess }: {
  action: Command;
  scope: string;
  children: React.ReactNode;
  className?: string;
  /** Layout of the fields themselves (they sit in one fieldset), e.g. a row of select, reason and button. */
  fieldsClassName?: string;
  /** Runs after a successful save, e.g. to close the drawer that holds the form. */
  onSuccess?: (result: ActionResponse<unknown>) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [changed, setChanged] = useState(false);
  // Disabled until the refreshed page lands, so a second click cannot repeat the command.
  const [refreshing, startRefresh] = useTransition();
  const [state, submit, pending] = useActionState(async (_previous: ActionResponse<unknown> | null, form: FormData) => {
    setChanged(false);
    try {
      expandTaskVersion(form);
      const settle = await prepareOperation(form, scope);
      const result = await action(form);
      if (result.success) {
        settle();
        formRef.current?.reset();
        startRefresh(() => router.refresh());
        onSuccess?.(result);
      }
      return result;
    } catch {
      return INTERRUPTED;
    }
  }, null);

  const saved = state?.success === true && !changed;
  const failure = state && !state.success && !changed ? state.error : undefined;

  // React 19 resets a form after every action, so a refused command cleared what
  // the user typed. onSubmit dispatches in a transition and prevents default,
  // which makes React skip its action pipeline (and that reset); success resets
  // explicitly. `action` stays so server HTML blocks native pre-hydration submits.
  return (
    <form
      ref={formRef}
      action={submit}
      className={className}
      onChange={() => setChanged(true)}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => submit(data));
      }}
    >
      <fieldset disabled={pending || refreshing} className={cn('grid gap-2 border-0 p-0', fieldsClassName)}>
        {children}
      </fieldset>
      {/* Rendered before it has text, so screen readers announce each update. */}
      <p role="status" className="text-success-strong flex min-h-0 items-center gap-1.5 text-sm empty:hidden">
        {pending ? <span className="text-muted-foreground">Saving…</span> : null}
        {saved && !pending ? <><CheckIcon className="size-4 shrink-0" aria-hidden="true" />Saved</> : null}
      </p>
      <FormError message={failure} className="mt-2" />
    </form>
  );
}
