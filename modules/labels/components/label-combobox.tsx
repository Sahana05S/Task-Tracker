'use client';

import { useId, useState } from 'react';
import { HashIcon, PlusIcon } from 'lucide-react';

import {
  cleanLabelName,
  LABEL_COLOUR_CLASS,
  LABEL_NAME_MAX,
  labelSlug,
  labelSuggestions,
  type Label,
} from '@/modules/labels/client';
import { cn } from '@/shared/utils';

/** What the person chose: an existing label, or a new name (managers only). */
export type LabelChoice = { label: Label } | { create: string };

/**
 * The `#` add box with suggestions, shared by `LabelInput` (saves at once) and
 * `LabelPicker` (holds the choice until the record exists). It only reports a
 * choice; the caller decides what to do with it.
 */
export function LabelCombobox({ catalogue, current, canCreate, disabled = false, onChoose, inputId, className, placeholder, ariaLabel = 'Add a label' }: {
  /** The company's labels, for suggestions. */
  catalogue: readonly Label[];
  /** Labels already on the record (left out of the suggestions). */
  current: readonly Label[];
  /** May create a label on the way (managers). */
  canCreate: boolean;
  disabled?: boolean;
  /** Return true when the choice was taken, to clear the box. */
  onChoose: (choice: LabelChoice) => void | boolean | Promise<void | boolean>;
  /** For a form field's `<label htmlFor>`. */
  inputId?: string;
  className?: string;
  /** Box text; defaults to "Add a label" (or "Add or create a label" for managers). */
  placeholder?: string;
  ariaLabel?: string;
}) {
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const name = cleanLabelName(text);
  const suggestions = open ? labelSuggestions(catalogue, text, current) : [];
  const exact = catalogue.find((label) => label.slug === labelSlug(name));
  const offerCreate = canCreate && name.length > 0 && name.length <= LABEL_NAME_MAX && labelSlug(name) !== '' && !exact;
  const options: LabelChoice[] = [
    ...suggestions.map((label) => ({ label })),
    ...(offerCreate ? [{ create: name }] : []),
  ];

  async function choose(option: LabelChoice | undefined) {
    if (!option) return;
    const taken = await onChoose(option);
    if (taken !== false) { setText(''); setActive(0); }
  }

  return (
    <div className={cn('relative max-w-xs', className)}>
      <HashIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" aria-hidden="true" />
      <input
        id={inputId}
        className="field h-9 w-full pl-7 text-sm"
        value={text}
        placeholder={placeholder ?? (canCreate ? 'Add or create a label' : 'Add a label')}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        maxLength={LABEL_NAME_MAX + 1}
        disabled={disabled}
        onChange={(event) => { setText(event.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (event.key === 'Enter') {
            event.preventDefault();
            void choose(options[active] ?? (exact && !exact.archived && !current.some((l) => l.id === exact.id) ? { label: exact } : undefined));
          } else if (event.key === 'Escape') setOpen(false);
        }}
      />
      {options.length ? (
        <ul id={listId} role="listbox" className="bg-popover text-popover-foreground border-border absolute z-20 mt-1 grid w-full gap-0.5 rounded-xl border p-1 shadow-(--shadow-card)">
          {options.map((option, index) => (
            <li
              key={'label' in option ? option.label.id : 'create'}
              role="option"
              aria-selected={index === active}
              className={cn('flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm', index === active && 'bg-muted')}
              onMouseDown={(event) => { event.preventDefault(); void choose(option); }}
              onMouseEnter={() => setActive(index)}
            >
              {'label' in option ? (
                <span className={cn('badge-soft', LABEL_COLOUR_CLASS[option.label.colour])}>#{option.label.name}</span>
              ) : (
                <><PlusIcon className="text-primary size-3.5" aria-hidden="true" />Create <strong>#{option.create}</strong></>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
