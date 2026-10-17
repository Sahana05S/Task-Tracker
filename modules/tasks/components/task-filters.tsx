'use client';

import * as React from 'react';
import { LayoutGridIcon, SearchIcon, TableIcon, XIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/shared/ui/select';
import {
  activeFilterCount,
  ALL,
  EMPTY_FILTERS,
  type TaskFilterState,
} from '@/modules/tasks/internal/filters';
import {
  CATEGORY_LABELS,
  TASK_CATEGORIES,
  TASK_FRESHNESS_STATES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/shared/tracker/enums';
import { cn } from '@/shared/utils';
import type { Task, TaskStatus, User } from '@/types/tracker';

export type MissionView = 'cards' | 'table';

export interface TaskFiltersProps {
  filters: TaskFilterState;
  onChange: (next: TaskFilterState) => void;
  /** Directory used to populate the assignee facet. */
  members: readonly User[];
  /** The full fetched set, used for the status pill counts. */
  tasks: readonly Task[];
  resultCount: number;
  totalCount: number;
  view: MissionView;
  onViewChange: (view: MissionView) => void;
}

/** Statuses that get a pill; the rarer ones stay in the facet menu. */
const PILL_STATUSES: readonly TaskStatus[] = ['Not Started', 'In Progress', 'Done'];

/**
 * Missions toolbar (Stitch reference missions_list_1): search, status pills
 * with counts, the remaining facets (assignee, type, priority, freshness, any
 * status) and the card/table view switch.
 *
 * Filtering runs against the already-fetched set, so every change is immediate
 * and no round trip is involved.
 */
export function TaskFilters({
  filters,
  onChange,
  members,
  tasks,
  resultCount,
  totalCount,
  view,
  onViewChange,
}: TaskFiltersProps) {
  const activeCount = activeFilterCount(filters);

  const update = <K extends keyof TaskFilterState>(
    key: K,
    value: TaskFilterState[K],
  ) => {
    onChange({ ...filters, [key]: value });
  };

  const statusCounts = React.useMemo(() => {
    const counts = new Map<TaskStatus, number>();
    for (const task of tasks) counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
    return counts;
  }, [tasks]);

  return (
    <div className="soft-card flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-52 flex-1 lg:max-w-80">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={filters.search}
            onChange={(event) => update('search', event.target.value)}
            placeholder="Search missions by title or tag"
            aria-label="Search missions by title or task tag"
            className="bg-muted h-9 rounded-xl border-transparent pl-9 text-sm"
          />
        </div>

        {/* Status pills. Single choice, mirrored by the status facet below. */}
        <div
          role="group"
          aria-label="Filter by status"
          className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1"
        >
          <button
            type="button"
            className="filter-pill"
            aria-pressed={filters.status === ALL}
            onClick={() => update('status', ALL)}
          >
            All <span className="tabular-nums opacity-70">{totalCount}</span>
          </button>
          {PILL_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className="filter-pill"
              aria-pressed={filters.status === status}
              onClick={() => update('status', filters.status === status ? ALL : status)}
            >
              {status}
              <span className="tabular-nums opacity-70">{statusCounts.get(status) ?? 0}</span>
            </button>
          ))}
        </div>

        {/* View switch. The table needs desktop width, so it is offered from lg. */}
        <div
          role="group"
          aria-label="Mission view"
          className="bg-muted ml-auto hidden shrink-0 items-center gap-0.5 rounded-xl p-1 lg:flex"
        >
          <ViewButton current={view} value="cards" label="Card view" icon={LayoutGridIcon} onSelect={onViewChange} />
          <ViewButton current={view} value="table" label="Table view" icon={TableIcon} onSelect={onViewChange} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FacetSelect
          label="Assignee"
          value={filters.assigneeId}
          onValueChange={(value) => update('assigneeId', value)}
          options={members.map((member) => ({
            value: member.id,
            label: member.fullName,
          }))}
          allLabel="All assignees"
          className="w-40"
        />

        <FacetSelect
          label="Category"
          value={filters.category}
          onValueChange={(value) =>
            update(
              'category',
              value === ALL
                ? ALL
                : (value as TaskFilterState['category']),
            )
          }
          options={TASK_CATEGORIES.map((category) => ({
            value: category,
            label: `${category} · ${CATEGORY_LABELS[category]}`,
          }))}
          allLabel="All types"
          className="w-44"
        />

        <FacetSelect
          label="Priority"
          value={filters.priority}
          onValueChange={(value) =>
            update(
              'priority',
              value === ALL ? ALL : (value as TaskFilterState['priority']),
            )
          }
          options={TASK_PRIORITIES.map((priority) => ({
            value: priority,
            label: priority,
          }))}
          allLabel="Any priority"
          className="w-32"
        />

        <FacetSelect
          label="Status"
          value={filters.status}
          onValueChange={(value) =>
            update(
              'status',
              value === ALL ? ALL : (value as TaskFilterState['status']),
            )
          }
          options={TASK_STATUSES.map((status) => ({
            value: status,
            label: status,
          }))}
          allLabel="Any status"
          className="w-36"
        />

        <FacetSelect
          label="Freshness"
          value={filters.freshness}
          onValueChange={(value) =>
            update(
              'freshness',
              value === ALL ? ALL : (value as TaskFilterState['freshness']),
            )
          }
          options={TASK_FRESHNESS_STATES.map((freshness) => ({
            value: freshness,
            label: freshness,
          }))}
          allLabel="Any freshness"
          className="w-36"
        />

        {activeCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(EMPTY_FILTERS)}
          >
            <XIcon aria-hidden="true" />
            Clear
            <span className="badge-soft badge-neutral ml-1 px-1.5 py-0">
              {activeCount}
            </span>
          </Button>
        ) : null}

        {/* Result count doubles as the live region announcing filter effects. */}
        <p className="text-muted-foreground ml-auto text-xs" role="status" aria-live="polite">
          {resultCount === totalCount
            ? `${totalCount} ${totalCount === 1 ? 'mission' : 'missions'}`
            : `${resultCount} of ${totalCount} missions`}
        </p>
      </div>
    </div>
  );
}

