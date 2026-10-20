import * as React from 'react';

import { seededStars } from '@/modules/marketing/internal/space/stars';
import { cn } from '@/shared/utils';

import styles from './space.module.css';

const TWINKLE = ['', styles.twinkleSlow, styles.twinkleFast] as const;

/**
 * Seeded star field. Same seed, same sky, on the server and the client.
 * Twinkling stars get staggered negative delays so they never blink in unison.
 */
export function StarField({
  count = 90,
  seed = 7,
  twinkle = true,
  className,
}: {
  count?: number;
  seed?: number;
  twinkle?: boolean;
  className?: string;
}) {
  const stars = seededStars(count, seed);

  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      className={cn(styles.stars, className)}
      aria-hidden="true"
      focusable="false"
    >
      {stars.map((star, index) => (
        <circle
          key={index}
          cx={star.x}
          cy={star.y}
          r={star.r}
          className={cn(star.gold ? styles.starGold : styles.star, twinkle && TWINKLE[star.group])}
          style={
            twinkle && star.group > 0
              ? { animationDelay: `-${((index * 0.73) % 4.7).toFixed(2)}s` }
              : undefined
          }
        />
      ))}
    </svg>
  );
}
