# guide

See `docs/ARCHITECTURE.md` for the rules.

## What it does
The in-app guide (`/guide`): a "How TaskPulse works" path, one page per feature
(Missions, Checklist, Time, Records, Recognition, Waypoints, Policies, Reports,
Analytics) and a searchable glossary. Each section leads with an icon, one
sentence and a picture (a flow, the app's own badges, a formula, a checklist or
a small diagram); its full text sits under "More detail". The words come from
the business rules (`docs/plans/RULES.md`); every `HelpTip` "Learn more" link
points at a section here. It reads no data and adds no rule.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `GUIDE_TOPICS`, `guideTopic(slug)`, `GUIDE_FLOW` (the home path), `GUIDE_ALONG_THE_WAY`, `GUIDE_GROUPS`, `GUIDE_ICONS`; types `GuideTopicContent`, `GuideSection`, `GuideStep`, `GuideVisual`, `GuideIcon` (pure data) |
| `components/` | `GuideIndex` (`guide-index.tsx`, the `/guide` page body), `GuideTopicPage` (`guide-topic.tsx`, `/guide/[topic]`); internal pieces: `guide-visuals.tsx` (one renderer per visual kind), `glossary-search.tsx` (client), `guide-icon.tsx`, `topic-icons.ts` |

## Private (`internal/`)
| File | Job |
|---|---|
| `topics.ts` | The topics, their sections (lead, icon, visual, full text) and the anchors the glossary links to; the home path and groups |

## Database it owns
None.

## Depends on
`shared/*` (`shared/tracker/labels` for the glossary and enum meanings,
`shared/tracker/enums`, `shared/ui/mission-ui`, `shared/ui/tracker-badges`,
`shared/ui/input`) and `@/modules/recognition/client` for `DEFAULT_WAYPOINTS`,
so the waypoints picture always names the stages the app uses. Tests:
`modules/guide/__tests__/topics.test.ts` (every glossary link lands on an
existing section; every section has a short lead, a known icon and a complete
picture; the home path and groups cover every topic).
