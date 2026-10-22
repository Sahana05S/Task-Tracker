# guide

See `docs/ARCHITECTURE.md` for the rules.

## What it does
The in-app guide (`/guide`): one plain-language page per feature (Missions,
Checklist, Time, Records, Recognition, Waypoints, Policies, Reports, Analytics)
and the glossary index. The words come from the business rules
(`docs/plans/RULES.md`); every `HelpTip` "Learn more" link points at a section
here. It reads no data and adds no rule.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `GUIDE_TOPICS`, `guideTopic(slug)`, types `GuideTopicContent`, `GuideSection` (pure data) |
| `components/` | `GuideIndex` (the `/guide` page body), `GuideTopicPage` (`/guide/[topic]`) |

## Private (`internal/`)
| File | Job |
|---|---|
| `topics.ts` | The topics, their sections and the anchors the glossary links to |

## Database it owns
None.

## Depends on
`shared/*` only (`shared/tracker/labels` for the glossary and enum meanings,
`shared/ui/mission-ui`). Tests: `modules/guide/__tests__/topics.test.ts`
(every glossary link lands on an existing topic section).
