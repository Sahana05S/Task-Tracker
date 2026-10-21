'use client';

import * as React from 'react';

import { commitTaskTool, previewTaskTool } from '@/modules/tasks/tool-actions';
import type { CommittedItems } from '@/modules/tasks/internal/tools/commands';
import type { ToolOperation, ToolsPreview } from '@/modules/tasks/internal/tools/contract';
import type { Json } from '@/types/database';

/**
 * Preview-then-commit for one Task Tools operation.
 *
 * Every operation is previewed first; the reviewed preview is committed with an
 * operation key minted when the preview arrived. A commit whose reply is lost
 * keeps both, so retrying sends the same key and the database replays its
 * receipt instead of running the batch twice.
 */

export type ToolPayload = Record<string, Json | undefined>;

export type PreviewOutcome =
  | { ok: true; preview: ToolsPreview; operationKey: string }
  | { ok: false; message: string };

export type CommitOutcome =
  | { ok: true; result: CommittedItems }
  | { ok: false; message: string };

export async function requestToolPreview(
  command: ToolOperation,
  payload: ToolPayload,
  newKey: () => string = () => crypto.randomUUID(),
): Promise<PreviewOutcome> {
  try {
    const reply = await previewTaskTool(command, payload);
    if (!reply.success) return { ok: false, message: reply.error };
    return { ok: true, preview: reply.data, operationKey: newKey() };
  } catch {
    return { ok: false, message: 'The preview could not be loaded. Try again.' };
  }
}

export async function commitToolPreview(previewId: string, operationKey: string): Promise<CommitOutcome> {
  try {
    const reply = await commitTaskTool(previewId, operationKey);
    if (!reply.success) return { ok: false, message: reply.error };
    return { ok: true, result: reply.data };
  } catch {
    return {
      ok: false,
      message: 'No reply arrived. Commit again: the same preview and key are kept, so nothing runs twice.',
    };
  }
}

export interface ToolOperationState {
  preview: ToolsPreview | null;
  result: CommittedItems | null;
  message: string;
  pending: boolean;
  prepare: (command: ToolOperation, payload: ToolPayload) => void;
  commit: () => void;
  /** Drops the preview (inputs changed) without touching a committed result. */
  invalidate: () => void;
  reset: () => void;
}

export function useToolOperation({ onCommitted }: { onCommitted?: (result: CommittedItems) => void } = {}): ToolOperationState {
  // Read at commit time, so a new callback does not re-create `commit`.
  const committedRef = React.useRef(onCommitted);
  React.useEffect(() => {
    committedRef.current = onCommitted;
  });
  const [preview, setPreview] = React.useState<ToolsPreview | null>(null);
  const [operationKey, setOperationKey] = React.useState('');
  const [result, setResult] = React.useState<CommittedItems | null>(null);
  const [message, setMessage] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  const prepare = React.useCallback((command: ToolOperation, payload: ToolPayload) => {
    startTransition(async () => {
      setMessage('');
      setResult(null);
      const outcome = await requestToolPreview(command, payload);
      if (outcome.ok) {
        setPreview(outcome.preview);
        setOperationKey(outcome.operationKey);
      } else {
        setPreview(null);
        setMessage(outcome.message);
      }
    });
  }, []);

  const commit = React.useCallback(() => {
    if (!preview) return;
    const previewId = preview.id;
    startTransition(async () => {
      setMessage('');
      const outcome = await commitToolPreview(previewId, operationKey);
      if (outcome.ok) {
        setResult(outcome.result);
        setPreview(null);
        committedRef.current?.(outcome.result);
      } else {
        setMessage(outcome.message);
      }
    });
  }, [preview, operationKey]);

  const invalidate = React.useCallback(() => {
    setPreview(null);
    setMessage('');
  }, []);

  const reset = React.useCallback(() => {
    setPreview(null);
    setOperationKey('');
    setResult(null);
    setMessage('');
  }, []);

  return { preview, result, message, pending, prepare, commit, invalidate, reset };
}
