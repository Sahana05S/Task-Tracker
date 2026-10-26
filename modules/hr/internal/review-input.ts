import { readString, UUID_PATTERN } from '@/shared/forms/form-data';
import type { Json } from '@/types/database';

import type { ReviewOp } from './reviews';
import { REVIEW_COMMENT_MAX, REVIEW_LINE_LENGTH, REVIEW_LINES_MAX, REVIEW_SUMMARY_MAX } from './rules';

/**
 * Parses a performance review form: `op`, `reviewId`, `version`,
 * `operationId` and the `payload` JSON. PRIVATE. Friendly checks only;
 * `performance_review_command` repeats every one.
 */

export interface ReviewInput {
  op: ReviewOp;
  reviewId: string | null;
  payload: { [key: string]: Json };
  expectedVersion: number;
  operationId: string;
}

type Parsed = { ok: true; value: ReviewInput } | { ok: false; error: string };

const OPS: readonly ReviewOp[] = ['create', 'self', 'director', 'return', 'withdraw', 'metric'];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function lines(value: unknown, label: string): string[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > REVIEW_LINES_MAX) return `Keep ${label} to ${REVIEW_LINES_MAX} lines.`;
  const kept = value.map(text).filter(Boolean);
  return kept.some(line => line.length > REVIEW_LINE_LENGTH) ? `Keep each line of ${label} under ${REVIEW_LINE_LENGTH} characters.` : kept;
}

function ratings(value: unknown): Json[] | string {
  if (!Array.isArray(value)) return 'The ratings could not be read.';
  const parsed: Json[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !Number.isInteger(entry.sort)) return 'The ratings could not be read.';
    const score = entry.score === null || entry.score === undefined ? null : Number(entry.score);
    if (score !== null && (!Number.isInteger(score) || score < 1 || score > 5)) return 'Scores go from 1 to 5.';
    const comment = text(entry.comment);
    if (comment.length > REVIEW_COMMENT_MAX) return `Keep each comment under ${REVIEW_COMMENT_MAX} characters.`;
    parsed.push({ sort: entry.sort as number, score, comment });
  }
  return parsed;
}

export function parseReviewInput(form: FormData): Parsed {
  const op = readString(form, 'op') as ReviewOp;
  const reviewId = readString(form, 'reviewId') || null;
  const expectedVersion = Number(readString(form, 'version') || '0');
  const operationId = readString(form, 'operationId');
  if (!OPS.includes(op) || !UUID_PATTERN.test(operationId) || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return { ok: false, error: 'Reload the page and try again.' };
  }
  if (!['create', 'metric'].includes(op) && (!reviewId || !UUID_PATTERN.test(reviewId))) return { ok: false, error: 'Unknown review.' };
  let raw: unknown;
  try { raw = JSON.parse(readString(form, 'payload') || '{}'); } catch { return { ok: false, error: 'The form could not be read.' }; }
  if (!isRecord(raw)) return { ok: false, error: 'The form could not be read.' };

  const done = (payload: { [key: string]: Json }): Parsed => ({ ok: true, value: { op, reviewId, payload, expectedVersion, operationId } });
  switch (op) {
    case 'create': {
      const employeeIds = Array.isArray(raw.employeeIds) ? raw.employeeIds.map(text).filter(id => UUID_PATTERN.test(id)) : [];
      const metricIds = Array.isArray(raw.metricIds) ? raw.metricIds.map(text).filter(id => UUID_PATTERN.test(id)) : [];
      const title = text(raw.title);
      if (!employeeIds.length) return { ok: false, error: 'Choose at least one employee.' };
      if (!metricIds.length) return { ok: false, error: 'Choose at least one metric.' };
      if (!title || title.length > 120) return { ok: false, error: 'Give the review a title of up to 120 characters.' };
      return done({ employeeIds, metricIds, title });
    }
    case 'self':
    case 'director': {
      const parsedRatings = ratings(raw.ratings);
      const pros = lines(raw.pros, 'the pros'), cons = lines(raw.cons, 'the areas to improve');
      for (const value of [parsedRatings, pros, cons]) if (typeof value === 'string') return { ok: false, error: value };
      const finish = raw.finish === true;
      if (op === 'self') return done({ ratings: parsedRatings as Json[], pros: pros as string[], cons: cons as string[], submit: finish });
      const summary = text(raw.summary);
      if (summary.length > REVIEW_SUMMARY_MAX) return { ok: false, error: `Keep the summary under ${REVIEW_SUMMARY_MAX} characters.` };
      return done({ ratings: parsedRatings as Json[], pros: pros as string[], cons: cons as string[], summary, complete: finish });
    }
    case 'metric': {
      const name = text(raw.name), description = text(raw.description);
      if (!name || name.length > 60) return { ok: false, error: 'Give the metric a name of up to 60 characters.' };
      if (description.length > 200) return { ok: false, error: 'Keep the description under 200 characters.' };
      const payload: { [key: string]: Json } = { name, description, active: raw.active !== false };
      if (UUID_PATTERN.test(text(raw.id))) payload.id = text(raw.id);
      if (Number.isInteger(raw.sort) && (raw.sort as number) >= 0) payload.sort = Math.min(raw.sort as number, 1000);
      return done(payload);
    }
    default:
      return done({});
  }
}
