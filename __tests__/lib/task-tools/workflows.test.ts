import { describe, expect, it } from 'vitest';

import {
  canUseWorkbookWorkflow,
  WORKBOOK_WORKFLOWS,
  type WorkbookWorkflowId,
} from '@/lib/task-tools/workflows';

describe('workbook task tool workflows', () => {
  it('covers every custom workbook menu workflow', () => {
    const ids = new Set(WORKBOOK_WORKFLOWS.map((workflow) => workflow.id));
    const expected: WorkbookWorkflowId[] = [
      'task-timer',
      'task-log',
      'task-status-update',
      'task-duplication',
      'task-details-update',
      'support-task-creation',
      'task-import-create',
      'master-checklist-updates',
      'refresh-metrics',
      'create-work-files',
      'report-generation',
    ];

    expect(ids).toEqual(new Set(expected));
  });

  it('allows members to use personal task workflows only', () => {
    const memberAccess = Object.fromEntries(
      WORKBOOK_WORKFLOWS.map((workflow) => [
        workflow.id,
        canUseWorkbookWorkflow('team_member', workflow),
      ]),
    );

    expect(memberAccess).toMatchObject({
      'task-timer': true,
      'task-log': true,
      'task-status-update': true,
      'master-checklist-updates': true,
      'refresh-metrics': true,
      'task-duplication': false,
      'task-details-update': false,
      'support-task-creation': false,
      'task-import-create': false,
      'create-work-files': false,
      'report-generation': false,
    });
  });

  it('allows managers to use every workflow', () => {
    expect(
      WORKBOOK_WORKFLOWS.every((workflow) =>
        canUseWorkbookWorkflow('project_engineer', workflow),
      ),
    ).toBe(true);
    expect(
      WORKBOOK_WORKFLOWS.every((workflow) =>
        canUseWorkbookWorkflow('managing_director', workflow),
      ),
    ).toBe(true);
  });
});
