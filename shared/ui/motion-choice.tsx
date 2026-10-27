'use client';

import { SegmentedControl } from '@/shared/ui/segmented-control';
import { useTheme, type MotionPreference } from '@/shared/ui/theme';

/** Normal / Reduced, in that order, for Settings and the account menu. */
export const MOTION_OPTIONS: readonly { value: MotionPreference; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'reduce', label: 'Reduced' },
];

/**
 * Reduce motion for this device: stops the splash, page rises, ringing bell,
 * confetti and every other decorative animation, also on a phone that has no
 * such setting of its own. The OS setting still applies when this is Normal.
 */
export function MotionChoice() {
  const { motion, setMotion } = useTheme();
  return <SegmentedControl label="Motion" value={motion} options={MOTION_OPTIONS} onValueChange={setMotion} />;
}
