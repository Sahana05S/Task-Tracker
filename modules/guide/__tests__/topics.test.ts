import { describe, expect, it } from 'vitest';

import { GUIDE_TOPICS, guideTopic } from '@/modules/guide';
import { GLOSSARY } from '@/shared/tracker/labels';

describe('guide topics', () => {
  it('has the nine feature pages, each with unique section anchors', () => {
    expect(GUIDE_TOPICS.map(t => t.slug)).toEqual(['missions', 'checklist', 'time', 'records', 'recognition', 'waypoints', 'policies', 'reports', 'analytics']);
    for (const topic of GUIDE_TOPICS) {
      const ids = topic.sections.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(topic.links.length).toBeGreaterThan(0);
    }
  });

  it('has a section for every glossary "Learn more" link', () => {
    for (const term of Object.values(GLOSSARY)) {
      expect(guideTopic(term.topic)?.sections.map(s => s.id), term.term).toContain(term.anchor);
    }
  });

  it('is written in words, not codes', () => {
    const text = JSON.stringify(GUIDE_TOPICS.flatMap(t => t.sections));
    expect(text).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
    expect(text).not.toMatch(/\bM\d{2}\b|migration|Asia\/Kolkata/);
  });
});
