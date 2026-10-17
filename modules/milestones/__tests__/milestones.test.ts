import { describe, expect, it } from 'vitest';
import {
  findStatement,
  isShowcaseStatementKey,
  parseCoreValues,
  SHOWCASE_STATEMENT_KEYS,
} from '@/modules/milestones/internal/statements';
import {
  milestoneCompletion,
  openMilestoneCount,
  sortMilestones,
  summariseMilestones,
} from '@/modules/milestones/internal/goals';
import type { CompanyMilestone, CompanyStatement } from '@/types/tracker';


/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function makeMilestone(overrides: Partial<CompanyMilestone> & { id: string }): CompanyMilestone {
  return {
    id: overrides.id,
    title: overrides.title ?? `Milestone ${overrides.id}`,
    description: overrides.description ?? null,
    status: overrides.status ?? 'Planned',
    ownerId: overrides.ownerId ?? null,
    deliveredCount: overrides.deliveredCount ?? 0,
    targetCount: overrides.targetCount ?? null,
    dueDate: overrides.dueDate ?? null,
    createdAt: overrides.createdAt ?? '2026-09-01T00:00:00Z',
  };
}

function makeStatement(overrides: Partial<CompanyStatement> & { id: string; keyName: string }): CompanyStatement {
  return {
    id: overrides.id,
    keyName: overrides.keyName,
    title: overrides.title ?? 'Title',
    statement: overrides.statement ?? 'Statement text',
    subtext: overrides.subtext ?? null,
    updatedAt: overrides.updatedAt ?? '2026-09-01T00:00:00Z',
    updatedBy: overrides.updatedBy ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* parseCoreValues                                                             */
/* -------------------------------------------------------------------------- */

describe('parseCoreValues', () => {
  it('parses Name: description lines', () => {
    const result = parseCoreValues('Integrity: We do the right thing\nCollaboration: We work together');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'Integrity', description: 'We do the right thing' });
    expect(result[1]).toEqual({ name: 'Collaboration', description: 'We work together' });
  });

  it('handles a bare name with no colon as name-only', () => {
    const result = parseCoreValues('Integrity');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: 'Integrity', description: null });
  });

  it('handles a line that starts with a colon (no name)', () => {
    const result = parseCoreValues(': Leading colon line');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: 'Leading colon line', description: null });
  });

  it('splits only on the first colon, leaving later colons in the description', () => {
    const result = parseCoreValues('Time: 09:00 daily standup');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: 'Time', description: '09:00 daily standup' });
  });

  it('ignores blank lines and trims whitespace', () => {
    const result = parseCoreValues('  Integrity: Solid  \n\n  \nCollaboration: Strong  ');
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('Integrity');
    expect(result[0]?.description).toBe('Solid');
  });

  it('handles Windows line endings (CRLF)', () => {
    const result = parseCoreValues('Alpha: First\r\nBeta: Second');
    expect(result).toHaveLength(2);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseCoreValues('')).toEqual([]);
  });

  it('returns null description when the colon is at the end of the line', () => {
    const result = parseCoreValues('Integrity:');
    expect(result[0]).toEqual({ name: 'Integrity', description: null });
  });
});

/* -------------------------------------------------------------------------- */
/* isShowcaseStatementKey                                                      */
/* -------------------------------------------------------------------------- */

describe('isShowcaseStatementKey', () => {
  it('returns true for known showcase keys', () => {
    for (const key of SHOWCASE_STATEMENT_KEYS) {
      expect(isShowcaseStatementKey(key)).toBe(true);
    }
  });

  it('returns false for unknown keys', () => {
    expect(isShowcaseStatementKey('unknown')).toBe(false);
    expect(isShowcaseStatementKey('')).toBe(false);
    expect(isShowcaseStatementKey('Vision')).toBe(false); // case-sensitive
  });
});

/* -------------------------------------------------------------------------- */
/* findStatement                                                               */
/* -------------------------------------------------------------------------- */

