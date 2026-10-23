import { describe, expect, it } from 'vitest';

import { buildOrgTree, parseOrgChart, teamSize, type OrgNode, type OrgPerson } from '../client';

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
