import { mulberry32 } from './stars';

/**
 * Geometry for the low-poly planet and the cloud bank.
 *
 * Both are generated on the server from fixed seeds, so the markup is the same
 * on every render. Colours come from the TaskPulse palette in `globals.css`:
 * violet primary for the ocean, success mint for the land, the lavender family
 * for the clouds.
 */

/* -------------------------------------------------------------------------- */
/* Colour helpers                                                             */
/* -------------------------------------------------------------------------- */

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(channel: number): string {
  return Math.round(Math.max(0, Math.min(255, channel)))
    .toString(16)
    .padStart(2, '0');
}

/** Interpolates across three colour stops for t in [0, 1]. */
export function rampColor(stops: readonly [string, string, string], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [from, to, local] =
    clamped < 0.5 ? [stops[0], stops[1], clamped * 2] : [stops[1], stops[2], (clamped - 0.5) * 2];
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return `#${toHex(a[0] + (b[0] - a[0]) * local)}${toHex(a[1] + (b[1] - a[1]) * local)}${toHex(a[2] + (b[2] - a[2]) * local)}`;
}

/* -------------------------------------------------------------------------- */
/* Planet                                                                     */
/* -------------------------------------------------------------------------- */

export const PLANET = { size: 400, cx: 200, cy: 200, r: 150 } as const;

/** Dark, mid, light. Ocean is the violet primary; land is the success mint. */
const OCEAN_RAMP = ['#241d63', '#4a3ccf', '#a39cf5'] as const;
const LAND_RAMP = ['#065f46', '#0f9e74', '#62d9b5'] as const;

/** Light source, upper left, matching the lit tops of the clouds. */
const LIGHT = { x: 135, y: 115 } as const;

const LAND_BLOBS = [
  { x: 150, y: 240, r: 58 },
  { x: 268, y: 150, r: 42 },
  { x: 258, y: 296, r: 30 },
  { x: 116, y: 132, r: 22 },
] as const;

export interface Facet {
  points: string;
  fill: string;
  land: boolean;
}

/**
 * A jittered grid over the planet disc, split into triangles and shaded by
 * distance from the light. Vertices are shared between neighbouring triangles,
 * so the mesh has no gaps.
 */
export function planetFacets(seed = 5, step = 38): Facet[] {
  const random = mulberry32(seed);
  const { size, cx, cy, r } = PLANET;
  const min = cx - r - step;
  const count = Math.ceil((2 * r + 2 * step) / step);
  const jitter = step * 0.28;

  const grid: [number, number][][] = [];
  for (let row = 0; row <= count; row += 1) {
    const line: [number, number][] = [];
    for (let col = 0; col <= count; col += 1) {
      const x = min + col * step + (random() - 0.5) * 2 * jitter;
      const y = min + row * step + (random() - 0.5) * 2 * jitter;
      line.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    }
    grid.push(line);
  }

  const facets: Facet[] = [];
  const pushTriangle = (a: [number, number], b: [number, number], c: [number, number]) => {
    const mx = (a[0] + b[0] + c[0]) / 3;
    const my = (a[1] + b[1] + c[1]) / 3;
    // Skip triangles wholly outside the disc; the clip path trims the rest.
    if (Math.hypot(mx - cx, my - cy) > r + step * 0.6) return;
    if (mx < -step || my < -step || mx > size + step || my > size + step) return;

    const lit = 1 - Math.hypot(mx - LIGHT.x, my - LIGHT.y) / 300;
    const shade = Math.max(0, Math.min(1, lit + (random() - 0.5) * 0.14));
    const land = LAND_BLOBS.some(
      (blob) => Math.hypot(mx - blob.x, my - blob.y) < blob.r * (0.82 + random() * 0.32),
    );
    facets.push({
      points: `${a[0]},${a[1]} ${b[0]},${b[1]} ${c[0]},${c[1]}`,
      fill: rampColor(land ? LAND_RAMP : OCEAN_RAMP, shade),
      land,
    });
  };

  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      const tl = grid[row]![col]!;
      const tr = grid[row]![col + 1]!;
      const bl = grid[row + 1]![col]!;
      const br = grid[row + 1]![col + 1]!;
      // Alternate the diagonal so the mesh does not read as a uniform grid.
      if ((row + col) % 2 === 0) {
        pushTriangle(tl, tr, br);
        pushTriangle(tl, br, bl);
      } else {
        pushTriangle(tl, tr, bl);
        pushTriangle(tr, br, bl);
      }
    }
  }
  return facets;
}

/* -------------------------------------------------------------------------- */
/* Clouds                                                                     */
/* -------------------------------------------------------------------------- */

export const CLOUD_VIEWBOX = { width: 1440, height: 260 } as const;

export interface PuffRow {
  y: number;
  rMin: number;
  rMax: number;
  step: number;
  jitterY: number;
}

export interface Puff {
  cx: number;
  cy: number;
  r: number;
}

/**
 * Overlapping circles along each row. Later rows are drawn over earlier ones,
 * so each row's lit tops sit against the shaded undersides of the row behind.
 */
export function cloudPuffs(seed: number, rows: readonly PuffRow[]): Puff[][] {
  const random = mulberry32(seed);
  return rows.map((row) => {
    const puffs: Puff[] = [];
    let x = -row.step * (0.3 + random() * 0.4);
    while (x < CLOUD_VIEWBOX.width + row.step) {
      const r = row.rMin + random() * (row.rMax - row.rMin);
      const cy = row.y + (random() - 0.5) * 2 * row.jitterY;
      puffs.push({ cx: Math.round(x), cy: Math.round(cy), r: Math.round(r) });
      x += row.step * (0.75 + random() * 0.5);
    }
    return puffs;
  });
}
