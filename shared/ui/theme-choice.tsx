'use client';

import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from 'lucide-react';

import { SegmentedControl } from '@/shared/ui/segmented-control';
import { useTheme, type ThemePreference } from '@/shared/ui/theme';

/** The three choices, in the order the account menu and Settings show them. Kept out of the provider so the root bundle carries no icons. */
export const THEME_OPTIONS: readonly { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
];

/** Light / Dark / System for this device, as in the account menu. */
export function ThemeChoice() {
  const { preference, setPreference } = useTheme();
  return <SegmentedControl label="Theme" value={preference} options={THEME_OPTIONS} onValueChange={setPreference} />;
}
