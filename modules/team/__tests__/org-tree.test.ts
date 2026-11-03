import { describe, expect, it } from 'vitest';

import { buildOrgTree, orgTiers, parseOrgChart, teamSize, type OrgNode, type OrgPerson } from '../client';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function person(n: number, fields: Partial<OrgPerson> = {}): OrgPerson {
  return {
    id: uuid(n),
    fullName: `Person ${n}`,
    employeeId: `E-${n}`,
    role: 'team_member',
    active: true,
    jobTitle: null,
    departmentId: null,
    department: null,
    reportsTo: null,
    today: 'not_recorded',
    ...fields,
  };
}

/** The tree as nested names, for readable expectations. */
const shape = (nodes: OrgNode[]): unknown => nodes.map(node => (node.reports.length ? { [node.person.fullName]: shape(node.reports) } : node.person.fullName));

describe('buildOrgTree', () => {
  it('hangs people under their managers, directors first and then by name', () => {
    const tree = buildOrgTree([
      person(3, { fullName: 'Cara', reportsTo: uuid(1) }),
      person(2, { fullName: 'Bala', reportsTo: uuid(1), role: 'project_engineer' }),
      person(4, { fullName: 'Arun', reportsTo: uuid(1) }),
      person(1, { fullName: 'Meera', role: 'managing_director' }),
      person(5, { fullName: 'Devi', reportsTo: uuid(2) }),
    ]);
    expect(shape(tree)).toEqual([{ Meera: [{ Bala: ['Devi'] }, 'Arun', 'Cara'] }]);
    expect(teamSize(tree[0])).toBe(5);
  });

  it('places someone whose manager has left under the nearest active manager above', () => {
    const tree = buildOrgTree([
      person(1, { fullName: 'Top', role: 'managing_director' }),
      person(2, { fullName: 'Gone', reportsTo: uuid(1), active: false }),
      person(3, { fullName: 'Also gone', reportsTo: uuid(2), active: false }),
      person(4, { fullName: 'Kept', reportsTo: uuid(3) }),
    ]);
    expect(shape(tree)).toEqual([{ Top: ['Kept'] }]);
  });

  it('makes roots of people with no manager, an unknown one or only inactive ones', () => {
    const tree = buildOrgTree([
      person(1, { fullName: 'A' }),
      person(2, { fullName: 'B', reportsTo: uuid(99) }),
      person(3, { fullName: 'C', reportsTo: uuid(4) }),
      person(4, { fullName: 'D', active: false }),
    ]);
    expect(shape(tree)).toEqual(['A', 'B', 'C']);
  });

  it('follows a deep chain', () => {
    const people = Array.from({ length: 30 }, (_, i) => person(i + 1, { reportsTo: i ? uuid(i) : null }));
    const tree = buildOrgTree(people);
    expect(tree).toHaveLength(1);
    expect(teamSize(tree[0])).toBe(30);
  });

  it('stops at a malformed loop instead of hanging', () => {
    const tree = buildOrgTree([
      person(1, { fullName: 'A', reportsTo: uuid(3), active: false }),
      person(2, { fullName: 'B', reportsTo: uuid(1) }),
      person(3, { fullName: 'C', reportsTo: uuid(1), active: false }),
    ]);
    expect(shape(tree)).toEqual(['B']);
  });
});

