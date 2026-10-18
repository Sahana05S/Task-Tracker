'use client';

import * as React from 'react';
import { AlertCircleIcon } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/shared/ui/select';
import { cn } from '@/shared/utils';

/**
 * Shared field scaffolding for the drawer forms.
 *
 * Extracted because the task, milestone and statement editors all need the same
 * label-hint-control stack and the same select-inside-a-label arrangement, and
 * three private copies would drift apart the first time one of them changed.
 */

export interface FieldProps {
  /** Must match the `id` on the control passed as `children`. */
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  id,
  label,
  hint,
  required = false,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-foreground text-sm font-medium">
        {label}
        {required ? (
          <span className="ml-0.5 text-rose-600" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only">(required)</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface LabeledSelectProps {
  id: string;
  label: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  hint?: string;
  required?: boolean;
  className?: string;
}

/**
 * Select wrapped in a label.
 *
 * `name` is kept so Radix emits the hidden native control that carries the value
 * into the form submission, and the trigger renders a resolved label directly
 * rather than relying on Radix deriving one from items that only mount once the
 * menu has been opened — which is what left these triggers blank in SSR.
 */
export function LabeledSelect({
  id,
  label,
  name,
  value,
  onValueChange,
  options,
  hint,
  required = false,
  className,
}: LabeledSelectProps) {
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? '';

  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      required={required}
      className={className}
    >
      <Select
        name={name}
        value={value}
        onValueChange={onValueChange}
        required={required}
      >
        <SelectTrigger
          id={id}
          aria-describedby={hint ? `${id}-hint` : undefined}
        >
          {selectedLabel}
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/* -------------------------------------------------------------------------- */
/* Error banner                                                               */
/* -------------------------------------------------------------------------- */

export interface FormErrorProps {
  /** Nothing renders when undefined, so callers can pass an action state through. */
  message?: string;
  className?: string;
}

/** Inline failure message for a form, announced once when it appears. */
export function FormError({ message, className }: FormErrorProps) {
  if (!message) return null;

  return (
    <p
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700',
        className,
      )}
    >
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
