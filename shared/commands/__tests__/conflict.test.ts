import { describe, expect, it } from 'vitest';
import { isConflictCode } from '@/shared/commands/conflict';
import { executionError } from '@/shared/commands/result';

describe('conflict codes', () => {
  it('treats PT409 and the legacy 40001 as the same conflict', () => {
    expect(isConflictCode('PT409')).toBe(true);
    expect(isConflictCode('40001')).toBe(true);
    expect(isConflictCode('23514')).toBe(false);
    expect(isConflictCode(undefined)).toBe(false);
  });

  it('maps a PT409 command error to a conflict with the database message', () => {
    expect(executionError({ code: 'PT409', message: 'Log changed/reversed; reload before correction' }))
      .toMatchObject({ success: false, errorCode: 'conflict', error: 'Log changed/reversed; reload before correction' });
  });
});
