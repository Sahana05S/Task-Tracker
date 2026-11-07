'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { setPersonBusinesses } from '@/modules/businesses/actions';
import { chipBusinesses, type Business } from '@/modules/businesses/client';
import { BusinessDot } from '@/modules/businesses/components/business-dot';
import { Button } from '@/shared/ui/button';

/**
 * A person's businesses on their Team profile (migration 134). Everyone sees them; the managing
 * director ticks and saves them (user_businesses_command enforces it).
 */
export function PersonBusinesses({ userId, businesses, canManage }: {
  userId: string;
  businesses: readonly Business[];
  canManage: boolean;
}) {
  const router = useRouter();
  const held = businesses.filter((b) => b.memberIds.includes(userId));
  const [chosen, setChosen] = useState<string[]>(() => held.map((b) => b.id));
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [saving, start] = useTransition();
  // Active ones can be given; an archived one the person already has stays listed so it can be removed.
  const choices = [...chipBusinesses(businesses), ...held.filter((b) => b.archived)];
  const changed = [...chosen].sort().join() !== held.map((b) => b.id).sort().join();

  if (!canManage) {
    return held.length ? (
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm" aria-label="Businesses">
        {held.map((b) => <li key={b.id}><BusinessDot business={b} showName /></li>)}
      </ul>
    ) : <p className="text-muted-foreground text-sm">No business chosen yet.</p>;
  }

  function save() {
    start(async () => {
      const form = new FormData();
      form.set('userId', userId);
      form.set('operationId', operationId);
      for (const id of chosen) form.append('businessId', id);
      const result = await setPersonBusinesses(form);
      if (!result.success) {
        toast.error(result.error ?? 'The businesses were not saved.');
        return;
      }
      toast.success('Businesses saved.');
      setOperationId(crypto.randomUUID());
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3">
      {choices.length ? (
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
          <legend className="sr-only">Businesses this person works in</legend>
          {choices.map((b) => (
            <label key={b.id} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.includes(b.id)}
                onChange={(e) => {
                  setChosen((current) => e.target.checked ? [...current, b.id] : current.filter((id) => id !== b.id));
                  setOperationId(crypto.randomUUID());
                }}
              />
              <BusinessDot business={b} showName />
            </label>
          ))}
        </fieldset>
      ) : <p className="text-muted-foreground text-sm">Add businesses in Settings &gt; Company first.</p>}
      <div>
        <Button type="button" size="sm" disabled={saving || !changed} onClick={save}>Save businesses</Button>
      </div>
    </div>
  );
}
