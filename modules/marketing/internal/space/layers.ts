import type { CSSProperties } from 'react';

/**
 * Cloud bank layers for the hero.
 *
 * Each layer rises at its own speed as the hero scrolls away, so the bank
 * separates into depth and "clears" to reveal the page beneath. The travel is
 * capped so no layer can climb far enough to cover the headline while it is
 * still on screen.
 */

export type CloudTone = 'back' | 'mid' | 'front' | 'haze';

export interface CloudLayer {
  id: string;
  tone: CloudTone;
  /** Multiplier on the base scroll travel. Front layers move fastest. */
  speed: number;
  /** Seconds for one idle drift cycle. */
  drift: number;
  opacity: number;
}

/** Base upward travel, in vh, for a layer with speed 1. */
export const BASE_TRAVEL_VH = 22;

/** No layer may travel further than this, whatever its speed. */
export const MAX_TRAVEL_VH = 35;

export const CLOUD_LAYERS: readonly CloudLayer[] = [
  { id: 'back', tone: 'back', speed: 1, drift: 28, opacity: 0.9 },
  { id: 'mid', tone: 'mid', speed: 1.35, drift: 22, opacity: 1 },
  { id: 'haze', tone: 'haze', speed: 1.2, drift: 34, opacity: 0.7 },
  { id: 'front', tone: 'front', speed: 1.6, drift: 18, opacity: 1 },
];

/** Upward travel in vh for a layer, clamped to the safe maximum. */
export function parallaxTravel(speed: number, baseVh: number = BASE_TRAVEL_VH): number {
  const travel = Math.max(0, speed) * baseVh;
  return Math.round(Math.min(travel, MAX_TRAVEL_VH) * 100) / 100;
}

/** CSS custom properties read by the cloud keyframes in space.module.css. */
export function layerStyle(layer: CloudLayer): CSSProperties {
  return {
    '--travel': `-${parallaxTravel(layer.speed)}vh`,
    '--speed': String(layer.speed),
    '--drift': `${layer.drift}s`,
    '--layer-opacity': String(layer.opacity),
  } as CSSProperties;
}
