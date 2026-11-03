'use client';

import { useId, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { HashIcon, PlusIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { changeLabelLink } from '@/modules/labels/actions';
import {
  cleanLabelName,
  LABEL_COLOUR_CLASS,
  LABEL_NAME_MAX,
  labelSlug,
  labelSuggestions,
  type Label,
  type LabelSubjectKind,
} from '@/modules/labels/client';
import { cn } from '@/shared/utils';

function formData(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

/**
 * A record's labels with an add box: type `#` and part of a name to pick an
 * existing label, or (managing director and project engineers) create a new
 * one. Each chip has a remove button. Without `canEdit` it shows the chips
 * only. Every change is one label_link_command; the database checks who may.
 */
export function LabelInput({ kind, subjectId, labels, catalogue, canEdit, canCreate, hideEmpty = false, className }: {
  kind: LabelSubjectKind;
  subjectId: string;
  labels: readonly Label[];
  /** The company's labels, for suggestions. */
  catalogue: readonly Label[];
  canEdit: boolean;
  /** May create a label on the way (managers). */
  canCreate: boolean;
  /** Read-only and no labels: render nothing instead of "No labels." */
  hideEmpty?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, start] = useTransition();

  const name = cleanLabelName(text);
  const suggestions = open ? labelSuggestions(catalogue, text, labels) : [];
  const exact = catalogue.find((label) => label.slug === labelSlug(name));
  const offerCreate = canCreate && name.length > 0 && name.length <= LABEL_NAME_MAX && labelSlug(name) !== '' && !exact;
  const options: ({ label: Label } | { create: string })[] = [
    ...suggestions.map((label) => ({ label })),
    ...(offerCreate ? [{ create: name }] : []),
  ];

  function send(values: Record<string, string>, done: string) {
    start(async () => {
      const result = await changeLabelLink(formData({ kind, subjectId, path, operationId: crypto.randomUUID(), ...values }));
      if (!result.success) {
        toast.error(result.error ?? 'The label was not changed.');
        return;
      }
      toast.success(done);
      setText('');
      setActive(0);
      router.refresh();
    });
  }

  function choose(option: (typeof options)[number] | undefined) {
    if (!option) return;
    if ('label' in option) send({ op: 'attach', labelId: option.label.id }, `Labelled #${option.label.name}.`);
    else send({ op: 'attach', name: option.create }, `Created and added #${option.create}.`);
  }

  if (!canEdit && !labels.length && hideEmpty) return null;
  return (
    <div className={cn('grid gap-2', className)}>
      {labels.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Labels">
          {labels.map((label) => (
            <li key={label.id} className={cn('badge-soft', LABEL_COLOUR_CLASS[label.colour])}>
              <Link href={`/labels/${encodeURIComponent(label.slug)}`} className="hover:underline"><span aria-hidden="true">#</span>{label.name}</Link>
              {canEdit ? (
                <button
                  type="button"
                  className="-mr-1 rounded-full p-0.5 hover:bg-muted disabled:opacity-50"
                  aria-label={`Remove label ${label.name}`}
                  disabled={busy}
                  onClick={() => send({ op: 'detach', labelId: label.id }, `Removed #${label.name}.`)}
                >
                  <XIcon className="size-3" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : !canEdit ? <p className="text-muted-foreground text-xs">No labels.</p> : null}
      {canEdit ? (
        <div className="relative max-w-xs">
          <HashIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" aria-hidden="true" />
          <input
            className="field h-9 w-full pl-7 text-sm"
            value={text}
            placeholder={canCreate ? 'Add or create a label' : 'Add a label'}
            aria-label="Add a label"
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            maxLength={LABEL_NAME_MAX + 1}
            disabled={busy}
            onChange={(event) => { setText(event.target.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
              else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
              else if (event.key === 'Enter') {
                event.preventDefault();
                choose(options[active] ?? (exact && !exact.archived && !labels.some((l) => l.id === exact.id) ? { label: exact } : undefined));
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
                  onMouseDown={(event) => { event.preventDefault(); choose(option); }}
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
      ) : null}
    </div>
  );
}
