/**
 * Chart colour tokens.
 *
 * Recharts paints SVG through props rather than class names, so colours have to
 * arrive as CSS colour values. These reference the custom properties declared in
 * `app/globals.css`, which keeps the palette in one place and out of the
 * component bodies.
 */

/** Categorical series colours, cycled when there are more members than entries. */
export const SERIES_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
  'var(--color-chart-7)',
  'var(--color-chart-8)',
] as const;

export const CHART_POSITIVE = 'var(--color-chart-positive)';
export const CHART_NEGATIVE = 'var(--color-chart-negative)';
export const CHART_GRID = 'var(--color-chart-grid)';
export const CHART_AXIS = 'var(--color-chart-axis)';
export const CHART_REFERENCE = 'var(--color-chart-reference)';

/** Stable colour for a series index. */
export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length] ?? SERIES_COLORS[0];
}

/**
 * Condenses a full name to a short axis label.
 *
 * Axis ticks have very little room, so "Ada Lovelace" becomes "Ada L." The full
 * name still appears in the tooltip and legend.
 */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return fullName;
  if (parts.length === 1) return first;

  const lastInitial = parts[parts.length - 1]?.[0];
  return lastInitial ? `${first} ${lastInitial}.` : first;
}
