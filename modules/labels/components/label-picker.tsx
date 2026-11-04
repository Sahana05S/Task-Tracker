'use client';

import { XIcon } from 'lucide-react';

import { changeLabelLink } from '@/modules/labels/actions';
import { LABEL_COLOUR_CLASS, labelSlug, type Label, type LabelSubjectKind } from '@/modules/labels/client';
import { cn } from '@/shared/utils';

import { LabelCombobox } from './label-combobox';

/** A label chosen before its record exists: a catalogue label, or a new name (`id` null) a manager will create. */
export interface PickedLabel {
  readonly id: string | null;
  readonly name: string;
  readonly colour: Label['colour'];
}

/**
 * Labels picked for a record that does not exist yet (the New mission form).
 * Nothing is saved here: once the record is created, `attachPickedLabels`
 * sends one label_link_command per label and the database checks who may.
 */
export function LabelPicker({ value, onChange, catalogue, canCreate, disabled = false, inputId, className }: {
  value: readonly PickedLabel[];
  onChange: (next: PickedLabel[]) => void;
  catalogue: readonly Label[];
  canCreate: boolean;
  disabled?: boolean;
  inputId?: string;
  className?: string;
}) {
  // Suggestions skip what is already picked; new names have no id, so they are matched by slug.
  const current = catalogue.filter((label) => value.some((pick) => pick.id === label.id || labelSlug(pick.name) === label.slug));
  return (
    <div className={cn('grid gap-2', className)}>
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Labels to add">
          {value.map((pick) => (
            <li key={pick.id ?? `new:${labelSlug(pick.name)}`} className={cn('badge-soft', LABEL_COLOUR_CLASS[pick.colour])}>
              <span><span aria-hidden="true">#</span>{pick.name}{pick.id ? null : <span className="opacity-70"> (new)</span>}</span>
              <button
                type="button"
                className="-mr-1 rounded-full p-0.5 hover:bg-muted disabled:opacity-50"
                aria-label={`Remove label ${pick.name}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((other) => other !== pick))}
              >
                <XIcon className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <LabelCombobox
        catalogue={catalogue}
        current={current}
        canCreate={canCreate}
        disabled={disabled}
        inputId={inputId}
        onChoose={(choice) => {
          const pick: PickedLabel = 'label' in choice
            ? { id: choice.label.id, name: choice.label.name, colour: choice.label.colour }
            : { id: null, name: choice.create, colour: 'neutral' };
          if (value.some((other) => labelSlug(other.name) === labelSlug(pick.name))) return true;
          onChange([...value, pick]);
          return true;
        }}
      />
    </div>
  );
}

/**
 * Attaches picked labels to a record that now exists, one label_link_command
 * each (a new name is created on the way when the caller may). Returns the
 * names that were not added, with the first reason.
 */
export async function attachPickedLabels(kind: LabelSubjectKind, subjectId: string, picks: readonly PickedLabel[], path: string): Promise<{ failed: string[]; error: string | null }> {
  const failed: string[] = [];
  let error: string | null = null;
  for (const pick of picks) {
    const form = new FormData();
    form.set('op', 'attach');
    form.set('kind', kind);
    form.set('subjectId', subjectId);
    form.set('path', path);
    form.set('operationId', crypto.randomUUID());
    if (pick.id) form.set('labelId', pick.id);
    else form.set('name', pick.name);
    try {
      const result = await changeLabelLink(form);
      if (!result.success) { failed.push(pick.name); error ??= result.error ?? null; }
    } catch {
      failed.push(pick.name);
    }
  }
  return { failed, error };
}
