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

/** How many people are in a subtree, the person included. */
export function teamSize(node: OrgNode): number {
  return 1 + node.reports.reduce((sum, child) => sum + teamSize(child), 0);
}
