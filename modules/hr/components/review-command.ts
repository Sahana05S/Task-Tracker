'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { reviewAction } from '@/modules/hr/review-actions';

/**
 * Sends one performance review operation, toasts the outcome and refreshes the
 * page. Returns the action's data on success, null otherwise.
 */
export function useReviewCommand() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function send(fields: { op: string; reviewId?: string; version?: number; payload?: unknown }, success: string, onDone?: (data: { id: string | null; created: number | null }) => void) {
    start(async () => {
      const form = new FormData();
      form.set('op', fields.op);
      if (fields.reviewId) form.set('reviewId', fields.reviewId);
      form.set('version', String(fields.version ?? 0));
      form.set('operationId', crypto.randomUUID());
      form.set('payload', JSON.stringify(fields.payload ?? {}));
      const result = await reviewAction(form);
      if (!result.success || !result.data) {
        toast.error(result.error ?? 'The change was not saved.');
        return;
      }
      toast.success(success);
      onDone?.(result.data);
      router.refresh();
    });
  }
  return { pending, send };
}
