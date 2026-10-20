import * as React from 'react';

import { cn } from '@/shared/utils';

import styles from './space.module.css';

const SPARKLES = [
  { cx: 50, cy: 176, r: 1.7, delay: '0s' },
  { cx: 46, cy: 198, r: 1.3, delay: '-0.6s' },
  { cx: 54, cy: 220, r: 1.5, delay: '-1.2s' },
  { cx: 49, cy: 244, r: 1.1, delay: '-1.8s' },
] as const;

/**
 * Low-poly rocket climbing up and to the right, with a flickering flame and a
 * lavender trail. Drawn upright and rotated by CSS.
 *
 * Three wrappers, because one element cannot carry two animations on
 * `transform`: the outer one takes the scroll parallax (`parallax`), the
 * middle one the idle float, and the SVG itself the fixed tilt.
 *
 * `id` keeps gradient ids unique when the rocket appears more than once.
 */
export function Rocket({
  id,
  className,
  parallax = false,
}: {
  id: string;
  className?: string;
  parallax?: boolean;
}) {
  const trail = `${id}-trail`;
  const port = `${id}-port`;

  return (
    <div
      className={cn(styles.rocket, parallax && styles.rocketParallax, className)}
      aria-hidden="true"
    >
      <div className={styles.float}>
        <svg viewBox="0 0 100 260" focusable="false">
          <defs>
            <linearGradient id={trail} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f5a623" stopOpacity={0.9} />
              <stop offset="0.22" stopColor="#a5a0f0" stopOpacity={0.75} />
              <stop offset="1" stopColor="#a5a0f0" stopOpacity={0} />
            </linearGradient>
            <radialGradient id={port} cx="0.35" cy="0.35" r="0.75">
              <stop offset="0" stopColor="#8b7cf6" />
              <stop offset="1" stopColor="#1a172e" />
            </radialGradient>
          </defs>

          {/* Trail: a soft wide glow under a narrower core. */}
          <polygon
            className={styles.trailGlow}
            points="34,132 66,132 61,260 39,260"
            fill={`url(#${trail})`}
            opacity={0.45}
          />
          <polygon points="42,132 58,132 54,260 46,260" fill={`url(#${trail})`} />
          {SPARKLES.map((sparkle) => (
            <circle
              key={sparkle.cy}
              className={styles.sparkle}
              cx={sparkle.cx}
              cy={sparkle.cy}
              r={sparkle.r}
              fill="#ffffff"
              style={{ animationDelay: sparkle.delay }}
            />
          ))}

          {/* Flame */}
          <g className={styles.flame}>
            <polygon points="39,128 61,128 50,178" fill="#f26b1d" />
            <polygon points="42,128 58,128 50,164" fill="#f5a623" />
            <polygon points="45,128 55,128 50,148" fill="#fff0d4" />
          </g>

          {/* Nozzle */}
          <polygon points="36,116 50,116 50,130 40,130" fill="#5c5776" />
          <polygon points="50,116 64,116 60,130 50,130" fill="#474554" />

          {/* Side fins, lit on the left */}
          <polygon points="28,82 6,130 18,116" fill="#8b7cf6" />
          <polygon points="28,82 18,116 28,118" fill="#6355e6" />
          <polygon points="72,82 94,130 82,116" fill="#4a39cc" />
          <polygon points="72,82 82,116 72,118" fill="#3b2fa8" />

          {/* Body, lit on the left */}
          <polygon points="28,46 50,40 50,118 26,118" fill="#ffffff" />
          <polygon points="50,40 72,46 74,118 50,118" fill="#d9d5f2" />

          {/* Gold band */}
          <polygon points="26.6,98 50,98 50,106 26.4,106" fill="#f5a623" />
          <polygon points="50,98 73.4,98 73.6,106 50,106" fill="#d48a10" />

          {/* Nose cone */}
          <polygon points="50,2 28,46 50,40" fill="#8b7cf6" />
          <polygon points="50,2 72,46 50,40" fill="#6355e6" />

          {/* Centre fin */}
          <polygon points="47,94 53,94 52,126 48,126" fill="#4a39cc" />

          {/* Porthole */}
          <circle cx={50} cy={70} r={11} fill="#2c2470" stroke="#a5a0f0" strokeWidth={3} />
          <circle cx={50} cy={70} r={8} fill={`url(#${port})`} />
          <ellipse cx={46.5} cy={66.5} rx={3} ry={2} fill="#ffffff" opacity={0.8} />
        </svg>
      </div>
    </div>
  );
}
