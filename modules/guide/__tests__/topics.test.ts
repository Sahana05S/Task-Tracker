import { describe, expect, it } from 'vitest';

import { GUIDE_ALONG_THE_WAY, GUIDE_FLOW, GUIDE_GROUPS, GUIDE_ICONS, GUIDE_TOPICS, guideTopic, type GuideStep } from '@/modules/guide';
import { GLOSSARY } from '@/shared/tracker/labels';

const SLUGS = ['missions', 'checklist', 'time', 'records', 'recognition', 'waypoints', 'policies', 'reports', 'analytics'];
const words = (text: string) => text.trim().split(/\s+/).length;

describe('guide topics', () => {
  it('has the nine feature pages, each with unique section anchors', () => {
    expect(GUIDE_TOPICS.map(t => t.slug)).toEqual(SLUGS);
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
    const text = JSON.stringify([GUIDE_TOPICS.flatMap(t => t.sections), GUIDE_FLOW, GUIDE_GROUPS]);
    expect(text).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
    expect(text).not.toMatch(/\bM\d{2}\b|migration|Asia\/Kolkata/);
  });
});

describe('guide visuals', () => {
  const sections = GUIDE_TOPICS.flatMap(topic => topic.sections.map(section => ({ topic: topic.slug, section })));
  const icons = new Set<string>(GUIDE_ICONS);

  it('leads every section with one short sentence and a known icon', () => {
    for (const { topic, section } of sections) {
      const where = `${topic}#${section.id}`;
      expect(words(section.lead), where).toBeLessThanOrEqual(30);
      expect(section.lead, where).toMatch(/[.]$/);
      expect(icons.has(section.icon), where).toBe(true);
      expect(section.paragraphs.length, `${where} keeps its full text`).toBeGreaterThan(0);
    }
  });

  it('gives every section a picture whose steps are complete', () => {
    for (const { topic, section } of sections) {
      const where = `${topic}#${section.id}`;
      const visual = section.visual;
      expect(visual, where).toBeDefined();
      if (!visual) continue;
      const steps: readonly GuideStep[] = visual.kind === 'flow' ? visual.steps : visual.kind === 'parts' ? visual.items : [];
      if (visual.kind === 'flow') expect(steps.length, where).toBeGreaterThanOrEqual(3);
      if (visual.kind === 'parts') expect(steps.length, where).toBeGreaterThanOrEqual(2);
      for (const step of steps) {
        expect(step.label.trim(), where).not.toBe('');
        expect(icons.has(step.icon), `${where}: ${step.label}`).toBe(true);
      }
      if (visual.kind === 'checks') expect(visual.items.length, where).toBeGreaterThanOrEqual(2);
      if (visual.kind === 'formula') expect(visual.parts.some(p => p === '=' || p === '≤'), where).toBe(true);
      if (visual.kind === 'factors') expect(section.terms?.length, `${where} draws its tiles from its terms`).toBeGreaterThan(0);
    }
  });

  it('walks the home path through real topics, and groups every topic once', () => {
    expect(GUIDE_FLOW.length).toBeGreaterThanOrEqual(5);
    for (const stop of GUIDE_FLOW) {
      expect(guideTopic(stop.topic), stop.label).toBeDefined();
      expect(icons.has(stop.icon), stop.label).toBe(true);
    }
    expect(new Set(GUIDE_FLOW.map(stop => stop.topic)).size).toBe(GUIDE_FLOW.length);
    for (const slug of GUIDE_ALONG_THE_WAY) expect(guideTopic(slug)).toBeDefined();
    expect(GUIDE_GROUPS.flatMap(group => group.topics).sort()).toEqual([...SLUGS].sort());
  });
});
