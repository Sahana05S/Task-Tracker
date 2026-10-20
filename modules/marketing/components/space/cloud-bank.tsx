import * as React from 'react';

import {
  CLOUD_VIEWBOX,
  cloudPuffs,
  type PuffRow,
} from '@/modules/marketing/internal/space/geometry';
import {
  CLOUD_LAYERS,
  layerStyle,
  type CloudTone,
} from '@/modules/marketing/internal/space/layers';
import { cn } from '@/shared/utils';

import styles from './space.module.css';

type SolidTone = Exclude<CloudTone, 'haze'>;

interface ToneSpec {
  seed: number;
  rows: readonly PuffRow[];
  /** Top-lit gradient: highlight, body, underside. */
  stops: readonly [string, string, string];
  /** Where the solid fill below the puffs starts, in viewBox units. */
  baseFrom: number;
  baseColor: string;
  className: string;
}

/*
  Lavender family from globals.css: the back layer is the chart lavender, the
  middle layer the input lavender, the front layer white like the sections
  below. Every row's radius is at least 0.63 of its step, so neighbouring puffs
  always overlap and the silhouette has no gaps.
*/
const TONES: Record<SolidTone, ToneSpec> = {
  back: {
    seed: 11,
    rows: [
      { y: 135, rMin: 78, rMax: 104, step: 120, jitterY: 24 },
      { y: 195, rMin: 74, rMax: 100, step: 110, jitterY: 16 },
    ],
    stops: ['#e4e1ff', '#b4adf3', '#8379de'],
    baseFrom: 210,
    baseColor: '#9f97ea',
    className: styles.bandBack,
  },
  mid: {
    seed: 23,
    rows: [
      { y: 125, rMin: 68, rMax: 92, step: 104, jitterY: 22 },
      { y: 185, rMin: 66, rMax: 96, step: 100, jitterY: 14 },
    ],
    stops: ['#ffffff', '#dcd8ee', '#b2aae6'],
    baseFrom: 200,
    baseColor: '#cfcaea',
    className: styles.bandMid,
  },
  front: {
    seed: 37,
    rows: [
      { y: 112, rMin: 62, rMax: 86, step: 96, jitterY: 20 },
      { y: 168, rMin: 62, rMax: 92, step: 92, jitterY: 14 },
      { y: 222, rMin: 66, rMax: 90, step: 96, jitterY: 8 },
    ],
    stops: ['#ffffff', '#f3f1fb', '#cfc8ee'],
    baseFrom: 230,
    baseColor: '#ffffff',
    className: styles.bandFront,
  },
};

function CloudSvg({ tone }: { tone: SolidTone }) {
  const spec = TONES[tone];
  const rows = cloudPuffs(spec.seed, spec.rows);
  const gradient = `tp-cloud-${tone}`;
  const lastRow = rows.length - 1;

  return (
    <svg
      viewBox={`0 0 ${CLOUD_VIEWBOX.width} ${CLOUD_VIEWBOX.height}`}
      preserveAspectRatio="xMidYMax slice"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={spec.stops[0]} />
          <stop offset="0.5" stopColor={spec.stops[1]} />
          <stop offset="1" stopColor={spec.stops[2]} />
        </linearGradient>
      </defs>
      {rows.map((puffs, rowIndex) => (
        <g key={rowIndex}>
          {puffs.map((puff, index) => (
            <circle
              key={index}
              cx={puff.cx}
              cy={puff.cy}
              r={puff.r}
              // The front band's last row sits on the white base, so it is
              // solid white to avoid a seam where the two meet.
              fill={tone === 'front' && rowIndex === lastRow ? spec.baseColor : `url(#${gradient})`}
            />
          ))}
        </g>
      ))}
      <rect
        x={0}
        y={spec.baseFrom}
        width={CLOUD_VIEWBOX.width}
        height={CLOUD_VIEWBOX.height - spec.baseFrom + 1}
        fill={spec.baseColor}
      />
    </svg>
  );
}

/**
 * The cloud bank along the bottom of the hero: back, middle and front bands
 * plus a soft haze. Each band rises at its own speed as the hero scrolls away
 * (see `CLOUD_LAYERS`), and the front band continues as solid white below the
 * hero so the bank clears into the page rather than uncovering sky.
 */
export function CloudBank({ className }: { className?: string }) {
  return (
    <div className={cn(styles.clouds, className)} aria-hidden="true">
      {CLOUD_LAYERS.map((layer) =>
        layer.tone === 'haze' ? (
          <div key={layer.id} className={cn(styles.band, styles.haze)} style={layerStyle(layer)} />
        ) : (
          <div
            key={layer.id}
            className={cn(styles.band, TONES[layer.tone].className)}
            style={layerStyle(layer)}
          >
            <div className={styles.drift}>
              <CloudSvg tone={layer.tone} />
              {layer.tone === 'front' ? <div className={styles.base} /> : null}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
