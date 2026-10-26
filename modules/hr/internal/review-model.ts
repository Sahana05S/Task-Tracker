import { REVIEW_STATUSES, type ReviewStatus } from './rules';

/** Performance review payloads (migration 81) -> domain types. PRIVATE; types re-exported through `client.ts`. */

export interface ReviewSummary {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  title: string;
  status: ReviewStatus;
  createdAt: string;
  completedAt: string | null;
  selfAverage: number | null;
  /** The director's average: the director always, the employee once completed. */
  mdAverage: number | null;
}

export interface ReviewMetric {
  id: string;
  name: string;
  description: string;
  active: boolean;
  sort: number;
}

export interface ReviewMember {
  id: string;
  employeeCode: string;
  fullName: string;
}

export interface ReviewList {
  director: boolean;
  reviews: ReviewSummary[];
  /** Managing director only. */
  metrics: ReviewMetric[];
  /** Managing director only: active members to review. */
  members: ReviewMember[];
}

export interface ReviewRating {
  sort: number;
  metric: string;
  description: string;
  selfScore: number | null;
  selfComment: string;
  mdScore: number | null;
  mdComment: string;
}

export interface ReviewSheet {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  jobTitle: string | null;
  title: string;
  status: ReviewStatus;
  version: number;
  createdAt: string;
  selfSubmittedAt: string | null;
  completedAt: string | null;
  selfPros: string[];
  selfCons: string[];
  /** False for the employee until the review is completed. */
  mdVisible: boolean;
  mdPros: string[];
  mdCons: string[];
  mdSummary: string;
  ratings: ReviewRating[];
}

type Row = Record<string, unknown>;
const object = (value: unknown): Row => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Row : {});
const list = (value: unknown): Row[] => (Array.isArray(value) ? value.map(object) : []);
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const optional = (value: unknown) => (typeof value === 'string' ? value : null);
const score = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const lines = (value: unknown) => (Array.isArray(value) ? value.filter((line): line is string => typeof line === 'string') : []);
const status = (value: unknown): ReviewStatus => ((REVIEW_STATUSES as readonly unknown[]).includes(value) ? value as ReviewStatus : 'awaiting_self');

export function mapReviewList(data: unknown): ReviewList {
  const value = object(data);
  return {
    director: value.director === true,
    reviews: list(value.reviews).map(row => ({
      id: text(row.id), employeeId: text(row.employeeId), employeeCode: text(row.employeeCode), employeeName: text(row.employeeName),
      title: text(row.title), status: status(row.status), createdAt: text(row.createdAt), completedAt: optional(row.completedAt),
      selfAverage: score(row.selfAverage), mdAverage: score(row.mdAverage),
    })),
    metrics: list(value.metrics).map(row => ({
      id: text(row.id), name: text(row.name), description: text(row.description), active: row.active !== false, sort: Number(row.sort ?? 0),
    })),
    members: list(value.members).map(row => ({ id: text(row.id), employeeCode: text(row.employeeCode), fullName: text(row.fullName) })),
  };
}

export function mapReview(data: unknown): ReviewSheet {
  const value = object(data);
  return {
    id: text(value.id), employeeId: text(value.employeeId), employeeCode: text(value.employeeCode), employeeName: text(value.employeeName),
    jobTitle: optional(value.jobTitle), title: text(value.title), status: status(value.status), version: Number(value.version ?? 0),
    createdAt: text(value.createdAt), selfSubmittedAt: optional(value.selfSubmittedAt), completedAt: optional(value.completedAt),
    selfPros: lines(value.selfPros), selfCons: lines(value.selfCons),
    mdVisible: value.mdVisible === true, mdPros: lines(value.mdPros), mdCons: lines(value.mdCons), mdSummary: text(value.mdSummary),
    ratings: list(value.ratings).map(row => ({
      sort: Number(row.sort ?? 0), metric: text(row.metric), description: text(row.description),
      selfScore: score(row.selfScore), selfComment: text(row.selfComment), mdScore: score(row.mdScore), mdComment: text(row.mdComment),
    })),
  };
}