describe('findStatement', () => {
  const statements = [
    makeStatement({ id: 's1', keyName: 'vision', statement: 'Our vision' }),
    makeStatement({ id: 's2', keyName: 'mission', statement: 'Our mission' }),
  ];

  it('finds a statement by keyName', () => {
    expect(findStatement(statements, 'vision')?.statement).toBe('Our vision');
    expect(findStatement(statements, 'mission')?.statement).toBe('Our mission');
  });

  it('returns null for an unknown key', () => {
    expect(findStatement(statements, 'core_values')).toBeNull();
    expect(findStatement(statements, '')).toBeNull();
  });

  it('returns null for an empty statement array', () => {
    expect(findStatement([], 'vision')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* summariseMilestones                                                         */
/* -------------------------------------------------------------------------- */

describe('summariseMilestones', () => {
  it('counts milestones by status', () => {
    const milestones = [
      makeMilestone({ id: 'm1', status: 'Achieved' }),
      makeMilestone({ id: 'm2', status: 'In Progress' }),
      makeMilestone({ id: 'm3', status: 'In Progress' }),
      makeMilestone({ id: 'm4', status: 'Planned' }),
    ];
    const summary = summariseMilestones(milestones);
    expect(summary.total).toBe(4);
    expect(summary.achieved).toBe(1);
    expect(summary.inProgress).toBe(2);
    expect(summary.planned).toBe(1);
  });

  it('returns all-zero summary for an empty list', () => {
    expect(summariseMilestones([])).toEqual({ total: 0, achieved: 0, inProgress: 0, planned: 0 });
  });
});

/* -------------------------------------------------------------------------- */
/* openMilestoneCount                                                          */
/* -------------------------------------------------------------------------- */

describe('openMilestoneCount', () => {
  it('counts non-achieved milestones', () => {
    const milestones = [
      makeMilestone({ id: 'm1', status: 'Achieved' }),
      makeMilestone({ id: 'm2', status: 'In Progress' }),
      makeMilestone({ id: 'm3', status: 'Planned' }),
    ];
    expect(openMilestoneCount(milestones)).toBe(2);
  });

  it('returns 0 when all milestones are achieved', () => {
    const milestones = [
      makeMilestone({ id: 'm1', status: 'Achieved' }),
      makeMilestone({ id: 'm2', status: 'Achieved' }),
    ];
    expect(openMilestoneCount(milestones)).toBe(0);
  });

  it('returns 0 for empty list', () => {
    expect(openMilestoneCount([])).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* milestoneCompletion                                                         */
/* -------------------------------------------------------------------------- */

describe('milestoneCompletion', () => {
  it('returns null when targetCount is null', () => {
    const m = makeMilestone({ id: 'm1', deliveredCount: 3, targetCount: null });
    expect(milestoneCompletion(m)).toBeNull();
  });

  it('returns null when targetCount is 0', () => {
    const m = makeMilestone({ id: 'm1', deliveredCount: 3, targetCount: 0 });
    expect(milestoneCompletion(m)).toBeNull();
  });

  it('computes percentage correctly', () => {
    const m = makeMilestone({ id: 'm1', deliveredCount: 2, targetCount: 4 });
    expect(milestoneCompletion(m)).toBe(50);
  });

  it('clamps at 100 for over-delivery', () => {
    const m = makeMilestone({ id: 'm1', deliveredCount: 6, targetCount: 4 });
    expect(milestoneCompletion(m)).toBe(100);
  });

  it('returns 0 for 0 delivered of a positive target', () => {
    const m = makeMilestone({ id: 'm1', deliveredCount: 0, targetCount: 5 });
    expect(milestoneCompletion(m)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* sortMilestones                                                              */
/* -------------------------------------------------------------------------- */

describe('sortMilestones', () => {
  it('places In Progress before Planned before Achieved', () => {
    const milestones = [
      makeMilestone({ id: 'm1', status: 'Achieved' }),
      makeMilestone({ id: 'm2', status: 'Planned' }),
      makeMilestone({ id: 'm3', status: 'In Progress' }),
    ];
    const sorted = sortMilestones(milestones);
    expect(sorted[0]?.status).toBe('In Progress');
    expect(sorted[1]?.status).toBe('Planned');
    expect(sorted[2]?.status).toBe('Achieved');
  });

  it('within the same status sorts by dueDate ascending', () => {
    const milestones = [
      makeMilestone({ id: 'm1', status: 'Planned', dueDate: '2026-11-01' }),
      makeMilestone({ id: 'm2', status: 'Planned', dueDate: '2026-10-01' }),
      makeMilestone({ id: 'm3', status: 'Planned', dueDate: '2026-12-01' }),
    ];
    const sorted = sortMilestones(milestones);
    expect(sorted.map((m) => m.dueDate)).toEqual(['2026-10-01', '2026-11-01', '2026-12-01']);
  });

  it('puts null dueDate after dated milestones', () => {
    const milestones = [
      makeMilestone({ id: 'm1', status: 'Planned', dueDate: null }),
      makeMilestone({ id: 'm2', status: 'Planned', dueDate: '2026-10-01' }),
    ];
    const sorted = sortMilestones(milestones);
    expect(sorted[0]?.dueDate).toBe('2026-10-01');
    expect(sorted[1]?.dueDate).toBeNull();
  });

  it('falls back to title when status and dueDate are equal', () => {
    const milestones = [
      makeMilestone({ id: 'm1', title: 'Zebra', status: 'Planned', dueDate: '2026-10-01' }),
      makeMilestone({ id: 'm2', title: 'Alpha', status: 'Planned', dueDate: '2026-10-01' }),
    ];
    const sorted = sortMilestones(milestones);
    expect(sorted[0]?.title).toBe('Alpha');
    expect(sorted[1]?.title).toBe('Zebra');
  });

  it('does not mutate the original array', () => {
    const milestones = [
      makeMilestone({ id: 'm1', status: 'Achieved' }),
      makeMilestone({ id: 'm2', status: 'Planned' }),
    ];
    const original = [...milestones];
    sortMilestones(milestones);
    expect(milestones).toEqual(original);
  });
});
