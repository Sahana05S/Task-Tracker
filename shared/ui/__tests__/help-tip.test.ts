import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HelpTip, HelpTipBody } from '@/shared/ui/help-tip';

describe('HelpTip', () => {
  it('is a real button in the tab order, named after the term, announcing a dialog it controls', () => {
    const html = renderToStaticMarkup(createElement(HelpTip, { tip: 'asOf' }));
    expect(html).toMatch(/^<button type="button"/);
    expect(html).toContain('aria-label="What is “As of”?"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-state="closed"');
    expect(html).not.toContain('tabindex="-1"');
    // The icon is decoration; the name comes from the label.
    expect(html).toContain('aria-hidden="true"');
  });

  it('opens to the meaning and a keyboard-reachable "Learn more" link to the guide', () => {
    const html = renderToStaticMarkup(createElement(HelpTipBody, { tip: 'waypoint' }));
    expect(html).toContain('Waypoint');
    expect(html).toContain('30, 50, 70, 90 and 100%');
    expect(html).toContain('<a class="link mt-2 inline-block font-medium" href="/guide/waypoints#waypoints">Learn more</a>');
  });
});
