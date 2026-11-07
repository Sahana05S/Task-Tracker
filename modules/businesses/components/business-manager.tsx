'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArchiveIcon, ArchiveRestoreIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { manageBusiness } from '@/modules/businesses/actions';
import {
  BUSINESS_COLOUR_NAME,
  BUSINESS_COLOURS,
  BUSINESS_NAME_MAX,
  type Business,
  type BusinessColour,
} from '@/modules/businesses/client';
import { BusinessDot } from '@/modules/businesses/components/business-dot';
import { Button } from '@/shared/ui/button';

function formData(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function BusinessForm({ business, onDone }: { business?: Business; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(business?.name ?? '');
  const [colour, setColour] = useState<BusinessColour>(business?.colour ?? 'neutral');
  const [sort, setSort] = useState(business ? String(business.sort) : '');
  // One operation id per draft: an unchanged retry replays the receipt, an edited draft is a new operation.
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [saving, start] = useTransition();
  const edited = () => setOperationId(crypto.randomUUID());

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await manageBusiness(formData({
        op: business ? 'update' : 'create', businessId: business?.id ?? '', name, colour, sort, operationId,
      }));
      if (!result.success) {
        toast.error(result.error ?? 'The business was not saved.');
        return;
      }
      toast.success(business ? 'Business saved.' : `Added ${result.data?.name ?? name}.`);
      if (!business) { setName(''); setSort(''); }
      setOperationId(crypto.randomUUID());
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_minmax(0,6rem)_auto] sm:items-end">
      <label className="field-label">Name
        <input className="field" value={name} onChange={(e) => { setName(e.target.value); edited(); }} maxLength={BUSINESS_NAME_MAX} required placeholder="3D printing" />
      </label>
      <label className="field-label">Colour
        <select className="field" value={colour} onChange={(e) => { setColour(e.target.value as BusinessColour); edited(); }}>
          {BUSINESS_COLOURS.map((value) => <option key={value} value={value}>{BUSINESS_COLOUR_NAME[value]}</option>)}
        </select>
      </label>
      <label className="field-label">Order
        <input className="field" inputMode="numeric" value={sort} onChange={(e) => { setSort(e.target.value.replace(/\D/g, '').slice(0, 3)); edited(); }} placeholder="Last" />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {business ? 'Save' : <><PlusIcon aria-hidden="true" />Add</>}
        </Button>
        {business ? <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button> : null}
      </div>
    </form>
  );
}

/**
 * Settings > Company > Businesses (migration 134): the managing director adds, renames, recolours,
 * orders, archives and restores the company's businesses. Archiving hides a business's chip and
 * keeps it on the missions and people that have it; nothing is deleted.
 */
export function BusinessManager({ businesses }: { businesses: readonly Business[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function toggleArchive(business: Business) {
    start(async () => {
      const result = await manageBusiness(formData({ op: business.archived ? 'restore' : 'archive', businessId: business.id, operationId: crypto.randomUUID() }));
      if (!result.success) {
        toast.error(result.error ?? 'The business was not changed.');
        return;
      }
      toast.success(business.archived ? `Restored ${business.name}.` : `Archived ${business.name}.`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <BusinessForm onDone={() => undefined} />
      {businesses.length ? (
        <ul className="divide-border grid divide-y text-sm">
          {businesses.map((business) => (
            <li key={business.id} className="grid gap-2 py-2.5">
              {editing === business.id ? (
                <BusinessForm business={business} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <BusinessDot business={business} showName className="text-foreground font-medium" />
                    <span className="text-muted-foreground text-xs">
                      Order {business.sort} · {business.memberIds.length} {business.memberIds.length === 1 ? 'person' : 'people'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {!business.archived ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(business.id)} aria-label={`Edit ${business.name}`}>
                        <PencilIcon aria-hidden="true" />Edit
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => toggleArchive(business)}>
                      {business.archived ? <><ArchiveRestoreIcon aria-hidden="true" />Restore</> : <><ArchiveIcon aria-hidden="true" />Archive</>}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">No businesses yet. Add the first one above.</p>
      )}
      <p className="text-muted-foreground text-xs">
        Choose each person&apos;s businesses on their Team profile. Missions and Today open on a person&apos;s own businesses; a business never changes who may see a mission.
      </p>
    </div>
  );
}
