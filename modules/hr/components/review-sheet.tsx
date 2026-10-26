import { averageScore, REVIEW_STATUS_LABELS, SCORE_LABELS, type ReviewSheet } from '@/modules/hr/client';
import type { CompanyBranding, CompanyLetterhead } from '@/modules/settings/client';
import { formatDate } from '@/shared/tracker/format';

import { Letterhead } from './letterhead';

const dateOf = (value: string | null) => (value ? formatDate(value.slice(0, 10)) : '—');
const avg = (value: number | null) => (value === null ? '—' : value.toFixed(2));

/**
 * The review on the company letterhead, to read and to download as PDF: the
 * rating table (self and director scores per metric), the pros and cons
 * template for both sides, the summary and signature lines. The director's
 * columns stay blank until the employee may see them.
 */
export function ReviewPaper({ review, branding, letterhead }: { review: ReviewSheet; branding: CompanyBranding; letterhead: CompanyLetterhead }) {
  const md = review.mdVisible;
  return (
    <Letterhead branding={branding} letterhead={letterhead} footer={`${review.title} · ${REVIEW_STATUS_LABELS[review.status]}`}>
      <h1 className="!mt-0 mb-1 text-center text-[14pt] font-bold tracking-wide uppercase">Performance review</h1>
      <p className="paper-muted mb-4 text-center text-[9.5pt]">{review.title}</p>
      <table className="mb-5 text-[9.5pt]">
        <tbody>
          <tr><th className="w-1/4">Employee</th><td>{review.employeeName} ({review.employeeCode})</td><th className="w-1/5">Started</th><td>{dateOf(review.createdAt)}</td></tr>
          <tr><th>Role</th><td>{review.jobTitle ?? '—'}</td><th>Completed</th><td>{dateOf(review.completedAt)}</td></tr>
        </tbody>
      </table>

      <h2>Review sheet</h2>
      <table className="text-[9.5pt]">
        <thead>
          <tr>
            <th className="w-[26%]">Metric</th>
            <th className="w-[9%] text-center">Self</th>
            <th>Employee&apos;s comment</th>
            <th className="w-[9%] text-center">Director</th>
            <th>Director&apos;s comment</th>
          </tr>
        </thead>
        <tbody>
          {review.ratings.map(rating => (
            <tr key={rating.sort} className="paper-avoid-break">
              <td className="font-semibold">{rating.metric}</td>
              <td className="text-center font-semibold">{rating.selfScore ?? ''}</td>
              <td>{rating.selfComment}</td>
              <td className="text-center font-semibold">{md ? rating.mdScore ?? '' : ''}</td>
              <td>{md ? rating.mdComment : ''}</td>
            </tr>
          ))}
          <tr>
            <th>Average</th>
            <th className="text-center">{avg(averageScore(review.ratings.map(rating => rating.selfScore)))}</th>
            <th />
            <th className="text-center">{md ? avg(averageScore(review.ratings.map(rating => rating.mdScore))) : ''}</th>
            <th />
          </tr>
        </tbody>
      </table>
      <p className="paper-muted mt-1 text-[8pt]">Scale: {[1, 2, 3, 4, 5].map(score => `${score} ${SCORE_LABELS[score]}`).join(' · ')}</p>

      <h2>Pros and cons</h2>
      <table className="text-[9.5pt]">
        <thead>
          <tr><th className="w-[18%]" /><th className="w-[41%]">Pros: strengths</th><th>Cons: areas to improve</th></tr>
        </thead>
        <tbody>
          <ProsConsRow label="Employee" pros={review.selfPros} cons={review.selfCons} />
          <ProsConsRow label="Director" pros={md ? review.mdPros : []} cons={md ? review.mdCons : []} />
        </tbody>
      </table>

      <h2>Director&apos;s summary</h2>
      <p className="min-h-[18mm] whitespace-pre-line">{md ? review.mdSummary : ''}</p>

      <div className="paper-avoid-break mt-10 grid grid-cols-2 gap-8 text-[9.5pt]">
        <p className="paper-rule border-t pt-1">Employee signature and date</p>
        <p className="paper-rule border-t pt-1">Managing director signature and date</p>
      </div>
    </Letterhead>
  );
}

function ProsConsRow({ label, pros, cons }: { label: string; pros: readonly string[]; cons: readonly string[] }) {
  const list = (items: readonly string[]) => (items.length ? <ul className="!mb-0">{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <div className="min-h-[14mm]" />);
  return (
    <tr className="paper-avoid-break">
      <th>{label}</th>
      <td>{list(pros)}</td>
      <td>{list(cons)}</td>
    </tr>
  );
}
