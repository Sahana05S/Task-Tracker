import { describe, expect, it } from 'vitest';

import {
  CLOUD_LAYERS,
  MAX_TRAVEL_VH,
  layerStyle,
  parallaxTravel,
} from '@/modules/marketing/internal/space/layers';
import { STAR_RADII, mulberry32, seededStars } from '@/modules/marketing/internal/space/stars';
import {
  CLOUD_VIEWBOX,
  PLANET,
  cloudPuffs,
  planetFacets,
  rampColor,
} from '@/modules/marketing/internal/space/geometry';

describe('rampColor', () => {
  it('returns the end stops and the middle stop exactly', () => {
    const stops = ['#000000', '#808080', '#ffffff'] as const;
    expect(rampColor(stops, 0)).toBe('#000000');
    expect(rampColor(stops, 0.5)).toBe('#808080');
    expect(rampColor(stops, 1)).toBe('#ffffff');
  });

  it('clamps values outside [0, 1]', () => {
    const stops = ['#102030', '#405060', '#708090'] as const;
    expect(rampColor(stops, -1)).toBe('#102030');
    expect(rampColor(stops, 2)).toBe('#708090');
  });
});

describe('planetFacets', () => {
  it('is deterministic and draws both ocean and land', () => {
    const facets = planetFacets();
    expect(facets).toEqual(planetFacets());
    expect(facets.some((facet) => facet.land)).toBe(true);
    expect(facets.some((facet) => !facet.land)).toBe(true);
  });

  it('keeps every triangle near the planet disc', () => {
    for (const facet of planetFacets()) {
      const coords = facet.points.split(' ').map((pair) => pair.split(',').map(Number));
      expect(coords).toHaveLength(3);
      const mx = coords.reduce((sum, [x]) => sum + x!, 0) / 3;
      const my = coords.reduce((sum, [, y]) => sum + y!, 0) / 3;
      expect(Math.hypot(mx - PLANET.cx, my - PLANET.cy)).toBeLessThanOrEqual(PLANET.r + 38);
      expect(facet.fill).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('cloudPuffs', () => {
  const rows = [
    { y: 120, rMin: 70, rMax: 90, step: 100, jitterY: 20 },
    { y: 200, rMin: 60, rMax: 90, step: 90, jitterY: 10 },
  ];

  it('is deterministic per seed', () => {
    expect(cloudPuffs(4, rows)).toEqual(cloudPuffs(4, rows));
    expect(cloudPuffs(4, rows)).not.toEqual(cloudPuffs(5, rows));
  });

  it('covers the full width of every row with radii in range', () => {
    cloudPuffs(4, rows).forEach((puffs, index) => {
      const row = rows[index]!;
      expect(Math.min(...puffs.map((p) => p.cx - p.r))).toBeLessThanOrEqual(0);
      expect(Math.max(...puffs.map((p) => p.cx + p.r))).toBeGreaterThanOrEqual(CLOUD_VIEWBOX.width);
      for (const puff of puffs) {
        expect(puff.r).toBeGreaterThanOrEqual(row.rMin);
        expect(puff.r).toBeLessThanOrEqual(row.rMax);
        expect(Math.abs(puff.cy - row.y)).toBeLessThanOrEqual(row.jitterY);
      }
    });
  });

  it('leaves no horizontal gap between neighbouring puffs', () => {
    for (const puffs of cloudPuffs(9, rows)) {
      for (let i = 1; i < puffs.length; i += 1) {
        const gap = puffs[i]!.cx - puffs[i]!.r - (puffs[i - 1]!.cx + puffs[i - 1]!.r);
        expect(gap).toBeLessThan(0);
      }
    }
  });
});

describe('seededStars', () => {
  it('returns the same sky for the same seed, so server and client markup match', () => {
    expect(seededStars(90, 7)).toEqual(seededStars(90, 7));
  });

  it('returns a different sky for a different seed', () => {
    expect(seededStars(90, 7)).not.toEqual(seededStars(90, 8));
  });

  it('keeps every star inside the bounds with an allowed radius and group', () => {
    const bounds = { width: 1440, height: 900 };
    const stars = seededStars(90, 7, bounds);
    expect(stars).toHaveLength(90);
    for (const star of stars) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThanOrEqual(bounds.width);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThanOrEqual(bounds.height);
      expect(STAR_RADII).toContain(star.r);
      expect([0, 1, 2]).toContain(star.group);
    }
  });

  it('mixes static and twinkling stars, with only a few gold ones', () => {
    const stars = seededStars(200, 3);
    const groups = new Set(stars.map((star) => star.group));
    expect(groups).toEqual(new Set([0, 1, 2]));
    const gold = stars.filter((star) => star.gold).length;
    expect(gold).toBeGreaterThan(0);
    expect(gold).toBeLessThan(stars.length * 0.2);
  });

  it('produces values in [0, 1) from the PRNG', () => {
    const random = mulberry32(42);
    for (let i = 0; i < 1000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('cloud parallax', () => {
  it('scales travel by speed', () => {
    expect(parallaxTravel(1)).toBe(22);
    expect(parallaxTravel(1.35)).toBe(29.7);
  });

  it('never lets a layer travel past the safe maximum', () => {
    expect(parallaxTravel(1.6)).toBe(MAX_TRAVEL_VH);
    expect(parallaxTravel(10)).toBe(MAX_TRAVEL_VH);
    for (const layer of CLOUD_LAYERS) {
      expect(parallaxTravel(layer.speed)).toBeLessThanOrEqual(MAX_TRAVEL_VH);
    }
  });

  it('treats a negative speed as no travel', () => {
    expect(parallaxTravel(-2)).toBe(0);
  });

  it('exposes the layer settings as CSS custom properties', () => {
    const style = layerStyle({ id: 'x', tone: 'front', speed: 1.35, drift: 20, opacity: 0.8 });
    expect(style).toMatchObject({
      '--travel': '-29.7vh',
      '--speed': '1.35',
      '--drift': '20s',
      '--layer-opacity': '0.8',
    });
  });
});
