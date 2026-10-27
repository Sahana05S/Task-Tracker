import type * as React from 'react';

import { STELLAR_STAR_PATHS } from '@/shared/ui/stellar-mark';
import { cn } from '@/shared/utils';

/**
 * Faint space art behind a section's pages: one motif per area, so the page
 * says where you are before its title does. Redrawn 28 October 2026 (user
 * request) to suit Stellar's space theme and stay quiet: stars, a
 * constellation, orbits and sparkles replace the earlier honeycomb, waves,
 * bubbles and facets. It is fixed behind the content in the top-right corner
 * and fades out towards the page (a radial mask), shows through the
 * translucent top bar and behind route skeletons, and never prints. Colours
 * are theme tokens (`currentColor` is the page's ink), so it follows light and
 * dark; `--wallpaper-strength` sets its opacity per theme.
 *
 * Every motif is drawn from a seeded generator, so server and client markup
 * match exactly and a reload shows the same picture.
 */
export type WallpaperMotif = 'starfield' | 'constellation' | 'orbits' | 'sparkles';

export const WALLPAPER_MOTIFS: readonly WallpaperMotif[] = ['starfield', 'constellation', 'orbits', 'sparkles'];

const W = 1200;
const H = 800;
/** Pin-prick stars: the page's ink and the brand violet. */
const DUST = ['currentColor', 'var(--primary)'] as const;
/** The few brighter stars and planets: violet and recognition gold. */
const ACCENT = ['var(--primary)', 'var(--recognition)'] as const;

/** mulberry32: small, fast and deterministic for a given seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (value: number) => Math.round(value * 10) / 10;
const pick = <T,>(list: readonly T[], next: () => number): T => list[Math.floor(next() * list.length)];

/** Tiny dots, denser towards the top-right corner. */
function dust(seed: number, count: number): React.ReactNode[] {
  const next = rng(seed);
  return Array.from({ length: count }, (_, i) => {
    // Squaring pulls points towards the corner (x = W, y = 0).
    const x = r1(W - next() ** 1.6 * 820);
    const y = r1(next() ** 1.6 * 560);
    const r = r1(0.6 + next() ** 3 * 1.6);
    return <circle key={`d${seed}-${i}`} cx={x} cy={y} r={r} fill={pick(DUST, next)} fillOpacity={r1(0.35 + next() * 0.45)} />;
  });
}

/** A four-point Stellar star centred on (x, y), `size` px across. */
function star(key: string, x: number, y: number, size: number, colour: string, opacity: number): React.ReactNode {
  const scale = r1((size / 17) * 10) / 10;
  return (
    <g key={key} transform={`translate(${r1(x - 11 * scale)} ${r1(y - 13 * scale)}) scale(${scale})`} fill={colour} fillOpacity={opacity}>
      <path d={STELLAR_STAR_PATHS[0]} />
    </g>
  );
}

function starfield(): React.ReactNode[] {
  const next = rng(11);
  const stars = Array.from({ length: 5 }, (_, i) =>
    star(`s${i}`, W - 60 - next() * 640, 30 + next() * 380, 10 + next() * 10, pick(ACCENT, next), 0.6));
  return [...dust(101, 90), ...stars];
}

function constellation(): React.ReactNode[] {
  const next = rng(23);
  // One open chain of stars, like a drawn constellation, not a mesh.
  const nodes = Array.from({ length: 8 }, (_, i) => ({
    x: r1(W - 90 - i * 78 - next() * 40),
    y: r1(70 + next() * 260 + (i % 2) * 40),
    r: r1(1.6 + next() * 1.8),
  }));
  const lines = nodes.slice(1).map((b, i) => {
    const a = nodes[i];
    return <line key={`l${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--primary)" strokeWidth={0.9} strokeOpacity={0.55} strokeLinecap="round" />;
  });
  const points = nodes.map((node, i) => <circle key={`c${i}`} cx={node.x} cy={node.y} r={node.r} fill={i === 2 ? 'var(--recognition)' : 'var(--primary)'} fillOpacity={0.8} />);
  return [...dust(202, 60), ...lines, ...points, star('bright', nodes[2].x, nodes[2].y, 14, 'var(--recognition)', 0.55)];
}

function orbits(): React.ReactNode[] {
  // Thin orbits around a sun just off the top-right corner, each with a small planet.
  const cx = W + 40;
  const cy = -60;
  const rings = [
    { rx: 260, angle: 128, r: 4, colour: 'var(--recognition)' },
    { rx: 430, angle: 146, r: 5.5, colour: 'var(--primary)' },
    { rx: 620, angle: 136, r: 3.5, colour: 'var(--primary)' },
  ];
  const out: React.ReactNode[] = rings.map((ring, i) => (
    <ellipse key={`o${i}`} cx={cx} cy={cy} rx={ring.rx} ry={r1(ring.rx * 0.46)} fill="none" stroke="var(--primary)" strokeWidth={1} strokeOpacity={0.5} strokeDasharray={i === 1 ? '2 6' : undefined} transform={`rotate(-14 ${cx} ${cy})`} />
  ));
  rings.forEach((ring, i) => {
    const t = (ring.angle * Math.PI) / 180;
    // The point on the rotated ellipse at parameter t.
    const ex = ring.rx * Math.cos(t);
    const ey = ring.rx * 0.46 * Math.sin(t);
    const rot = (-14 * Math.PI) / 180;
    const x = r1(cx + ex * Math.cos(rot) - ey * Math.sin(rot));
    const y = r1(cy + ex * Math.sin(rot) + ey * Math.cos(rot));
    out.push(<circle key={`p${i}`} cx={x} cy={y} r={ring.r} fill={ring.colour} fillOpacity={0.75} />);
  });
  return [...dust(303, 50), ...out];
}

function sparkles(): React.ReactNode[] {
  const next = rng(41);
  const stars = Array.from({ length: 9 }, (_, i) =>
    star(`k${i}`, W - 40 - next() ** 1.3 * 700, 24 + next() ** 1.3 * 420, i < 3 ? 18 + next() * 10 : 7 + next() * 8, i % 3 === 0 ? 'var(--recognition)' : 'var(--primary)', 0.55));
  return [...dust(404, 45), ...stars];
}

const DRAW: Record<WallpaperMotif, () => React.ReactNode[]> = { starfield, constellation, orbits, sparkles };

export function Wallpaper({ motif, className, fade = true }: {
  motif: WallpaperMotif;
  className?: string;
  /** Fade out away from the top-right corner (off for a panel that should be filled, e.g. sign-in). */
  fade?: boolean;
}) {
  const mask = `wallpaper-fade-${motif}`;
  return (
    <svg
      aria-hidden="true"
      data-wallpaper={motif}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMaxYMin slice"
      className={cn('pointer-events-none fixed inset-0 -z-10 h-dvh w-full select-none print:hidden', className)}
      style={{ opacity: 'var(--wallpaper-strength)' }}
    >
      {fade ? (
        <defs>
          <radialGradient id={`${mask}-g`} cx={W} cy={0} r={950} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="white" />
            <stop offset="0.55" stopColor="white" stopOpacity="0.7" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id={mask} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
            <rect width={W} height={H} fill={`url(#${mask}-g)`} />
          </mask>
        </defs>
      ) : null}
      <g mask={fade ? `url(#${mask})` : undefined}>{DRAW[motif]()}</g>
    </svg>
  );
}
