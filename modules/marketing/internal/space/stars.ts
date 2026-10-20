/**
 * Deterministic star field for the landing page sky.
 *
 * The stars are rendered on the server and hydrated on the client, so the
 * positions must be identical on both sides. `Math.random()` would produce a
 * different sky on each render and a hydration mismatch; a small seeded PRNG
 * gives the same sky every time for the same seed.
 */

export interface StarBounds {
  width: number;
  height: number;
}

/** Twinkle group: 0 is static, 1 twinkles slowly, 2 twinkles quickly. */
export type StarGroup = 0 | 1 | 2;

export interface Star {
  x: number;
  y: number;
  r: number;
  group: StarGroup;
  /** Gold stars borrow the recognition colour; most are white. */
  gold: boolean;
}

export const STAR_RADII = [0.8, 1.1, 1.5, 2.1] as const;

const DEFAULT_BOUNDS: StarBounds = { width: 1440, height: 900 };

/** mulberry32: a tiny, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rounds to one decimal so the SVG markup stays short. */
function tidy(value: number): number {
  return Math.round(value * 10) / 10;
}

export function seededStars(
  count: number,
  seed: number,
  bounds: StarBounds = DEFAULT_BOUNDS,
): Star[] {
  const random = mulberry32(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = tidy(random() * bounds.width);
    const y = tidy(random() * bounds.height);
    // Small stars dominate; a few bright ones give the sky depth.
    const sizeRoll = random();
    const r =
      STAR_RADII[sizeRoll < 0.55 ? 0 : sizeRoll < 0.82 ? 1 : sizeRoll < 0.95 ? 2 : 3];
    const groupRoll = random();
    const group: StarGroup = groupRoll < 0.5 ? 0 : groupRoll < 0.8 ? 1 : 2;
    const gold = random() < 0.08;
    stars.push({ x, y, r, group, gold });
  }
  return stars;
}
