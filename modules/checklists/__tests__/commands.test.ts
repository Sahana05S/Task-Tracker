import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChecklistCommandInput } from '@/modules/checklists/internal/input';

const rpc = vi.fn();
vi.mock('@/shared/supabase/server', () => ({ createClient: async () => ({ rpc }) }));

import { runChecklistCommand } from '@/modules/checklists/internal/commands';

const input = {
  taskId: 'task-1', command: 'state', payload: {}, expectedVersion: 3,
  operationId: '11111111-1111-4111-8111-111111111111',
} as unknown as ChecklistCommandInput;

describe('runChecklistCommand', () => {
  beforeEach(() => rpc.mockReset());

  it.each(['PT409', '40001'])('reports SQLSTATE %s as a conflict', async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: 'Task changed; reload.' } });
    expect(await runChecklistCommand(input)).toEqual({ success: false, error: 'Task changed; reload.', errorCode: 'conflict' });
  });

  it('keeps other errors as a message with no code', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Not allowed.' } });
    const result = await runChecklistCommand(input);
    expect(result).toEqual({ success: false, error: 'Not allowed.' });
    expect(result.errorCode).toBeUndefined();
  });

  it('returns data on success', async () => {
    rpc.mockResolvedValue({ data: { version: 4 }, error: null });
    expect(await runChecklistCommand(input)).toEqual({ success: true, data: { version: 4 } });
    expect(rpc).toHaveBeenCalledWith('checklist_command', expect.objectContaining({ p_expected_version: 3 }));
  });
});
