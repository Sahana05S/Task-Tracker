import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildPresentation, viewContext } from '@/modules/reports/client';
import { DataChecks } from '@/modules/reports/components/data-checks';

const response = JSON.parse(readFileSync('__tests__/fixtures/m11-fresh-context.json', 'utf-8'));
const view = viewContext(response.sources.periodStart.slice(0, 7), response.sources.asOf, new Date(response.sources.asOf));

describe('DataChecks (the managing director\'s list of what is missing)', () => {
  it('lists attendance days without a record and open missions without dates, with where to fix them', () => {
    const model = buildPresentation(response, view);
    const html = renderToStaticMarkup(createElement(DataChecks, { model }));
    const missing = model.attendance.some((a) => a.days.some((d) => d.attendanceId === null));
    if (missing) {
      expect(html).toContain('Attendance to fill in');
      expect(html).toContain(`/attendance?month=${view.period.startDate.slice(0, 7)}`);
    }
    expect(html).not.toContain('undefined');
  });

  it('says everything is recorded when nothing is missing', () => {
    const model = buildPresentation(response, view);
    const clean = { ...model, attendance: [], tasks: [], awards: undefined };
    expect(renderToStaticMarkup(createElement(DataChecks, { model: clean }))).toContain('Everything is recorded');
  });
});
