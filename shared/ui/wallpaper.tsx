import type * as React from 'react';

import { STELLAR_STAR_PATHS } from '@/shared/ui/stellar-mark';
import { cn } from '@/shared/utils';

/**
 * Faint line art behind a section's pages (27 October 2026, ported from the
 * Catalyst tracker): one motif per area, so the page says where you are
 * before its title does. Fixed behind the content and pinned to the top-right
 * corner at every width, it shows through the translucent top bar and behind
 * route skeletons, never on paper. Colours are chart tokens, so it follows the
 * theme; `--wallpaper-strength` sets its opacity per theme.
 *
 * Every motif is drawn from a seeded generator, so server and client markup
 * match exactly and a reload shows the same picture.
 */
export type WallpaperMotif = 'constellation' | 'honeycomb' | 'bubbles' | 'sparkles' | 'waves' | 'facets';

export const WALLPAPER_MOTIFS: readonly WallpaperMotif[] = ['constellation', 'honeycomb', 'bubbles', 'sparkles', 'waves', 'facets'];

const W = 1200;
const H = 800;
const COLOURS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-3)'] as const;

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

function constellation(): React.ReactNode[] {
  const next = rng(11);
  const nodes = Array.from({ length: 30 }, () => ({
    x: r1(520 + next() * 680),
    y: r1(-20 + next() * 420),
    r: r1(2.5 + next() * 6),
    colour: COLOURS[Math.floor(next() * COLOURS.length)],
  }));
  const out: React.ReactNode[] = [];
  nodes.forEach((a, i) => {
    nodes.slice(i + 1).forEach((b, j) => {
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 150) out.push(<line key={`l${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--chart-8)" strokeWidth={1} strokeOpacity={0.55} />);
    });
  });
  nodes.forEach((node, i) => out.push(<circle key={`c${i}`} cx={node.x} cy={node.y} r={node.r} fill={node.colour} fillOpacity={0.55} />));
  return out;
}

function honeycomb(): React.ReactNode[] {
  const next = rng(23);
  const out: React.ReactNode[] = [];
  const size = 34;
  const dx = size * Math.sqrt(3);
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 12; col++) {
      if (next() > 0.62) continue;
      const cx = 560 + col * dx + (row % 2 ? dx / 2 : 0);
      const cy = -10 + row * size * 1.5;
      const points = Array.from({ length: 6 }, (_, k) => {
        const angle = (Math.PI / 180) * (60 * k + 30);
        return `${r1(cx + size * Math.cos(angle))},${r1(cy + size * Math.sin(angle))}`;
      }).join(' ');
      out.push(<polygon key={`h${row}-${col}`} points={points} fill="none" stroke={COLOURS[Math.floor(next() * COLOURS.length)]} strokeWidth={1.6} strokeOpacity={0.6} strokeLinejoin="round" />);
    }
  }
  return out;
}

function bubbles(): React.ReactNode[] {
  const next = rng(37);
  return Array.from({ length: 22 }, (_, i) => {
    const big = next() > 0.6;
    const cx = r1(i < 16 ? 600 + next() * 640 : next() * 360);
    const cy = r1(i < 16 ? -40 + next() * 420 : 480 + next() * 360);
    const r = r1(big ? 40 + next() * 90 : 8 + next() * 30);
    const colour = COLOURS[Math.floor(next() * COLOURS.length)];
    return <circle key={`b${i}`} cx={cx} cy={cy} r={r} fill={colour} fillOpacity={big ? 0.07 : 0.28} stroke={colour} strokeWidth={1.4} strokeOpacity={0.5} />;
  });
}

function sparkles(): React.ReactNode[] {
  const next = rng(41);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < 16; i++) {
    const size = r1(i < 5 ? 60 + next() * 90 : 14 + next() * 36);
    const x = r1(i % 4 === 3 ? next() * 300 : 560 + next() * 640);
    const y = r1(i % 4 === 3 ? 480 + next() * 320 : -30 + next() * 420);
    const colour = i % 3 === 0 ? 'var(--recognition)' : COLOURS[Math.floor(next() * COLOURS.length)];
    out.push(
      <g key={`s${i}`} transform={`translate(${x} ${y}) scale(${r1(size / 24)})`} fill={colour} fillOpacity={0.4}>
        <path d={STELLAR_STAR_PATHS[0]} />
      </g>,
    );
  }
  for (let i = 0; i < 14; i++) {
    out.push(<circle key={`d${i}`} cx={r1(500 + next() * 700)} cy={r1(next() * 520)} r={r1(2 + next() * 3)} fill={COLOURS[Math.floor(next() * COLOURS.length)]} fillOpacity={0.5} />);
  }
  return out;
}

function waves(): React.ReactNode[] {
  const next = rng(53);
  return Array.from({ length: 6 }, (_, i) => {
    const base = 40 + i * 52 + next() * 20;
    const amp = 24 + next() * 40;
    let d = `M-20 ${r1(base)}`;
    for (let x = 0; x <= W + 240; x += 240) {
      d += ` C ${x + 60} ${r1(base - amp)}, ${x + 180} ${r1(base + amp)}, ${x + 240} ${r1(base)}`;
    }
    return <path key={`w${i}`} d={d} fill="none" stroke={COLOURS[i % COLOURS.length]} strokeWidth={1.6} strokeOpacity={0.5} />;
  });
}

function facets(): React.ReactNode[] {
  const next = rng(67);
  return Array.from({ length: 20 }, (_, i) => {
    const cx = i < 14 ? 640 + next() * 600 : next() * 320;
    const cy = i < 14 ? -20 + next() * 400 : 520 + next() * 320;
    const size = 50 + next() * 110;
    const points = Array.from({ length: 3 }, (_, k) => {
      const angle = next() * 0.6 + (k * 2 * Math.PI) / 3;
      return `${r1(cx + size * Math.cos(angle))},${r1(cy + size * Math.sin(angle))}`;
    }).join(' ');
    const colour = COLOURS[Math.floor(next() * COLOURS.length)];
    return <polygon key={`f${i}`} points={points} fill={colour} fillOpacity={next() > 0.6 ? 0.08 : 0} stroke={colour} strokeWidth={1.3} strokeOpacity={0.5} strokeLinejoin="round" />;
  });
}

const DRAW: Record<WallpaperMotif, () => React.ReactNode[]> = { constellation, honeycomb, bubbles, sparkles, waves, facets };

export function Wallpaper({ motif, className }: { motif: WallpaperMotif; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      data-wallpaper={motif}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMaxYMin slice"
      className={cn('pointer-events-none fixed inset-0 -z-10 h-dvh w-full select-none print:hidden', className)}
      style={{ opacity: 'var(--wallpaper-strength)' }}
    >
      {DRAW[motif]()}
    </svg>
  );
}
