'use client';

import * as React from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { deleteMilestone } from '@/app/milestones/actions';
import { MilestoneChecklist } from '@/components/milestones/milestone-checklist';
import { MilestoneDialog } from '@/components/milestones/milestone-dialog';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-field';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { sortMilestones } from '@/lib/milestones/goals';
import type { CompanyMilestone, User } from '@/types/tracker';

export interface MilestoneBoardProps {
  milestones: readonly CompanyMilestone[];
  members: readonly User[];
  periodLabel: string;
  /** True for `managing_director` and `project_engineer`. */
  canManage: boolean;
}

/**
 * Editing shell around the milestone checklist.
 *
 * Holds the dialog state in one place rather than per row, so a list of goals
 * mounts one editor and one confirmation instead of two overlays each. The
 * checklist itself stays presentational.
 *
 * Refreshed data arrives through the `revalidatePath` calls inside the actions,
 * so nothing here re-fetches.
 */
export function MilestoneBoard({
  milestones,
  members,
  periodLabel,
  canManage,
}: MilestoneBoardProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CompanyMilestone | null>(null);
  const [pendingDelete, setPendingDelete] =
    React.useState<CompanyMilestone | null>(null);

  const ordered = React.useMemo(
    () => sortMilestones(milestones),
    [milestones],
  );

  // Resolving an owner from a map keeps the query flat — see the note in
  // lib/milestones/queries.ts about not embedding the user row per milestone.
  const ownerNames = React.useMemo(
    () => new Map(members.map((member) => [member.id, member.fullName])),
    [members],
  );

  const openCreate = React.useCallback(() => {
    setEditing(null);
    setDialogOpen(true);
  }, []);

  const openEdit = React.useCallback((milestone: CompanyMilestone) => {
    setEditing(milestone);
    setDialogOpen(true);
  }, []);

  const handleSaved = React.useCallback(
    (mode: 'created' | 'updated', title: string) => {
      toast.success(
        mode === 'created'
          ? `${title || 'Milestone'} added`
          : `${title || 'Milestone'} updated`,
        {
          description:
            mode === 'created'
              ? 'The team can see the new goal on this tab.'
              : 'Progress and status are up to date.',
        },
      );
    },
    [],
  );

  return (
    <>
      <MilestoneChecklist
        milestones={ordered}
        ownerNames={ownerNames}
        periodLabel={periodLabel}
        canManage={canManage}
        onAdd={openCreate}
        onEdit={openEdit}
        onRequestDelete={setPendingDelete}
      />

      <MilestoneDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        milestone={editing}
        members={members}
        onSaved={handleSaved}
      />

      <DeleteConfirmation
        milestone={pendingDelete}
        onClose={() => setPendingDelete(null)}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Delete confirmation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Explicit confirmation before deletion.
 *
 * Deletion is permanent — `company_milestones` keeps no history and nothing
 * references a row — so the question is worth asking, the same way it is asked
 * before deleting a task.
 */
function DeleteConfirmation({
  milestone,
  onClose,
}: {
  milestone: CompanyMilestone | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | undefined>(undefined);

  // Clears the previous failure when a different milestone is queued up.
  React.useEffect(() => {
    setError(undefined);
  }, [milestone]);

  const confirm = () => {
    if (!milestone) return;
    const { id, title } = milestone;

    startTransition(async () => {
      const result = await deleteMilestone(id);

      if (result.success) {
        onClose();
        // Reported by toast because the drawer that asked the question is gone by
        // the time the answer arrives.
        toast.success(`${title} deleted`, {
          description: 'The milestone has been removed for everyone.',
        });
      } else {
        // Kept inline: the drawer is still open and the message belongs next to
        // the action that was refused.
        setError(result.error ?? 'Could not delete the milestone.');
      }
    });
  };

  return (
    <Sheet
      open={milestone !== null}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <SheetContent side="bottom" className="sm:mx-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Delete milestone</SheetTitle>
          <SheetDescription>
            {milestone ? (
              <>
                <span className="text-foreground font-medium">
                  {milestone.title}
                </span>{' '}
                will be removed permanently. This cannot be undone.
              </>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        <div className="px-5">
          <FormError message={error} />
        </div>

        <SheetFooter className="flex-row justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            Keep it
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={confirm}
            disabled={pending}
          >
            {pending ? (
              <>
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
                Deleting
              </>
            ) : (
              'Delete permanently'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
