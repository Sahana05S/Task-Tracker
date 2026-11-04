'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { changeLabelLink } from '@/modules/labels/actions';
import { LABEL_COLOUR_CLASS, type Label, type LabelSubjectKind } from '@/modules/labels/client';
import { cn } from '@/shared/utils';

import { LabelCombobox, type LabelChoice } from './label-combobox';

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
  const [busy, start] = useTransition();

  function send(values: Record<string, string>, done: string): Promise<boolean> {
    return new Promise((resolve) => start(async () => {
      const result = await changeLabelLink(formData({ kind, subjectId, path, operationId: crypto.randomUUID(), ...values }));
      if (!result.success) {
        toast.error(result.error ?? 'The label was not changed.');
        resolve(false);
        return;
      }
      toast.success(done);
      resolve(true);
      router.refresh();
    }));
  }

  function choose(option: LabelChoice) {
    return 'label' in option
      ? send({ op: 'attach', labelId: option.label.id }, `Labelled #${option.label.name}.`)
      : send({ op: 'attach', name: option.create }, `Created and added #${option.create}.`);
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
      {canEdit ? <LabelCombobox catalogue={catalogue} current={labels} canCreate={canCreate} disabled={busy} onChoose={choose} /> : null}
    </div>
  );
}
