// PUBLIC client-safe exports of the hr module: types and pure rules only.
export {
  CONDUCT_BODY_MAX,
  CONDUCT_TITLE_MAX,
  conductBlocks,
  DEFAULT_CONDUCT_BODY,
  DEFAULT_CONDUCT_TITLE,
  averageScore,
  REVIEW_COMMENT_MAX,
  REVIEW_LINE_LENGTH,
  REVIEW_LINES_MAX,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUSES,
  REVIEW_SUMMARY_MAX,
  SCORE_LABELS,
  toLines,
  type ConductBlock,
  type ReviewStatus,
} from '@/modules/hr/internal/rules';
export type { ReviewList, ReviewMember, ReviewMetric, ReviewRating, ReviewSheet, ReviewSummary } from '@/modules/hr/internal/review-model';
export type { CodeOfConduct, ConductAcknowledgement, ConductVersion } from '@/modules/hr/internal/conduct';