describe('orgTiers', () => {
  const names = (nodes: OrgNode[]) => nodes.map(node => node.person.fullName);

  it('leaves a company with one managing director as it was', () => {
    const roots = buildOrgTree([
      person(1, { fullName: 'Meera', role: 'managing_director' }),
      person(2, { fullName: 'Arun', reportsTo: uuid(1) }),
    ]);
    const tiers = orgTiers(roots);
    expect(tiers.leaders).toEqual([]);
    expect(shape(tiers.below)).toEqual([{ Meera: ['Arun'] }]);
    expect(tiers.managerOf.size).toBe(0);
  });

  it('puts two directors in one row and their reports in one level under it (user report, 3 Nov 2026)', () => {
    const roots = buildOrgTree([
      person(1, { fullName: 'Harish', role: 'managing_director' }),
      person(2, { fullName: 'Aishwarya', role: 'managing_director' }),
      person(3, { fullName: 'Vijay', role: 'project_engineer', reportsTo: uuid(1) }),
      person(4, { fullName: 'Kavi', role: 'data_manager', reportsTo: uuid(1) }),
      person(5, { fullName: 'Sahana', reportsTo: uuid(1) }),
      person(6, { fullName: 'Devi', reportsTo: uuid(5) }),
    ]);
    const tiers = orgTiers(roots);
    expect(names(tiers.leaders)).toEqual(['Aishwarya', 'Harish']);
    expect(shape(tiers.below)).toEqual(['Vijay', 'Kavi', { Sahana: ['Devi'] }]);
    expect(tiers.managerOf.get(uuid(3))).toBe('Harish');
    expect(tiers.managerOf.has(uuid(6))).toBe(false);
    // Each director's card still counts only their own people.
    expect(tiers.leaders.map(teamSize)).toEqual([1, 5]);
  });

  it('shows both directors\' reports together, each naming their own manager', () => {
    const roots = buildOrgTree([
      person(1, { fullName: 'Harish', role: 'managing_director' }),
      person(2, { fullName: 'Aishwarya', role: 'managing_director' }),
      person(3, { fullName: 'Zara', reportsTo: uuid(2) }),
      person(4, { fullName: 'Bala', reportsTo: uuid(1) }),
    ]);
    const tiers = orgTiers(roots);
    expect(names(tiers.below)).toEqual(['Bala', 'Zara']);
    expect(tiers.managerOf.get(uuid(3))).toBe('Aishwarya');
    expect(tiers.managerOf.get(uuid(4))).toBe('Harish');
  });

  it('keeps other top-level people (a cleared manager) under the row, with no manager named', () => {
    const roots = buildOrgTree([
      person(1, { fullName: 'Harish', role: 'managing_director' }),
      person(2, { fullName: 'Aishwarya', role: 'managing_director' }),
      person(3, { fullName: 'Loose' }),
    ]);
    const tiers = orgTiers(roots);
    expect(names(tiers.leaders)).toEqual(['Aishwarya', 'Harish']);
    expect(names(tiers.below)).toEqual(['Loose']);
    expect(tiers.managerOf.has(uuid(3))).toBe(false);
  });

  it('treats an inactive director as gone: their people move up and one director remains', () => {
    const roots = buildOrgTree([
      person(1, { fullName: 'Harish', role: 'managing_director' }),
      person(2, { fullName: 'Old', role: 'managing_director', active: false }),
      person(3, { fullName: 'Kept', reportsTo: uuid(2) }),
    ]);
    const tiers = orgTiers(roots);
    expect(tiers.leaders).toEqual([]);
    expect(names(tiers.below)).toEqual(['Harish', 'Kept']);
  });
});

describe('parseOrgChart', () => {
  it('keeps well-formed people and clears status for inactive ones', () => {
    const chart = parseOrgChart({
      date: '2026-10-23',
      people: [
        { id: uuid(1), fullName: 'A', employeeId: 'E-1', role: 'data_manager', active: true, today: 'in', reportsTo: 'nope' },
        { id: uuid(2), fullName: 'B', role: 'owner', active: false, today: 'in' },
        { id: 'bad' },
        null,
      ],
    });
    expect(chart.date).toBe('2026-10-23');
    expect(chart.people).toHaveLength(2);
    expect(chart.people[0]).toMatchObject({ role: 'data_manager', today: 'in', reportsTo: null });
    expect(chart.people[1]).toMatchObject({ role: 'team_member', active: false, today: null });
  });

  it('returns an empty chart for anything else', () => {
    expect(parseOrgChart(null)).toEqual({ date: null, people: [] });
  });
});
