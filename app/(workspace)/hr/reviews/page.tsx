import type { Metadata } from 'next';

import { getReviewList, REVIEW_STATUSES, REVIEW_STATUS_LABELS } from '@/modules/hr';
import { HrTabs } from '@/modules/hr/components/hr-tabs';
import { ReviewList } from '@/modules/hr/components/review-list';
import { NewReview, ReviewMetrics } from '@/modules/hr/components/review-setup';
import { requireProfile } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';
import { MissionNotice, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'Performance reviews · HR' };

/**
 * Performance reviews (M19): the employee rates themselves on the managing
 * director's metrics and lists pros and areas to improve; the director then
 * adds their own rating. The director sees everyone's; others their own.
 */
export default async function ReviewsPage() {
  const profile = await requireProfile();
  const list = await getReviewList();
  const director = profile.role === 'managing_director';
  const today = kolkataDate();
  const monthTitle = `${new Date(`${today}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })} review`;
  const pending = list.ok ? list.data.reviews.filter(review => (director ? review.status === 'awaiting_md' : review.status === 'awaiting_self')).length : 0;

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="HR"
        title="Performance reviews"
        description={director
          ? 'Start a review, let each employee rate themselves, then add your own rating, pros and areas to improve.'
          : 'Rate your own performance on each metric and list your pros and areas to improve. The managing director then adds their rating.'}
        tabs={<HrTabs current="reviews" pending={pending} />}
      />
      {!list.ok ? (
        <MissionNotice tone="danger">{list.error}</MissionNotice>
      ) : director ? (
        <>
          {REVIEW_STATUSES.map(status => {
            const reviews = list.data.reviews.filter(review => review.status === status);
            return reviews.length ? (
              <section key={status} className="grid gap-2">
                <h2 className="text-foreground text-sm font-semibold">{REVIEW_STATUS_LABELS[status]} · {reviews.length}</h2>
                <ReviewList reviews={reviews} director />
              </section>
            ) : null;
          })}
          {list.data.reviews.length === 0 ? <ReviewList reviews={[]} director /> : null}
          <div className="grid gap-5 lg:gap-6 xl:grid-cols-2">
            <NewReview members={list.data.members} metrics={list.data.metrics} defaultTitle={monthTitle} />
            <ReviewMetrics metrics={list.data.metrics} />
          </div>
        </>
      ) : (
        <ReviewList reviews={list.data.reviews} director={false} />
      )}
    </MissionPage>
  );
}