function ViewButton({
  current,
  value,
  label,
  icon: Icon,
  onSelect,
}: {
  current: MissionView;
  value: MissionView;
  label: string;
  icon: typeof TableIcon;
  onSelect: (view: MissionView) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={() => onSelect(value)}
      className={cn(
        'flex size-8 items-center justify-center rounded-lg transition-colors',
        active ? 'text-primary bg-white shadow-(--shadow-card)' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Facet                                                                      */
/* -------------------------------------------------------------------------- */

interface FacetOption {
  value: string;
  label: string;
}

interface FacetSelectProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly FacetOption[];
  allLabel: string;
  className?: string;
}

/**
 * One facet. The visible label lives in the trigger rather than above it, which
 * keeps the bar to a single row without losing the accessible name.
 *
 * The label is resolved here and rendered as the trigger's own child instead of
 * using `SelectValue`. Radix derives `SelectValue`'s text from the matching
 * `SelectItem`, and those live inside `SelectContent`, which is not mounted
 * during server rendering — so `SelectValue` serialises as an empty span and
 * every facet paints blank until the menu is first opened.
 */
function FacetSelect({
  label,
  value,
  onValueChange,
  options,
  allLabel,
  className,
}: FacetSelectProps) {
  const selectedLabel =
    value === ALL
      ? allLabel
      : (options.find((option) => option.value === value)?.label ?? allLabel);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        size="sm"
        aria-label={`Filter by ${label.toLowerCase()}`}
        className={cn(
          'rounded-xl',
          className,
          // Narrowed facets take the violet tint, so active filters read at a
          // glance without introducing a competing accent hue.
          value !== ALL &&
            'border-primary/25 bg-primary-subtle text-primary font-semibold',
        )}
      >
        {selectedLabel}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
