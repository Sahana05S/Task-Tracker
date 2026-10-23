import { describe, expect, it } from 'vitest';

import { GUIDE_STAGE_CONTENT, GUIDE_STAGES, LEGACY_TOPIC_STAGE, guideStage, type FlowNode } from '@/modules/guide';
import { GLOSSARY, guideHref } from '@/shared/tracker/labels';

const words = (text: string) => text.trim().split(/\s+/).length;

describe('guide stages', () => {
  it('has the six stages, in order, once each', () => {
    expect(GUIDE_STAGE_CONTENT.map(stage => stage.key)).toEqual([...GUIDE_STAGES]);
  });

  it('keeps every flowchart short: boxes of at most four words, one line under it', () => {
    for (const stage of GUIDE_STAGE_CONTENT) {
      const nodes: FlowNode[] = [...stage.path, ...(stage.split ?? []), ...(stage.branch ? [stage.branch.node] : [])];
      expect(stage.path.length, stage.key).toBeGreaterThanOrEqual(2);
      expect(stage.path.length + (stage.split ? 1 : 0), stage.key).toBeLessThanOrEqual(4);
      for (const node of nodes) {
        expect(words(node.title), `${stage.key}: ${node.title}`).toBeLessThanOrEqual(4);
        if (node.note) expect(words(node.note), `${stage.key}: ${node.note}`).toBeLessThanOrEqual(4);
      }
      expect(words(stage.caption), stage.key).toBeLessThanOrEqual(14);
      if (stage.branch) {
        expect(stage.branch.from, stage.key).toBeGreaterThanOrEqual(0);
        expect(stage.branch.from, stage.key).toBeLessThan(stage.path.length);
      }
      if (stage.split) expect(stage.split.length, stage.key).toBeGreaterThanOrEqual(2);
    }
  });

  it('is written in words, not codes', () => {
    const text = JSON.stringify(GUIDE_STAGE_CONTENT.map(({ key: _key, ...rest }) => rest));
    expect(text).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
    expect(text).not.toMatch(/\bM\d{2}\b|migration|Asia\/Kolkata/);
  });

  it('opens unknown stages at the first one', () => {
    expect(guideStage(undefined).key).toBe('missions');
    expect(guideStage('nonsense').key).toBe('missions');
    expect(guideStage('stars').key).toBe('stars');
  });
});

describe('links into the guide', () => {
  it('sends every help tip to a real stage', () => {
    for (const term of Object.values(GLOSSARY)) {
      expect(GUIDE_STAGES, term.term).toContain(term.stage);
      expect(guideHref(term)).toBe(`/guide?stage=${term.stage}`);
    }
  });

  it('sends every old topic page to a real stage', () => {
    expect(Object.keys(LEGACY_TOPIC_STAGE).sort()).toEqual(
      ['analytics', 'checklist', 'missions', 'policies', 'recognition', 'records', 'reports', 'time', 'waypoints'],
    );
    for (const stage of Object.values(LEGACY_TOPIC_STAGE)) expect(GUIDE_STAGES).toContain(stage);
  });
});
