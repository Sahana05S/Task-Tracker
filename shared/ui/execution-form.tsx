'use client';

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon } from 'lucide-react';

import { prepareOperation } from '@/shared/commands/client-operation';
import { FormError } from '@/shared/ui/form-field';
import type { ActionResponse } from '@/types/tracker';

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

/** The field quick repeated entry starts from: one marked `data-autofocus`, else the first typing field. */
const TYPING_FIELD = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=date]):not([type=time]):not([type=month]):not([readonly]), textarea:not([readonly])';
function entryField(form: HTMLFormElement): HTMLElement | null {
  return form.querySelector<HTMLElement>('[data-autofocus]')
    ?? [...form.querySelectorAll<HTMLElement>(TYPING_FIELD)].find((el) => el.getClientRects().length > 0) ?? null;
}

/**
 * A form for one retained command. It keys each submission with an operation
 * id (so a lost response can be recovered by resubmitting), refreshes the page
 * on success and reports the outcome beside the form. The form stays usable
 * after a save; the confirmation clears as soon as anything changes. Focus
 * comes back once the save settles: to the first field after a success (so the
 * next entry can be typed straight away), or to where it was after a refusal.
 */
export function ExecutionForm({ action, scope, children, className, onSuccess }: {
  action: Command;
  scope: string;
  children: React.ReactNode;
  className?: string;
  /** Runs after a successful save, e.g. to close the drawer that holds the form. */
  onSuccess?: (result: ActionResponse<unknown>) => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [changed, setChanged] = useState(false);
  // Disabled until the refreshed page lands, so a second click cannot repeat the command.
  const [refreshing, startRefresh] = useTransition();
  // The element focused when the form was submitted; the disabled fieldset blurs it.
  const lastFocus = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    const form = formRef.current;
    if (pending || refreshing || !state || !form?.isConnected) return;
    const active = document.activeElement;
    if (active && active !== document.body && !form.contains(active)) return;
    const target = state.success ? entryField(form) : lastFocus.current;
    if (target?.isConnected && !(target as HTMLInputElement).disabled) target.focus({ preventScroll: true });
  }, [pending, refreshing, state]);

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
        lastFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => submit(data));
      }}
    >
      <fieldset disabled={pending || refreshing} className="grid gap-2 border-0 p-0">
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
