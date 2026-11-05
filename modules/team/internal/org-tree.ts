import { USER_ROLES } from '@/shared/tracker/enums';
import type { UserRole } from '@/types/tracker';

/**
 * The org chart's shapes and tree builder (migration 65). Pure and
 * client-safe, so the tree can be tested without a database.
 */

/** Today's attendance, coarse on purpose: every member sees it. */
export type TodayStatus = 'in' | 'half_day' | 'away' | 'not_recorded';
export const TODAY_STATUSES = ['in', 'half_day', 'away', 'not_recorded'] as const satisfies readonly TodayStatus[];

export interface OrgPerson {
  id: string;
  fullName: string;
  employeeId: string;
  role: UserRole;
  active: boolean;
  jobTitle: string | null;
  departmentId: string | null;
  department: string | null;
  reportsTo: string | null;
  /** Null for people without access. */
  today: TodayStatus | null;
}

export interface OrgChart {
  /** Today in India time, as the database read it. */
  date: string | null;
  people: OrgPerson[];
}

export interface OrgNode {
  person: OrgPerson;
  reports: OrgNode[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const id = (value: unknown): string | null => (typeof value === 'string' && UUID.test(value) ? value : null);

/** Reads `org_chart()`'s payload, dropping anything malformed. */
export function parseOrgChart(raw: unknown): OrgChart {
  if (!isRecord(raw) || !Array.isArray(raw.people)) return { date: null, people: [] };
  const people: OrgPerson[] = [];
  for (const row of raw.people) {
    if (!isRecord(row) || !id(row.id)) continue;
    const role = (USER_ROLES as readonly unknown[]).includes(row.role) ? (row.role as UserRole) : 'team_member';
    const today = (TODAY_STATUSES as readonly unknown[]).includes(row.today) ? (row.today as TodayStatus) : null;
    people.push({
      id: row.id as string,
      fullName: text(row.fullName) ?? 'Team member',
      employeeId: text(row.employeeId) ?? '',
      role,
      active: row.active !== false,
      jobTitle: text(row.jobTitle),
      departmentId: id(row.departmentId),
      department: text(row.department),
      reportsTo: id(row.reportsTo),
      today: row.active === false ? null : today,
    });
  }
  return { date: text(raw.date), people };
}

const ROLE_RANK = new Map(USER_ROLES.map((role, index) => [role, index]));
const byRoleThenName = (a: OrgNode, b: OrgNode) =>
  (ROLE_RANK.get(a.person.role) ?? 9) - (ROLE_RANK.get(b.person.role) ?? 9) || a.person.fullName.localeCompare(b.person.fullName);

/**
 * The chart as a forest of active people. A person sits under their manager;
 * when that manager has no access, under the nearest active manager above
 * (display only; the stored line is unchanged). People with no active manager
 * are roots. Loops cannot be stored, but a malformed one ends at the first
 * repeat. Siblings run managing directors first, then by name.
 */
export function buildOrgTree(people: readonly OrgPerson[]): OrgNode[] {
  const byId = new Map(people.map(person => [person.id, person]));
  const nodes = new Map<string, OrgNode>();
  for (const person of people) if (person.active) nodes.set(person.id, { person, reports: [] });

  const activeManager = (person: OrgPerson): string | null => {
    const seen = new Set<string>([person.id]);
    let next = person.reportsTo;
    while (next && !seen.has(next)) {
      seen.add(next);
      const manager = byId.get(next);
      if (!manager) return null;
      if (manager.active) return manager.id;
      next = manager.reportsTo;
    }
    return null;
  };

  const roots: OrgNode[] = [];
  for (const node of nodes.values()) {
    const manager = activeManager(node.person);
    const parent = manager ? nodes.get(manager) : undefined;
    if (parent) parent.reports.push(node);
    else roots.push(node);
  }
  const sort = (list: OrgNode[]) => {
    list.sort(byRoleThenName);
    for (const node of list) sort(node.reports);
  };
  sort(roots);
  return roots;
}

/** The chart's two tiers when the top of the chart would otherwise not be one tree. */
export interface OrgTiers {
  /** Top-level managing directors, shown side by side as one row; empty when the roots already form one tree. */
  leaders: OrgNode[];
  /** Everyone under that row: the leaders' reports and any other top-level person, or the roots unchanged. */
  below: OrgNode[];
  /** With two or more leaders: who each person directly under the row reports to (id -> manager's name). */
  managerOf: Map<string, string>;
  /** People under the row who have no active manager (they join the row so the chart stays connected). */
  noManager: Set<string>;
}

/**
 * The chart is always one connected tree (user decisions, 3 and 5 November
 * 2026). Two or more managing directors without a manager become one
 * leadership row; with a single director, people who have no manager would
 * otherwise stand apart as separate trees, so that director becomes the row.
 * Their reports plus every other top-level person form one level under it;
 * with several leaders each person names their own manager, and people with
 * no manager are listed in `noManager`. When the roots are already a single
 * tree (or there is no director at the top) they are returned unchanged.
 */
export function orgTiers(roots: readonly OrgNode[]): OrgTiers {
  const leaders = roots.filter(node => node.person.role === 'managing_director');
  const others = roots.filter(node => node.person.role !== 'managing_director');
  if (leaders.length === 0 || (leaders.length === 1 && others.length === 0)) {
    return { leaders: [], below: [...roots], managerOf: new Map(), noManager: new Set() };
  }
  const managerOf = new Map<string, string>();
  if (leaders.length > 1) {
    for (const leader of leaders) for (const report of leader.reports) managerOf.set(report.person.id, leader.person.fullName);
  }
  const below = [...leaders.flatMap(leader => leader.reports), ...others].sort(byRoleThenName);
  return {
    leaders: [...leaders].sort(byRoleThenName),
    below,
    managerOf,
    noManager: new Set(others.map(node => node.person.id)),
  };
}

/** The most cards one level of the chart shows side by side before it wraps. */
export const ORG_LEVEL_WIDTH = 4;

/**
 * Splits one level of the chart into rows of at most `width` cards (user
 * request, 5 November 2026: wide levels wrap instead of scrolling far
 * sideways). Rows are balanced, so five people read three and two, never four
 * and one. A level that fits is one row.
 */
export function levelRows<T>(items: readonly T[], width: number = ORG_LEVEL_WIDTH): T[][] {
  const size = Math.max(1, Math.floor(width));
  if (items.length <= size) return items.length ? [[...items]] : [];
  const rows = Math.ceil(items.length / size);
  const base = Math.floor(items.length / rows);
  const extra = items.length % rows;
  const out: T[][] = [];
  let start = 0;
  for (let row = 0; row < rows; row += 1) {
    const end = start + base + (row < extra ? 1 : 0);
    out.push(items.slice(start, end));
    start = end;
  }
  return out;
}

/** How many people are in a subtree, the person included. */
export function teamSize(node: OrgNode): number {
  return 1 + node.reports.reduce((sum, child) => sum + teamSize(child), 0);
}
