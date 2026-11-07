'use client';

import {
  ALL_BUSINESSES,
  BUSINESS_DOT_CLASS,
  chipBusinesses,
  formatWeekHours,
  isChipOn,
  NO_BUSINESS,
  summaryLines,
  toggleBusiness,
  type Business,
  type BusinessSelection,
  type BusinessSummary,
} from '@/modules/businesses/client';
import { cn } from '@/shared/utils';

/**
 * The business switcher at the top of Missions and Today (migration 134): All, one chip per active
 * business and "No business". Several businesses may be on at once; the page keeps the choice in
 * `?business=` and opens on the member's own businesses. Under the chips, one line per selected
 * business: open missions, permanent missions (once they exist) and this week's logged hours.
 */
export function BusinessChips({ businesses, selection, onChange, summary, className }: {
  businesses: readonly Business[];
  selection: BusinessSelection;
  onChange: (next: BusinessSelection) => void;
  /** Null hides the lines (the read failed). */
  summary?: BusinessSummary | null;
  className?: string;
}) {
  const chips = chipBusinesses(businesses);
  if (!chips.length) return null;
  const press = (chip: string) => onChange(toggleBusiness(selection, chip, businesses));
  const lines = summary ? summaryLines(selection, businesses, summary) : [];
  return (
    <section aria-label="Businesses" className={cn('grid gap-2', className)}>
      <div role="group" aria-label="Show missions of" className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
        <Chip on={isChipOn(selection, ALL_BUSINESSES)} onClick={() => press(ALL_BUSINESSES)}>All</Chip>
        {chips.map((business) => (
          <Chip key={business.id} on={isChipOn(selection, business.id)} onClick={() => press(business.id)}>
            <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', BUSINESS_DOT_CLASS[business.colour])} />
            {business.name}
          </Chip>
        ))}
        <Chip on={isChipOn(selection, NO_BUSINESS)} onClick={() => press(NO_BUSINESS)}>No business</Chip>
      </div>
      {lines.length ? (
        <ul className="text-muted-foreground grid gap-0.5 text-xs" aria-label="This week by business">
          {lines.map(({ key, business, row }) => (
            <li key={key} className="flex flex-wrap items-center gap-x-1.5">
              {business ? <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', BUSINESS_DOT_CLASS[business.colour])} /> : null}
              <span className="text-foreground font-medium">{business?.name ?? 'No business'}</span>
              <span aria-hidden="true">·</span>
              <span>{row.openMissions} open {row.openMissions === 1 ? 'mission' : 'missions'}</span>
              {/* Permanent missions arrive with migration 135; the count shows once the database has them. */}
              {row.permanentMissions !== null ? (
                <><span aria-hidden="true">·</span><span>{row.permanentMissions} permanent</span></>
              ) : null}
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatWeekHours(row.weekHours)} logged this week</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="filter-pill shrink-0" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}
