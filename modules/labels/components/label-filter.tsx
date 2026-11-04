'use client';

import { HashIcon } from 'lucide-react';

import { LABEL_COLOUR_CLASS, type Label } from '@/modules/labels/client';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/utils';

/**
 * A filter by labels for a list (the Missions page): several may be chosen and
 * a record matches when it carries any of them. Works on slugs, so the choice
 * fits in a URL. Archived labels are offered only while chosen.
 */
export function LabelFilter({ catalogue, value, onChange, className }: {
  catalogue: readonly Label[];
  /** Chosen label slugs. */
  value: readonly string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const chosen = new Set(value);
  const options = catalogue.filter((label) => !label.archived || chosen.has(label.slug));
  // A slug from a link that is not in the catalogue stays listed so it can be cleared.
  const unknown = value.filter((slug) => !catalogue.some((label) => label.slug === slug));
  const names = value.map((slug) => catalogue.find((label) => label.slug === slug)?.name ?? slug);
  const summary = value.length === 0 ? 'Any label' : value.length === 1 ? `#${names[0]}` : `${value.length} labels`;
  const toggle = (slug: string, on: boolean) => onChange(on ? [...value.filter((s) => s !== slug), slug] : value.filter((s) => s !== slug));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={value.length ? `Filter by labels: ${names.map((n) => `#${n}`).join(', ')}` : 'Filter by labels'}
          className={cn(
            'justify-start rounded-xl font-normal',
            value.length > 0 && 'border-primary/25 bg-primary-subtle text-primary font-semibold',
            className,
          )}
        >
          <HashIcon aria-hidden="true" />
          <span className="truncate">{summary}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">Missions with any of these labels</DropdownMenuLabel>
        {options.length === 0 && unknown.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1.5 text-sm">No labels yet.</p>
        ) : null}
        {options.map((label) => (
          <DropdownMenuCheckboxItem
            key={label.id}
            checked={chosen.has(label.slug)}
            onCheckedChange={(on) => toggle(label.slug, on === true)}
            onSelect={(event) => event.preventDefault()}
          >
            <span className={cn('badge-soft', LABEL_COLOUR_CLASS[label.colour])}>#{label.name}</span>
            {label.archived ? <span className="text-muted-foreground text-xs">archived</span> : null}
          </DropdownMenuCheckboxItem>
        ))}
        {unknown.map((slug) => (
          <DropdownMenuCheckboxItem key={`unknown:${slug}`} checked onCheckedChange={() => toggle(slug, false)} onSelect={(event) => event.preventDefault()}>
            <span className="badge-soft badge-neutral">#{slug}</span>
            <span className="text-muted-foreground text-xs">not found</span>
          </DropdownMenuCheckboxItem>
        ))}
        {value.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Clear labels</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
