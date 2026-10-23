'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDownIcon, SearchIcon } from 'lucide-react';

import { Input } from '@/shared/ui/input';

export interface GlossaryEntry {
  readonly term: string;
  readonly meaning: string;
  readonly href: string;
}

/**
 * The glossary as a searchable list. Each term opens in place to its one-line
 * meaning and a link to its guide section. Without JavaScript every term is
 * listed and still opens, since each one is a native disclosure.
 */
export function GlossarySearch({ entries }: { entries: readonly GlossaryEntry[] }) {
  const [query, setQuery] = React.useState('');
  const id = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Anything typed before the page became interactive still filters.
  React.useEffect(() => {
    if (inputRef.current?.value) setQuery(inputRef.current.value);
  }, []);
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? entries.filter(entry => `${entry.term} ${entry.meaning}`.toLowerCase().includes(needle))
    : entries;

  return (
    <section aria-labelledby={`${id}-title`} className="soft-card grid gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h2 id={`${id}-title`} className="text-foreground text-lg font-bold tracking-tight">Glossary</h2>
          <p className="text-muted-foreground text-sm">Look up a word you met in TaskPulse.</p>
        </div>
        <div className="grid w-full gap-1.5 sm:w-72">
          <label htmlFor={`${id}-search`} className="text-foreground text-sm font-medium">Search terms</label>
          <div className="relative">
            <SearchIcon aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              ref={inputRef}
              id={`${id}-search`}
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Scale, freshness, as of…"
              className="min-h-11 pl-9"
              autoComplete="off"
            />
          </div>
        </div>
      </div>

      <p aria-live="polite" className="text-muted-foreground text-xs">
        {needle ? `${shown.length} of ${entries.length} terms` : `${entries.length} terms`}
      </p>

      {shown.length ? (
        <ul className="grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(entry => (
            <li key={entry.term}>
              <details className="disclosure group">
                <summary className="text-foreground flex min-h-11 list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                  {entry.term}
                  <ChevronDownIcon aria-hidden="true" className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                </summary>
                <div className="grid gap-2 text-sm">
                  <p className="text-muted-foreground text-pretty">{entry.meaning}</p>
                  <Link href={entry.href} className="link justify-self-start">Open in the guide</Link>
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <div className="soft-inset grid gap-2 p-4 text-sm">
          <p className="text-foreground">No terms match “{query.trim()}”.</p>
          <p className="text-muted-foreground">Try a shorter word, or browse every term.</p>
          <button type="button" onClick={() => setQuery('')} className="link inline-flex min-h-11 items-center justify-self-start">
            Browse all terms
          </button>
        </div>
      )}
    </section>
  );
}
