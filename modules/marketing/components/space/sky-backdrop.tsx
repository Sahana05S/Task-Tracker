import * as React from 'react';

import { cn } from '@/shared/utils';

import { StarField } from './star-field';
import styles from './space.module.css';

/** Night sky gradient with a violet glow toward the horizon, and stars. */
export function SkyBackdrop({ className }: { className?: string }) {
  return (
    <div className={cn(styles.sky, className)} aria-hidden="true">
      <StarField count={110} seed={7} />
    </div>
  );
}
