'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { setMissionBusiness } from '@/modules/businesses/actions';
import { chipBusinesses, type Business } from '@/modules/businesses/client';
import { BusinessDot } from '@/modules/businesses/components/business-dot';

/**
 * A mission's Business on its details (migration 134). Saves on change for those who may edit the
 * mission (the managing director, Managers and the Crew; task_business_command enforces it);
 * read-only for everyone else.
 */
export function MissionBusinessSelect({ taskId, businessId, businesses, canEdit }: {
  taskId: string;
  businessId: string | null;
  businesses: readonly Business[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(businessId ?? '');
  const [saving, start] = useTransition();
  const current = businesses.find((b) => b.id === value) ?? null;
  if (!canEdit) return current ? <BusinessDot business={current} showName /> : <span className="text-muted-foreground">No business</span>;
  // An archived business stays selectable only while the mission still has it.
  const options = [...chipBusinesses(businesses), ...(current?.archived ? [current] : [])];

  function change(next: string) {
    const previous = value;
    setValue(next);
    start(async () => {
      const form = new FormData();
      form.set('taskId', taskId);
      form.set('businessId', next);
      form.set('operationId', crypto.randomUUID());
      const result = await setMissionBusiness(form);
      if (!result.success) {
        setValue(previous);
        toast.error(result.error ?? 'The business was not saved.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {current ? <BusinessDot business={current} /> : null}
      <select
        className="field h-8 py-0 text-sm"
        aria-label="Business"
        value={value}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">No business</option>
        {options.map((b) => <option key={b.id} value={b.id}>{b.name}{b.archived ? ' (archived)' : ''}</option>)}
      </select>
    </span>
  );
}
