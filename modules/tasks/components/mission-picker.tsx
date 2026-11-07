'use client';

import * as React from 'react';
import { InfinityIcon, SearchIcon, XIcon } from 'lucide-react';

import { orderMissionOptions, searchMissionOptions, type MissionPickerOption } from '@/modules/tasks/client';
import { cn } from '@/shared/utils';

/**
 * Choose one or more missions (meetings, 7 November 2026): permanent missions first, then missions
 * with their sub-missions indented under them, with a search. Each chosen mission is submitted as a
 * hidden `name` field, so it works inside any form; the chosen ones show as removable chips.
 */
export function MissionPicker({ options, defaultValue = [], name = 'mission', label = 'Missions', businessId = null, className }: {
  options: readonly MissionPickerOption[];
  /** Show this business's missions (and those with no business) unless "Show missions of every business" is ticked. */
  businessId?: string | null;
  defaultValue?: readonly string[];
  name?: string;
  label?: string;
  className?: string;
}) {
  const [chosen, setChosen] = React.useState<string[]>(() => [...defaultValue]);
  const [search, setSearch] = React.useState('');
  const [everyBusiness, setEveryBusiness] = React.useState(false);
  const scoped = React.useMemo(
    () => (businessId && !everyBusiness ? options.filter((o) => !o.businessId || o.businessId === businessId) : options),
    [options, businessId, everyBusiness],
  );
  const ordered = React.useMemo(() => orderMissionOptions(scoped), [scoped]);
  const shown = React.useMemo(() => searchMissionOptions(ordered, search), [ordered, search]);
  const byId = React.useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const toggle = (id: string) => setChosen((current) => (current.includes(id) ? current.filter((v) => v !== id) : [...current, id]));
  const searchId = React.useId();

  return (
    <fieldset className={cn('grid gap-2', className)}>
      <legend className="field-label mb-1">{label}</legend>
      {chosen.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      {chosen.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen missions">
          {chosen.map((id) => {
            const option = byId.get(id);
            return (
              <li key={id} className="badge-soft badge-neutral inline-flex max-w-full items-center gap-1">
                <span className="font-mono text-xs">{option?.tag ?? 'Mission'}</span>
                <span className="max-w-[12rem] truncate">{option?.title}</span>
                <button type="button" onClick={() => toggle(id)} className="text-muted-foreground hover:text-foreground -mr-1 rounded p-0.5" aria-label={`Remove ${option?.tag ?? 'mission'}`}>
                  <XIcon className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <label htmlFor={searchId} className="relative block">
        <span className="sr-only">Search missions</span>
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" />
        <input id={searchId} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by tag or title" className="field pl-9" autoComplete="off" />
      </label>
      {businessId ? (
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
          <input type="checkbox" checked={everyBusiness} onChange={(event) => setEveryBusiness(event.target.checked)} className="size-4" />
          Show missions of every business
        </label>
      ) : null}
      <ul className="border-border max-h-60 overflow-y-auto rounded-xl border" aria-label="Missions">
        {shown.length ? shown.map((option) => {
          const checked = chosen.includes(option.id);
          return (
            <li key={option.id}>
              <label className="hover:bg-muted/60 flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm" style={{ paddingLeft: `${0.75 + option.depth * 1.25}rem` }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(option.id)} className="size-4 shrink-0" />
                {option.isPermanent ? <InfinityIcon className="text-primary size-4 shrink-0" aria-label="Permanent mission" /> : null}
                <span className="text-muted-foreground shrink-0 font-mono text-xs">{option.tag}</span>
                <span className="text-foreground min-w-0 truncate">{option.title}</span>
              </label>
            </li>
          );
        }) : <li className="text-muted-foreground px-3 py-3 text-sm">No mission matches.</li>}
      </ul>
    </fieldset>
  );
}
