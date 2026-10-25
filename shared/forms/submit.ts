import { startTransition, type FormEvent } from 'react';

/**
 * An `onSubmit` for a form whose `action` is a server action: dispatched in a
 * transition, so React 19 does not clear what was typed when the save is
 * refused (it resets forms after every action otherwise). Keep `action` on the
 * form too, so a submit before hydration still works.
 */
export function keepTypedOnRefusal(run: (form: FormData) => unknown) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => { void run(data); });
  };
}
