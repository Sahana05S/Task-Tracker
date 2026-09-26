'use client';

import * as React from 'react';
import { LoaderCircleIcon, PencilIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  updateStatement,
  type StatementActionState,
} from '@/app/milestones/actions';
import { Button } from '@/components/ui/button';
import { Field, FormError } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { CORE_VALUES_KEY } from '@/lib/milestones/statements';
import type { CompanyStatement } from '@/types/tracker';

export interface StatementEditorProps {
  statement: CompanyStatement;
}

const INITIAL_STATE: StatementActionState | null = null;

/**
 * Inline editor for one showcase block.
 *
 * Trigger and drawer travel together so the surrounding card stays a Server
 * Component: the page decides *whether* leadership may edit, this decides *how*.
 *
 * `key_name` is not offered as a field. It is the handle the showcase selects by,
 * so editing it would make the card vanish rather than change it.
 */
export function StatementEditor({ statement }: StatementEditorProps) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = React.useActionState(
    updateStatement,
    INITIAL_STATE,
  );

  const error = state && !state.success ? state.error : undefined;
  const succeeded = state?.success === true;
  const savedTitle = state?.success === true ? state.data?.title : undefined;

  React.useEffect(() => {
    if (!succeeded) return;

    setOpen(false);
    toast.success(`${savedTitle ?? 'Statement'} updated`, {
      description: 'Everyone on the team sees the new wording.',
    });
  }, [succeeded, savedTitle]);

  const isCoreValues = statement.keyName === CORE_VALUES_KEY;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${statement.title}`}
        className="text-muted-foreground hover:text-foreground -my-1 h-7 px-2 text-xs"
      >
        <PencilIcon className="size-3" aria-hidden="true" />
        Edit
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] gap-0 sm:mx-auto sm:max-w-2xl sm:rounded-t-xl"
        >
          <SheetHeader>
            <SheetTitle>Edit {statement.title.toLowerCase()}</SheetTitle>
            <SheetDescription>
              {isCoreValues
                ? 'One value per line. Text before the first colon becomes the value name.'
                : 'Shown to the whole team on the milestones tab.'}
            </SheetDescription>
          </SheetHeader>

          {/*
            Keyed on the statement's own updated_at so a successful save remounts
            the form against the new values. Without it the inputs keep the
            defaults they were created with and a second edit would start from
            stale text.
          */}
          <form
            key={statement.updatedAt}
            action={action}
            className="flex min-h-0 flex-1 flex-col"
          >
            <input type="hidden" name="statementId" value={statement.id} />

            <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
              <Field id="statement-title" label="Heading" required>
                <Input
                  id="statement-title"
                  name="title"
                  defaultValue={statement.title}
                  maxLength={80}
                  required
                  aria-invalid={error !== undefined}
                />
              </Field>

              <Field
                id="statement-body"
                label={isCoreValues ? 'Values' : 'Statement'}
                hint={
                  isCoreValues
                    ? 'For example: Technical Rigour: Work is checked before it is issued.'
                    : 'The headline sentence. Keep it to something a person can repeat from memory.'
                }
                required
              >
                <Textarea
                  id="statement-body"
                  name="statement"
                  defaultValue={statement.statement}
                  rows={isCoreValues ? 8 : 3}
                  required
                  aria-describedby="statement-body-hint"
                  className={isCoreValues ? 'min-h-40' : 'min-h-24'}
                />
              </Field>

              <Field
                id="statement-subtext"
                label="Supporting text"
                hint="Optional. The smaller line beneath the headline."
              >
                <Textarea
                  id="statement-subtext"
                  name="subtext"
                  defaultValue={statement.subtext ?? ''}
                  rows={3}
                  aria-describedby="statement-subtext-hint"
                  className="min-h-20"
                />
              </Field>

              <FormError message={error} />
            </div>

            <SheetFooter className="border-border flex-row justify-end border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <>
                    <LoaderCircleIcon
                      className="animate-spin"
                      aria-hidden="true"
                    />
                    Saving
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
