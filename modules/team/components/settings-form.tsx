'use client';

import * as React from 'react';
import { AlertCircleIcon, LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  updateDisplayName,
  type SettingsActionState,
} from '@/modules/team/profile-actions';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import type { User } from '@/types/tracker';

export interface SettingsFormProps {
  profile: User;
}

const INITIAL_STATE: SettingsActionState | null = null;

/**
 * Display name editor.
 *
 * The only mutable field on a profile from the member's own side. Everything else
 * shown on the settings page is read-only because the row-level security policy
 * pins it.
 */
export function SettingsForm({ profile }: SettingsFormProps) {
  const [state, action, pending] = React.useActionState(
    updateDisplayName,
    INITIAL_STATE,
  );

  const error = state && !state.success ? state.error : undefined;
  const succeeded = state?.success === true;

  React.useEffect(() => {
    if (succeeded) {
      toast.success('Profile updated', {
        description: 'Your display name has been saved.',
      });
    }
  }, [succeeded]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="settings-full-name"
          className="text-foreground text-sm font-medium"
        >
          Display name
        </label>
        <Input
          id="settings-full-name"
          name="fullName"
          defaultValue={profile.fullName}
          maxLength={100}
          required
          aria-invalid={error !== undefined}
          aria-describedby="settings-full-name-hint"
          className="max-w-sm"
        />
        <p
          id="settings-full-name-hint"
          className="text-muted-foreground text-xs"
        >
          Shown on task assignments, the analytics dashboard, and your rail
          initials.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          aria-live="polite"
          className="flex max-w-sm items-start gap-2 rounded-md border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          <AlertCircleIcon
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          {error}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? (
          <>
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            Saving
          </>
        ) : (
          'Save changes'
        )}
      </Button>
    </form>
  );
}
