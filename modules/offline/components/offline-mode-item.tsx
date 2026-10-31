'use client';

import { useEffect, useState } from 'react';

import { isNativeApp } from '@/modules/mobile/client';
import { DropdownMenuCheckboxItem } from '@/shared/ui/dropdown-menu';

import { OFFLINE_MODE_EVENT } from '@/modules/offline/internal/rules';
import { readOfflineMode, writeOfflineMode } from '@/modules/offline/internal/store';

/**
 * "Offline mode (beta)" in the account menu, inside the Android app only. On:
 * the phone keeps a copy of the member's missions to view without a connection.
 */
export function OfflineModeItem() {
  const [native, setNative] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    setNative(true);
    setOn(readOfflineMode());
  }, []);

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
      Offline mode (beta)
    </DropdownMenuCheckboxItem>
  );
}
