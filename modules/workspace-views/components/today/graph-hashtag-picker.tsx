'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { HashIcon, XIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils';
import { LABEL_COLOUR_CLASS, labelSuggestions, type CatalogueLabel, type Label } from '@/modules/labels/client';
import { loadGraphHashtags } from '@/modules/workspace-views/roadmap-actions';

/**
 * The Today map's hashtag picker: a searchable list of the company's labels (label_catalogue, read the
 * first time the box is focused). Choosing one is reported to the map, which highlights what carries it.
 */
export function GraphHashtagPicker({ chosen, count, loading, error, labelLinks, onChoose, onClear, onLabelLinks }: {
  chosen: Label | null;
  /** Nodes on the map that carry the chosen label. */
  count: number;
  /** labelled(slug) is still being read (the loaded missions already show). */
  loading: boolean;
  error: string | null;
  labelLinks: boolean;
  onChoose: (label: Label) => void;
  onClear: () => void;
  onLabelLinks: (on: boolean) => void;
}) {
  const listId = useId();
  const [catalogue, setCatalogue] = useState<CatalogueLabel[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  async function read() {
    if (catalogue) return;
    setReadError(null);
    const result = await loadGraphHashtags().catch(() => ({ success: false as const, error: undefined, data: undefined }));
    if (result.success && result.data) setCatalogue(result.data);
    else setReadError(result.error ?? 'Hashtags could not be loaded. Retry.');
  }
  const options = open && catalogue ? labelSuggestions(catalogue, text, [], 10) : [];
  function choose(label: Label | undefined) {
    if (!label) return;
    onChoose(label); setText(''); setOpen(false); setActive(0);
  }

  if (chosen) {
    return <div role="group" aria-label="Hashtag on the map" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <span className={cn('badge-soft', LABEL_COLOUR_CLASS[chosen.colour])}>#{chosen.name}</span>
      <span aria-live="polite" className="text-muted-foreground">
        {error ? <span className="text-danger">{error}</span> : `${count} on the map${loading ? ' (checking the rest…)' : ''}`}
      </span>
      <label className="text-muted-foreground flex items-center gap-1.5">
        <input type="checkbox" checked={labelLinks} onChange={e => onLabelLinks(e.target.checked)} className="accent-primary size-3.5" />
        Show label links
      </label>
      <Link className="link font-semibold" href={`/labels/${encodeURIComponent(chosen.slug)}`}>See everything with #{chosen.name}</Link>
      <Button size="sm" variant="ghost" onClick={onClear}><XIcon aria-hidden="true" />Clear</Button>
    </div>;
  }

  return <div className="relative w-full max-w-xs">
    <HashIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" aria-hidden="true" />
    <input
      className="field h-9 w-full pl-7 text-sm"
      value={text}
      placeholder="Find by hashtag"
      aria-label="Highlight missions by hashtag"
      role="combobox"
      aria-expanded={options.length > 0}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={options[active] ? `${listId}-${options[active].id}` : undefined}
      onChange={e => { setText(e.target.value); setOpen(true); setActive(0); }}
      onFocus={() => { setOpen(true); void read(); }}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
      onKeyDown={e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, options.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); choose(options[active]); }
        else if (e.key === 'Escape') setOpen(false);
      }}
    />
    {readError ? <p role="alert" className="text-danger mt-1 text-xs">{readError} <button type="button" className="link font-semibold" onClick={() => void read()}>Retry</button></p> : null}
    {open && catalogue && !catalogue.length ? <p className="text-muted-foreground mt-1 text-xs">No hashtags yet.</p> : null}
    {options.length ? <ul id={listId} role="listbox" aria-label="Hashtags" className="bg-popover text-popover-foreground border-border absolute z-20 mt-1 grid max-h-72 w-full gap-0.5 overflow-y-auto rounded-xl border p-1 shadow-(--shadow-card)">
      {options.map((label, index) => <li key={label.id} id={`${listId}-${label.id}`} role="option" aria-selected={index === active}
        className={cn('flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm', index === active && 'bg-muted')}
        onMouseDown={e => { e.preventDefault(); choose(label); }} onMouseEnter={() => setActive(index)}>
        <span className={cn('badge-soft', LABEL_COLOUR_CLASS[label.colour])}>#{label.name}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{(label as CatalogueLabel).uses}</span>
      </li>)}
    </ul> : null}
  </div>;
}
