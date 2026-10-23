/**
 * Presentation helpers for the daily stars and monthly award section. Pure and
 * timezone-free: award dates are calendar dates (YYYY-MM-DD), so they are read
 * as UTC midnights and never shifted.
 */

// en-US short names ("Sep", "Thu"), as formatDate uses elsewhere.
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

function parse(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(value.getTime()) ? null : value;
}

/** "Thu 1 Oct" for a table row. Unparseable input is returned unchanged. */
export function awardDayLabel(date: string): string {
  const value = parse(date);
  if (!value) return date;
  return `${WEEKDAY.format(value)} ${value.getUTCDate()} ${MONTH.format(value)}`;
}

/**
 * Dates as short runs: consecutive days become "1–3 Oct", single days stay
 * "11 Oct", and a run across a month end reads "30 Sep – 2 Oct". Input order
 * and duplicates do not matter.
 */
export function awardDateRanges(dates: readonly string[]): string {
  const days = [...new Set(dates)].map(parse).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime());
  const runs: [Date, Date][] = [];
  for (const day of days) {
    const last = runs.at(-1);
    if (last && day.getTime() - last[1].getTime() === 86_400_000) last[1] = day;
    else runs.push([day, day]);
  }
  return runs.map(([from, to]) => {
    const toLabel = `${to.getUTCDate()} ${MONTH.format(to)}`;
    if (from.getTime() === to.getTime()) return toLabel;
    if (from.getUTCMonth() === to.getUTCMonth()) return `${from.getUTCDate()}–${toLabel}`;
    return `${from.getUTCDate()} ${MONTH.format(from)} – ${toLabel}`;
  }).join(', ');
}

/** A job error is a reason code (snake_case, optional ":detail") or free text. */
export function isReasonCode(value: string): boolean {
  return /^[a-z][a-z0-9_]*(:.*)?$/.test(value);
}

/* -------------------------------------------------------------------------- */
/* Day kinds, reason chips and grouping                                       */
/* -------------------------------------------------------------------------- */

/** What a day shows: a star, a decided day without one, a holiday, or why it is open. */
export type AwardDayKind = 'awarded' | 'no_winner' | 'holiday' | 'waiting' | 'queued' | 'failed';

/** The fields of an award day these helpers read (a subset of AwardDay). */
export interface AwardDayFacts {
  date: string;
  status: string;
  winnerId: string | null;
  reasons?: readonly string[] | null;
  jobStatus?: string | null;
}

const NO_WINNER_REASONS = new Set(['no_eligible_candidates', 'exact_highest_score_tie', 'no_regular_attendance_on_award_day']);

/**
 * One kind per day, in this order: a star wins over everything, then team
 * holidays, then decided-without-a-winner, failures, days waiting for data
 * (blocked, or open with reasons), and finally days only waiting to be run.
 */
export function awardDayKind(day: AwardDayFacts, holidays?: ReadonlySet<string> | null): AwardDayKind {
  if (day.status === 'completed_winner' && day.winnerId) return 'awarded';
  if (holidays?.has(day.date)) return 'holiday';
  if (day.status === 'completed_none') return 'no_winner';
  if (day.status === 'failed' || day.jobStatus === 'failed') return 'failed';
  const reasons = day.reasons ?? [];
  if (reasons.length && reasons.every(code => NO_WINNER_REASONS.has(code.split(':')[0]))) return 'no_winner';
  if (day.status === 'blocked' || reasons.length) return 'waiting';
  return 'queued';
}

/** Short reason groups shown as chips; `other` keeps its code for a label lookup. */
export type ReasonChipKey = 'attendance' | 'sales' | 'comparison' | 'history' | 'eligibility' | 'tie' | 'rules' | 'changed' | 'inputs' | 'other';
export interface ReasonChip { key: ReasonChipKey; code: string }

const GENERIC_INPUTS = new Set(['required_inputs_unavailable', 'shared_calculation_incomplete', 'raw_input_unavailable', 'input_unavailable', 'candidate_evidence_unavailable']);

function chipKey(code: string): ReasonChipKey {
  const key = code.split(':')[0];
  if (GENERIC_INPUTS.has(key)) return 'inputs';
  if (key.includes('attendance')) return 'attendance';
  if (key.includes('sales')) return 'sales';
  if (key.includes('tie')) return 'tie';
  if (key.includes('eligib') || key.startsWith('candidate_')) return 'eligibility';
  if (key.includes('median') || key.includes('cohort') || key.includes('population') || key.includes('excluded')) return 'comparison';
  if (key.includes('legacy') || key.includes('history') || key.includes('baseline')) return 'history';
  if (key.includes('unapproved') || key.includes('policy')) return 'rules';
  if (key.includes('invalidated') || key.includes('changed') || key.includes('mismatch')) return 'changed';
  return 'other';
}

/**
 * Reason codes as distinct chips in a fixed order. The generic "waiting for
 * required data" chip is dropped when a specific one says what is missing.
 */
export function reasonChips(codes: readonly string[] | null | undefined): ReasonChip[] {
  const order: ReasonChipKey[] = ['attendance', 'sales', 'comparison', 'eligibility', 'tie', 'history', 'rules', 'changed', 'other', 'inputs'];
  const byKey = new Map<string, ReasonChip>();
  for (const code of codes ?? []) {
    const key = chipKey(code);
    const id = key === 'other' ? `other:${code.split(':')[0]}` : key;
    if (!byKey.has(id)) byKey.set(id, { key, code: code.split(':')[0] });
  }
  const chips = [...byKey.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return chips.length > 1 ? chips.filter(chip => chip.key !== 'inputs') : chips;
}

export interface AwardDayGroup<D extends AwardDayFacts> {
  from: string;
  to: string;
  kind: AwardDayKind;
  chips: ReasonChip[];
  days: D[];
}

/**
 * Consecutive calendar days with the same kind and the same chips become one
 * group. Starred days always stand alone, since each has its own winner.
 */
export function groupAwardDays<D extends AwardDayFacts>(days: readonly D[], holidays?: ReadonlySet<string> | null): AwardDayGroup<D>[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const groups: AwardDayGroup<D>[] = [];
  for (const day of sorted) {
    const kind = awardDayKind(day, holidays);
    const chips = kind === 'waiting' || kind === 'no_winner' ? reasonChips(day.reasons) : [];
    const signature = chips.map(chip => `${chip.key}:${chip.code}`).join('|');
    const last = groups.at(-1);
    const next = last ? parse(last.to) : null;
    const current = parse(day.date);
    const adjacent = next && current && current.getTime() - next.getTime() === 86_400_000;
    if (last && adjacent && kind !== 'awarded' && last.kind === kind
        && last.chips.map(chip => `${chip.key}:${chip.code}`).join('|') === signature) {
      last.to = day.date;
      last.days.push(day);
    } else {
      groups.push({ from: day.date, to: day.date, kind, chips, days: [day] });
    }
  }
  return groups;
}

/** "Fri 2 – Sat 3 Oct" for a group; a single day reads as its day label. */
export function awardGroupLabel(from: string, to: string): string {
  if (from === to) return awardDayLabel(from);
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return `${from} – ${to}`;
  const start = a.getUTCMonth() === b.getUTCMonth()
    ? `${WEEKDAY.format(a)} ${a.getUTCDate()}`
    : awardDayLabel(from);
  return `${start} – ${awardDayLabel(to)}`;
}

/** Monday-first weekday index (0 = Monday) of a calendar date. */
export function mondayIndex(date: string): number {
  const value = parse(date);
  return value ? (value.getUTCDay() + 6) % 7 : 0;
}
