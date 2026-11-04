import { describe, expect, it } from 'vitest';

import { filtersFromParams, labelsFromParams, missionsHref } from '@/modules/tasks/components/filter-params';
import { EMPTY_FILTERS } from '@/modules/tasks/internal/filters';

describe('label filter in the Missions URL', () => {
  it('reads repeated and comma-separated labels, without repeats or junk', () => {
    expect(labelsFromParams(new URLSearchParams('label=crane&label=site-a,Crane&label=%3Cx%3E'))).toEqual(['crane', 'site-a']);
  });

  it('reads a single ?label= from an older link', () => {
    expect(filtersFromParams(new URLSearchParams('label=crane')).labels).toEqual(['crane']);
  });

  it('round-trips with the other filters', () => {
    const href = missionsHref('table', { ...EMPTY_FILTERS, status: 'In Progress', labels: ['crane', 'site-a'] });
    expect(href).toBe('/tasks?view=table&status=In+Progress&label=crane&label=site-a');
    const back = filtersFromParams(new URLSearchParams(href.split('?')[1]));
    expect(back.labels).toEqual(['crane', 'site-a']);
    expect(back.status).toBe('In Progress');
  });

  it('leaves the URL clean with no labels', () => {
    expect(missionsHref('cards', EMPTY_FILTERS)).toBe('/tasks');
  });
});
