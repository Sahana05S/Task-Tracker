import * as React from 'react';

import { PLANET, planetFacets } from '@/modules/marketing/internal/space/geometry';
import { cn } from '@/shared/utils';

import styles from './space.module.css';

/**
 * Low-poly planet: a shaded triangle mesh (violet ocean, mint land) clipped to
 * a disc, with a terminator shadow, a rim light and a tilted ring whose front
 * half passes in front of the sphere.
 *
 * Rendered once per page, so the SVG ids are fixed.
 */
export function LowPolyPlanet({ className }: { className?: string }) {
  const facets = planetFacets();
  const { size, cx, cy, r } = PLANET;

  const ring = (
    <>
      <ellipse
        cx={cx}
        cy={cy}
        rx={196}
        ry={40}
        fill="none"
        stroke="url(#tp-planet-ring)"
        strokeWidth={6}
      />
      <ellipse
        cx={cx}
        cy={cy}
        rx={176}
        ry={33}
        fill="none"
        stroke="#a5a0f0"
        strokeOpacity={0.55}
        strokeWidth={2}
      />
    </>
  );

  return (
    <div className={cn(styles.planet, styles.planetParallax, className)} aria-hidden="true">
      <div className={styles.planetGlow} />
      <svg viewBox={`0 0 ${size} ${size}`} focusable="false">
        <defs>
          <clipPath id="tp-planet-disc">
            <circle cx={cx} cy={cy} r={r} />
          </clipPath>
          <clipPath id="tp-planet-front">
            <rect x={0} y={cy} width={size} height={size / 2} />
          </clipPath>
          <radialGradient id="tp-planet-night" cx="0.3" cy="0.28" r="0.85">
            <stop offset="0.45" stopColor="#110e26" stopOpacity={0} />
            <stop offset="1" stopColor="#110e26" stopOpacity={0.72} />
          </radialGradient>
          <linearGradient id="tp-planet-ring" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#a5a0f0" stopOpacity={0.3} />
            <stop offset="0.5" stopColor="#6ee7c8" />
            <stop offset="1" stopColor="#a5a0f0" stopOpacity={0.3} />
          </linearGradient>
        </defs>

        {/* Back half of the ring, behind the sphere. */}
        <g transform={`rotate(-20 ${cx} ${cy})`} opacity={0.6}>
          {ring}
        </g>

        <g clipPath="url(#tp-planet-disc)">
          {facets.map((facet, index) => (
            <polygon
              key={index}
              points={facet.points}
              fill={facet.fill}
              stroke={facet.fill}
              strokeWidth={0.6}
              strokeLinejoin="round"
            />
          ))}
          <circle cx={cx} cy={cy} r={r} fill="url(#tp-planet-night)" />
        </g>

        {/* Rim light and a faint mint atmosphere. */}
        <circle cx={cx} cy={cy} r={r - 1} fill="none" stroke="#c9c3ff" strokeOpacity={0.55} strokeWidth={2} />
        <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="#6ee7c8" strokeOpacity={0.16} strokeWidth={6} />

        {/* Front half of the ring, over the sphere. */}
        <g transform={`rotate(-20 ${cx} ${cy})`}>
          <g clipPath="url(#tp-planet-front)">{ring}</g>
        </g>
      </svg>
    </div>
  );
}
