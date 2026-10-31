'use client';

import { useEffect, useState } from 'react';

import { isNativeApp } from '@/modules/mobile/client';
import { DropdownMenuCheckboxItem } from '@/shared/ui/dropdown-menu';

import { OFFLINE_MODE_EVENT, offlineStatusLabel } from '@/modules/offline/internal/rules';
import { readOfflineMode, writeOfflineMode } from '@/modules/offline/internal/store';
import { readOfflineStatus } from '@/modules/offline/internal/worker-client';

/**
 * "Offline mode (beta)" in the account menu, inside the Android app only. On:
 * the phone keeps a copy of the member's missions to view without a connection.
 * The line underneath says what the phone has, so a failed offline test can be
 * traced to its step.
 */
export function OfflineModeItem({ userId }: { readonly userId: string }) {
  const [native, setNative] = useState(false);
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    setNative(true);
    setOn(readOfflineMode());
  }, []);

  useEffect(() => {
    if (!native || !on) {
      setStatus(null);
      return;
    }
    let stopped = false;
    const read = () => void readOfflineStatus(userId).then((value) => {
      if (!stopped) setStatus(offlineStatusLabel(value));
    }, () => undefined);
    read();
    // Setting up takes a few seconds after the switch is turned on.
    const timer = window.setInterval(read, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [native, on, userId]);

  if (!native) return null;
  return (
    <DropdownMenuCheckboxItem
      checked={on}
      onCheckedChange={(checked) => {
        writeOfflineMode(checked);
        setOn(checked);
        window.dispatchEvent(new Event(OFFLINE_MODE_EVENT));
      }}
      onSelect={(event) => event.preventDefault()}
    >
      <span className="flex min-w-0 flex-col">
        <span>Offline mode (beta)</span>
        {status && <span className="text-muted-foreground truncate text-[11px]">{status}</span>}
      </span>
    </DropdownMenuCheckboxItem>
  );
}
