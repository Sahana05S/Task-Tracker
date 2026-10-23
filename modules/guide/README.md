# guide

See `docs/ARCHITECTURE.md` for the rules.

## What it does
The in-app guide (`/guide`): one page that explains how Stellar works in six
stages (Missions, Daily work, Records, Scores, Stars, Month close). Each stage
is a small flowchart (at most four columns, boxes of at most four words) and one
line. A stage is chosen with a plain link, `/guide?stage=<key>`, so it works
without JavaScript and every `HelpTip` "Learn more" link opens the page at the
right stage. The old one-page-per-topic addresses (`/guide/<topic>`) redirect to
the matching stage. The words restate the business rules
(`docs/plans/RULES.md`); it reads no data and adds no rule.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `GUIDE_STAGE_CONTENT`, `GUIDE_STAGES`, `guideStage(key)`, `LEGACY_TOPIC_STAGE`; types `GuideStageContent`, `FlowNode`, `FlowTone`, `GuideStageIcon` (pure data) |
| `components/` | `GuidePage` (`guide-page.tsx`, the `/guide` body), `GuideFlowchart` (`guide-flowchart.tsx`, one stage's chart: left to right from `sm`, top to bottom on phones) |

## Private (`internal/`)
| File | Job |
|---|---|
| `stages.ts` | The six stages: path, optional side branch or either/or ending, caption; where old topic pages now point |

## Database it owns
None.

## Depends on
`shared/*` only (`shared/tracker/labels` for the stage keys, `shared/ui/mission-ui`).
The glossary that help tips read (`shared/tracker/glossary.ts`) names a stage
per term; `guideHref` builds the link. Tests:
`modules/guide/__tests__/stages.test.ts` (six stages in order, short boxes and
captions, every help tip and old topic address lands on a real stage).
