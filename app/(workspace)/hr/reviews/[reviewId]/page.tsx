import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getReview } from '@/modules/hr';
import { PrintButton } from '@/modules/hr/components/print-button';
import { ReviewAdminActions, ReviewEditor } from '@/modules/hr/components/review-editor';
import { ReviewStatusBadge } from '@/modules/hr/components/review-list';
import { ReviewPaper } from '@/modules/hr/components/review-sheet';
import { getCompanySettings } from '@/modules/settings';
import { UUID_PATTERN } from '@/shared/forms/form-data';
import { requireProfile } from '@/shared/session/profile';
import { Breadcrumb } from '@/shared/ui/page-nav';
import { MissionNotice, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'Review · HR' };

/** One review: the form for whoever's turn it is, and the sheet on the letterhead. */
export default async function ReviewPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const profile = await requireProfile();
  const { reviewId } = await params;
  if (!UUID_PATTERN.test(reviewId)) notFound();
  const [review, settings] = await Promise.all([getReview(reviewId), getCompanySettings()]);
  if (!review.ok && review.reason === 'not_found') notFound();
  if (!review.ok) return <MissionPage><MissionNotice tone="danger">{review.error}</MissionNotice></MissionPage>;
  const sheet = review.data;
  const director = profile.role === 'managing_director';
  const own = sheet.employeeId === profile.id;
  const turn = own && sheet.status === 'awaiting_self' ? 'self' : director && sheet.status === 'awaiting_md' ? 'director' : null;

  return (
    <MissionPage>
      <MissionPageHeader
        breadcrumb={<Breadcrumb back={{ href: '/hr/reviews', label: 'Back to reviews' }} items={[{ label: 'HR', href: '/hr/documents' }, { label: 'Reviews', href: '/hr/reviews' }, { label: sheet.employeeCode, tag: true }]} />}
        title={director && !own ? sheet.employeeName : sheet.title}
        description={director && !own ? sheet.title : undefined}
        meta={<ReviewStatusBadge status={sheet.status} />}
        actions={<>{director ? <ReviewAdminActions review={sheet} /> : null}<PrintButton /></>}
      />
      {turn ? <ReviewEditor review={sheet} side={turn} /> : null}
      {own && !director && sheet.status === 'awaiting_md' ? (
        <MissionNotice className="no-print">You submitted your self-review. The managing director&apos;s rating appears here once the review is completed.</MissionNotice>
      ) : null}
      {director && sheet.status === 'awaiting_self' && !own ? (
        <MissionNotice className="no-print">{sheet.employeeName} has not submitted their self-review yet. You can rate them once they do.</MissionNotice>
      ) : null}
      <ReviewPaper review={sheet} branding={settings.branding} letterhead={settings.letterhead} />
    </MissionPage>
  );
}
