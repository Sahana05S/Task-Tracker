'use client';

import { useState } from 'react';
import { ClipboardPenIcon } from 'lucide-react';

import {
  averageScore,
  REVIEW_COMMENT_MAX,
  REVIEW_SUMMARY_MAX,
  SCORE_LABELS,
  toLines,
  type ReviewSheet,
} from '@/modules/hr/client';
import { Button } from '@/shared/ui/button';
import { MissionPanel } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

import { useReviewCommand } from './review-command';

type Side = 'self' | 'director';

/**
 * The review sheet to fill in. `self`: the employee scores each metric and
 * lists their pros and areas to improve, then submits. `director`: the
 * managing director sees the employee's side and adds their own rating,
 * pros, areas to improve and summary, then completes the review.
 */
export function ReviewEditor({ review, side }: { review: ReviewSheet; side: Side }) {
  const self = side === 'self';
  const [scores, setScores] = useState(() => review.ratings.map(rating => ({
    sort: rating.sort,
    score: self ? rating.selfScore : rating.mdScore,
    comment: self ? rating.selfComment : rating.mdComment,
  })));
  const [pros, setPros] = useState((self ? review.selfPros : review.mdPros).join('\n'));
  const [cons, setCons] = useState((self ? review.selfCons : review.mdCons).join('\n'));
  const [summary, setSummary] = useState(review.mdSummary);
  const { pending, send } = useReviewCommand();
  const unrated = scores.filter(entry => entry.score === null).length;
  const set = (sort: number, patch: Partial<{ score: number | null; comment: string }>) =>
    setScores(current => current.map(entry => (entry.sort === sort ? { ...entry, ...patch } : entry)));
  const submit = (finish: boolean) => send(
    {
      op: side,
      reviewId: review.id,
      version: review.version,
      payload: { ratings: scores, pros: toLines(pros), cons: toLines(cons), finish, ...(self ? {} : { summary }) },
    },
    finish ? (self ? 'Self-review submitted to the managing director.' : 'Review completed; the employee can now see it.') : 'Saved.',
  );

  return (
    <MissionPanel
      icon={ClipboardPenIcon}
      title={self ? 'Your self-review' : 'Your rating'}
      subtitle={self
        ? 'Score yourself from 1 to 5 on each metric and add a comment where it helps. Save as you go; once you submit, the managing director adds their rating.'
        : `Rate ${review.employeeName} on each metric. Their own scores are shown beside yours. They see your side once you complete the review.`}
      className="no-print"
    >
      <div className="grid gap-4">
        <ol className="grid gap-3">
          {review.ratings.map(rating => {
            const entry = scores.find(item => item.sort === rating.sort)!;
            return (
              <li key={rating.sort} className="border-border rounded-xl border p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-foreground font-semibold">{rating.metric}</span>
                  {!self ? (
                    <span className="text-muted-foreground text-xs">
                      Self: <span className="text-foreground font-semibold">{rating.selfScore ?? '—'}</span>
                      {rating.selfComment ? ` · “${rating.selfComment}”` : ''}
                    </span>
                  ) : null}
                </div>
                {rating.description ? <p className="text-muted-foreground mt-0.5 text-xs">{rating.description}</p> : null}
                <div role="radiogroup" aria-label={`${rating.metric} score`} className="mt-2.5 flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5].map(value => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={entry.score === value}
                      title={SCORE_LABELS[value]}
                      onClick={() => set(rating.sort, { score: entry.score === value ? null : value })}
                      className={cn(
                        'border-border min-h-10 min-w-10 rounded-lg border text-sm font-semibold tabular-nums transition-colors',
                        entry.score === value ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground hover:bg-muted',
                      )}
                    >
                      {value}
                    </button>
                  ))}
                  <span className="text-muted-foreground self-center pl-1 text-xs">{entry.score ? SCORE_LABELS[entry.score] : 'Not rated'}</span>
                </div>
                <input
                  className="field mt-2.5"
                  placeholder="Comment (optional)"
                  aria-label={`${rating.metric} comment`}
                  maxLength={REVIEW_COMMENT_MAX}
                  value={entry.comment}
                  onChange={event => set(rating.sort, { comment: event.target.value })}
                />
              </li>
            );
          })}
        </ol>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="field-label">
            Pros: strengths
            <textarea className="field min-h-28" placeholder="One per line" value={pros} onChange={event => setPros(event.target.value)} />
          </label>
          <label className="field-label">
            Cons: areas to improve
            <textarea className="field min-h-28" placeholder="One per line" value={cons} onChange={event => setCons(event.target.value)} />
          </label>
        </div>
        {!self ? (
          <label className="field-label">
            Summary
            <textarea className="field min-h-24" maxLength={REVIEW_SUMMARY_MAX} placeholder="Overall feedback and next steps" value={summary} onChange={event => setSummary(event.target.value)} />
          </label>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-muted-foreground text-xs">
            Average {averageScore(scores.map(entry => entry.score))?.toFixed(2) ?? '—'}
            {unrated ? ` · ${unrated} metric${unrated === 1 ? '' : 's'} not rated yet` : ''}
          </span>
          <span className="flex gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => submit(false)}>Save</Button>
            <Button type="button" disabled={pending || unrated > 0} onClick={() => submit(true)}>
              {self ? 'Submit to the director' : 'Complete review'}
            </Button>
          </span>
        </div>
      </div>
    </MissionPanel>
  );
}

/** The managing director's controls: send the review back a step, or withdraw it. */
export function ReviewAdminActions({ review }: { review: ReviewSheet }) {
  const { pending, send } = useReviewCommand();
  return (
    <div className="no-print flex flex-wrap gap-2">
      {review.status !== 'awaiting_self' ? (
        <Button type="button" variant="outline" size="sm" disabled={pending}
          onClick={() => send({ op: 'return', reviewId: review.id, version: review.version },
            review.status === 'completed' ? 'Review reopened.' : 'Sent back to the employee.')}>
          {review.status === 'completed' ? 'Reopen' : 'Send back to the employee'}
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="sm" disabled={pending}
        onClick={() => {
          if (window.confirm(`Withdraw "${review.title}" for ${review.employeeName}? It disappears for both of you.`)) {
            send({ op: 'withdraw', reviewId: review.id, version: review.version }, 'Review withdrawn.');
          }
        }}>
        Withdraw
      </Button>
    </div>
  );
}
