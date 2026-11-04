'use client';

import * as React from 'react';
import { CheckIcon, HardDriveIcon, LoaderCircleIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { connectSharedDrive, type ConnectSharedDriveState } from '@/modules/files/actions';
import { fileStorageLine, type FileStorageHealth } from '@/modules/files/client';
import { Button } from '@/shared/ui/button';
import { FormError } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { MissionNotice, MissionPanel } from '@/shared/ui/mission-ui';

/**
 * Settings > Company (managing director): connect the company's Shared Drive
 * (`file_storage_configure`, migration 100) and see whether files reach it.
 * Until it is connected, uploads stay in the app and move once it is.
 */
export function ConnectSharedDrive({ health }: { health: FileStorageHealth }) {
  const router = useRouter();
  const line = fileStorageLine(health);
  const [state, action, pending] = React.useActionState(async (previous: ConnectSharedDriveState | null, form: FormData) => {
    try {
      const result = await connectSharedDrive(previous, form);
      if (result.success) router.refresh();
      return result;
    } catch {
      return { success: false, error: 'The connection dropped. Press Connect again.' };
    }
  }, null);

  return (
    <MissionPanel
      icon={HardDriveIcon}
      title="Shared Drive"
      subtitle="Where uploaded documents and proofs are kept. Nothing in the drive is shared with staff; they open files through the app."
    >
      <div className="grid gap-4">
        <MissionNotice tone={line.attention ? 'attention' : 'info'} icon={HardDriveIcon} role="status">
          {line.text}
        </MissionNotice>
        {health.account ? (
          <p className="text-muted-foreground text-xs">
            Add <span className="text-foreground font-mono">{health.account}</span> to the drive as a Content manager.
          </p>
        ) : null}
        <form action={action} className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="text-foreground font-medium">{health.configured ? 'Change the Shared Drive' : 'Shared Drive id'}</span>
            <Input
              name="sharedDriveId"
              required
              maxLength={300}
              autoComplete="off"
              spellCheck={false}
              placeholder="The code at the end of the drive's address, or the whole address"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : null}
              Connect
            </Button>
            {state?.success && !pending ? (
              <span role="status" className="text-success-strong inline-flex items-center gap-1 text-xs font-medium">
                <CheckIcon className="size-3.5" aria-hidden="true" />
                Connected to {state.data?.sharedDriveId}
              </span>
            ) : null}
          </div>
          <FormError message={state && !state.success ? state.error : undefined} />
        </form>
      </div>
    </MissionPanel>
  );
}
