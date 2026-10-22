'use client';

import { SegmentedControl } from '@/shared/ui/segmented-control';
import { THEME_OPTIONS, useTheme } from '@/shared/ui/theme';

/** Light / Dark / System for this device, as in the account menu. */
export function ThemeChoice() {
  const { preference, setPreference } = useTheme();
  return <SegmentedControl label="Theme" value={preference} options={THEME_OPTIONS} onValueChange={setPreference} />;
}
