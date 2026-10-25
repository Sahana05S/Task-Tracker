'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { payrollMonthAction, savePayrollEntry } from '@/modules/payroll/actions';
import type { PayrollSection } from '@/modules/payroll/client';

/**
 * Sends one payroll command with a fresh operation id and the version the
 * page was rendered with, toasts the outcome and refreshes the page data.
 * Resolves true on success so a form can reset itself.
 */
export function usePayrollCommand() {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const finish = React.useCallback((result: { success: boolean; error?: string }, message: string) => {
    if (result.success) {
      toast.success(message);
      router.refresh();
      return true;
    }
    toast.error(result.error ?? 'The change was not saved.');
    return false;
  }, [router]);

  const save = React.useCallback((section: PayrollSection, version: number, payload: Record<string, unknown>, message = 'Saved.') =>
    new Promise<boolean>((resolve) => {
      start(async () => {
        const form = new FormData();
        form.set('section', section);
        form.set('expectedVersion', String(version));
        form.set('operationId', crypto.randomUUID());
        form.set('payload', JSON.stringify(payload));
        resolve(finish(await savePayrollEntry(null, form), message));
      });
    }), [finish]);

  const month = React.useCallback((action: 'finalize' | 'reopen', period: string, version: number, reason: string | null, message: string) =>
    new Promise<boolean>((resolve) => {
      start(async () => {
        const form = new FormData();
        form.set('action', action);
        form.set('period', period);
        form.set('expectedVersion', String(version));
        form.set('operationId', crypto.randomUUID());
        if (reason) form.set('reason', reason);
        resolve(finish(await payrollMonthAction(null, form), message));
      });
    }), [finish]);

  return { save, month, pending };
}

/** The named fields of a submitted form as a plain object. */
export function formFields(form: HTMLFormElement): Record<string, string> {
  return Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => [key, String(value)]));
}
