'use client';

import * as React from 'react';
import Link from 'next/link';
import { CircleAlertIcon, CircleCheckIcon, ClockIcon, ExternalLinkIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Field } from '@/shared/ui/form-field';
import { Textarea } from '@/shared/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/shared/ui/sheet';
import { cn } from '@/shared/utils';
import { checklistWorkHref } from '../internal/location';
import {
  NO_REVIEWS,
  REVIEW_NOTE_MAX,
  canDecideObjective,
  reviewChip,
  reviewsByNode,
  type ObjectiveReview,
  type ObjectiveReviews,
  type ReviewChipTone,
} from '../internal/review';
import { ChecklistVersionField } from './checklist-state-control';
import type { ActionResponse } from '@/types/tracker';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

interface ReviewContextValue {
  taskId: string;
  version: number;
  action: Command;
  data: ObjectiveReviews;
  byNode: ReadonlyMap<string, ObjectiveReview>;
  names: Readonly<Record<string, string>>;
}

const ReviewContext = React.createContext<ReviewContextValue | null>(null);

/**
 * Objective reviews for a mission (migration 114), so each checklist view only
 * places an `ObjectiveReviewChip` beside a row's tick.
 */
export function ObjectiveReviewProvider({ taskId, version, action, reviews, names, children }: {
  taskId: string;
  version: number;
  action: Command;
  reviews?: ObjectiveReviews;
  names?: Readonly<Record<string, string>>;
  children: React.ReactNode;
}) {
  const data = reviews ?? NO_REVIEWS;
  const value = React.useMemo<ReviewContextValue>(
    () => ({ taskId, version, action, data, byNode: reviewsByNode(data), names: names ?? {} }),
    [taskId, version, action, data, names],
  );
  return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}

const TONE: Record<ReviewChipTone, string> = {
  attention: 'border-attention-border bg-attention-subtle text-attention-foreground',
  success: 'border-success/30 bg-success-subtle text-success-strong',
  danger: 'border-danger-border bg-danger-subtle text-danger-foreground',
};
const ICON: Record<ReviewChipTone, typeof ClockIcon> = { attention: ClockIcon, success: CircleCheckIcon, danger: CircleAlertIcon };
const CHIP = 'inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap';

/** The review chip beside an objective's tick: Pending, Acknowledged or Work needed. Reviewers open it to decide. */
export function ObjectiveReviewChip({ nodeId, className }: { nodeId: string; className?: string }) {
  const ctx = React.useContext(ReviewContext);
  const review = ctx?.byNode.get(nodeId);
  if (!ctx || !review) return null;
  const chip = reviewChip(review, review.reviewedBy ? ctx.names[review.reviewedBy] : null);
  if (!chip) return null;
  const Icon = ICON[chip.tone];
  const body = (
    <>
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      {chip.label}
    </>
  );
  if (!canDecideObjective(review, ctx.data)) {
    return <span className={cn(CHIP, TONE[chip.tone], className)} title={chip.description}>{body}<span className="sr-only">. {chip.description}</span></span>;
  }
  return (
    <ObjectiveReviewSheet review={review} trigger={(
      <button type="button" className={cn(CHIP, TONE[chip.tone], className, 'focus-visible:ring-ring cursor-pointer outline-none hover:opacity-90 focus-visible:ring-2')} aria-label={`Review ${review.title}: ${chip.description}`}>
        {body}
      </button>
    )} />
  );
}

/** The review sheet: Acknowledge, or Work needed with a note (required). */
function ObjectiveReviewSheet({ review, trigger }: { review: ObjectiveReview; trigger: React.ReactElement }) {
  const ctx = React.useContext(ReviewContext)!;
  const [open, setOpen] = React.useState(false);
  const ticker = review.completedBy ? ctx.names[review.completedBy] : null;
  const hidden = (decision: 'acknowledged' | 'work_needed') => (
    <>
      <input type="hidden" name="command" value="review" />
      <input type="hidden" name="decision" value={decision} />
      <input type="hidden" name="checklist_id" value={review.checklistId} />
      <input type="hidden" name="taskId" value={ctx.taskId} />
      <input type="hidden" name="node_id" value={review.nodeId} />
      <ChecklistVersionField fallback={ctx.version} />
    </>
  );
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="pr-12">
          <p className="text-muted-foreground text-xs font-semibold">Objective review</p>
          <SheetTitle className="text-foreground text-lg font-bold tracking-tight break-words">{review.title}</SheetTitle>
          <SheetDescription className="text-muted-foreground">
            {ticker ? `${ticker} ticked this Yes.` : 'Ticked Yes.'} Acknowledge it, or send it back with what is needed.
          </SheetDescription>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-5 py-5">
          <ExecutionForm action={ctx.action} scope={`review:${review.nodeId}:acknowledged`} onSuccess={close}>
            {hidden('acknowledged')}
            <div className="grid gap-3">
              <Field id={`ack-${review.nodeId}`} label="Note (optional)">
                <Textarea id={`ack-${review.nodeId}`} name="note" rows={2} maxLength={REVIEW_NOTE_MAX} />
              </Field>
              <Button type="submit" className="justify-self-start">
                <CircleCheckIcon aria-hidden="true" />Acknowledge
              </Button>
            </div>
          </ExecutionForm>
          <ExecutionForm action={ctx.action} scope={`review:${review.nodeId}:work_needed`} onSuccess={close}>
            {hidden('work_needed')}
            <div className="grid gap-3">
              <Field id={`work-${review.nodeId}`} label="What work is needed" required>
                <Textarea id={`work-${review.nodeId}`} name="note" rows={3} required maxLength={REVIEW_NOTE_MAX} />
              </Field>
              <p className="text-muted-foreground text-xs">The tick goes back to No and the people on the mission are told.</p>
              <Button type="submit" variant="outline" className="justify-self-start">
                <CircleAlertIcon aria-hidden="true" />Work needed
              </Button>
            </div>
          </ExecutionForm>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Objectives waiting for this reviewer, for the mission page's "Your review is requested". */
export function ObjectiveReviewQueue({ taskTag, reviews }: { taskTag: string; reviews: readonly ObjectiveReview[] }) {
  if (!reviews.length) return null;
  return (
    <div className="mb-4 grid gap-2">
      <p className="text-foreground text-sm font-semibold">
        {reviews.length === 1 ? '1 objective waits' : `${reviews.length} objectives wait`} for your review
      </p>
      <ul className="grid gap-1.5">
        {reviews.map((review) => (
          <li key={review.nodeId} className="bg-card flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2">
            <span className="text-foreground min-w-0 flex-1 truncate text-sm">{review.title}</span>
            <Link
              href={checklistWorkHref(taskTag, { checklistId: review.checklistId, parentNodeId: review.parentNodeId ?? undefined, section: review.section ?? 'activity' })}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label={`Open ${review.title} in the checklist`}
            >
              <ExternalLinkIcon className="size-4" aria-hidden="true" />
            </Link>
            <ObjectiveReviewChip nodeId={review.nodeId} />
          </li>
        ))}
      </ul>
    </div>
  );
}
