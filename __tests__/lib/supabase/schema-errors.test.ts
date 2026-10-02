import { describe, expect, it } from 'vitest';

import { isMissingSchemaError } from '@/lib/supabase/schema-errors';

describe('schema error detection', () => {
  it('detects Supabase schema cache misses', () => {
    expect(
      isMissingSchemaError(
        new Error(
          "Failed to load task assignees: Could not find the table 'public.task_assignees' in the schema cache",
        ),
      ),
    ).toBe(true);
  });

  it('does not classify ordinary query failures as missing schema', () => {
    expect(isMissingSchemaError(new Error('Failed to load tasks: timeout'))).toBe(
      false,
    );
  });
});
