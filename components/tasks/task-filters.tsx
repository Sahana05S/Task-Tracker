'use client';

import * as React from 'react';
import { SearchIcon, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  activeFilterCount,
  ALL,
  EMPTY_FILTERS,
  type TaskFilterState,
} from '@/lib/tasks/filters';
import {
  CATEGORY_LABELS,
  TASK_CATEGORIES,
  TASK_FRESHNESS_STATES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/lib/tracker/enums';
import { cn } from '@/lib/utils';
import type { User } from '@/types/tracker';

export interface TaskFiltersProps {
  filters: TaskFilterState;
  onChange: (next: TaskFilterState) => void;
  /** Directory used to populate the assignee facet. */
  members: readonly User[];
  resultCount: number;
  totalCount: number;
}

/**
 * Dense filter bar: search plus the five facets from the roadmap (assignee,
 * category, priority, status, freshness).
 *
 * Filtering runs against the already-fetched set, so every change is immediate
 * and no round trip is involved.
 */
export function TaskFilters({
  filters,
  onChange,
  members,
  resultCount,
  totalCount,
}: TaskFiltersProps) {
  const activeCount = activeFilterCount(filters);

  const update = <K extends keyof TaskFilterState>(
    key: K,
    value: TaskFilterState[K],
  ) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="soft-card flex flex-col gap-2.5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-52 flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={filters.search}
            onChange={(event) => update('search', event.target.value)}
            placeholder="Search title or tag, e.g. Sep26_T5"
            aria-label="Search tasks by title or task tag"
            className="h-8 pl-8 text-xs"
          />
        </div>

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
          allLabel="All categories"
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
          allLabel="All priorities"
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
          allLabel="All statuses"
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
          allLabel="All freshness"
          className="w-32"
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
      </div>

      {/* Result count doubles as the live region announcing filter effects. */}
      <p className="text-xs text-slate-500" role="status" aria-live="polite">
        {resultCount === totalCount
          ? `${totalCount} ${totalCount === 1 ? 'task' : 'tasks'}`
          : `${resultCount} of ${totalCount} tasks`}
      </p>
    </div>
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
          className,
          // Narrowed facets take the forest tint, so active filters read at a
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
