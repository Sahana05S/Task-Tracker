# workspace-views

The view layer: screens that combine several modules and own no business
rules or tables of their own. It sits above every domain module; no domain
module may import it (the boundary test enforces this).

- **Shell**: app shell, top bar, navigation drawer, phone bottom nav, section
  tabs, user menu (with the Light / Dark / System theme choice from
  `shared/ui/theme`), running-timer pill, workspace header and placeholders.
  Team's tabs are Analytics, People and Activity (`/team/activity`); a tab's
  optional `exclude` keeps People from also lighting up there.
- **Dashboard**: team stats, productivity and allocation charts, workbook
  dashboard, award summary, calculation details, data-status banner.
  "Performance sub-scores" (`sub-scores-grid.tsx`) draws the ten engine factors
  in engine order with `FactorDifferentialsChart` (difference from the team
  median per member, zero line = median, signed six-decimal values printed,
  an unavailable factor shows the engine's reasons); managers see the team, a
  member sees only their own bars. `ProductivityChart` is a thin wrapper over
  the same chart; `chart-shell.tsx` is the shared card. "Daily perf log"
  (`daily-perf-log.tsx`) is collapsed and read only when asked for
  (`?log=1` or `member`/`from`/`to` in the URL); it renders reports'
  `getDailyPerfLog` grouped by day, with a CSV link to the export route.
- **Today**: the member's day (focus missions, week summary, award snapshot,
  validated contributions).
- **Timelines**: the task Gantt and task relations.
- **Missions list**: `MissionsWorkspace` plugs time tracking's "Log hours"
  button into the tasks workspace.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `getNavCounts`, `getTodayData`, `weekStartOf`. Also re-exports everything in `client.ts`. |
| `client.ts` | `buildTaskTimeline` and the timeline, nav-count and Today types; roadmap URL helpers (`roadmapSearch`, `parseRoadmapLocation`, `roadmapScope`, `branchForRow`); constellation geometry (`layoutMissionGraph`, `graphCamera`, `graphFootprint`, `graphRadius`, `wheelZoomFactor`, `LABEL_WIDTH`) and its types |
| `components/` | `shell/*`, `dashboard/*`, `today/*`, `timelines/*`, `missions-workspace.tsx` |

## Private (`internal/`)
| File | Job |
|---|---|
| `nav-counts.ts` | Combines `countOpenTasks`, `countMyLogsInPeriod` and `countOpenMilestones` for the drawer badges |
| `mission-graph.ts` | Pure constellation layout: seeded, fixed-iteration force layout over the missions (same missions, same positions), opened rows fanned around their node, no overlap at rest; the camera aims |
| `roadmap.ts` | Today URL location and scope helpers |
| `today.ts` | Combines the owning modules' Today reads into page sections, each one ready or unavailable on its own |
| `timelines/gantt.ts` | Builds the Gantt rows, bars and ticks from tasks |

## Database it owns
None. Today reads through the public APIs of tasks, time-tracking, support,
scoring and team; nothing here queries the database directly.

## Depends on
`shared/*` and the public APIs of `auth`, `tasks`, `time-tracking`,
`milestones`, `scoring`, `support`, `reports` and `team` as each screen needs.

The shell footer shows a small "Powered by Stellar" line with `StellarMark` (`shared/ui/stellar-mark`), the product mark also used by the top bar, login and landing pages. No new database ownership or formula.

Today puts `MissionRoadmap` first and streams the weekly/award panels below it. `roadmap-actions.ts` authenticates and checks access before loading bounded branches/item time. `loadRoadmapMissions` uses keyset batches and due filters. The Roadmap view is `today/mission-graph-view.tsx` (`MissionGraph`, the constellation, 3 November 2026, plan section 8): each mission is a star placed by `layoutMissionGraph` (hand-written, deterministic, no dependency; decision D-F1), sized by priority, filled by progress (a pie from twelve o'clock, the percentage also in words), with a ring for the viewer's relationship (owner double, assignee solid, collaborator dashed, reviewer dotted, observer thin; the word is in the label too). Lines are only stored `task_dependencies` rows between missions on the map: Subtask solid (parent → sub-mission), Dependency and Blocks dashed, Related dotted; a mission's label says its relations in words and a key under the map explains the styles. Each connected group of missions shares a colour (`--map-hue-N`). Opening a mission adds its Quests and Objectives as child stars through `loadRoadmapBranch`; they sit close around it and only the unrelated missions in the way step aside (a glide reduced motion skips); a "More objectives" star loads the next page without moving the rows already shown. The managing director and project engineers get a My missions / Whole team switch (`?scope=team`). Gestures are unchanged: a plain wheel or one-finger swipe scrolls the page; Ctrl/⌘ + scroll, a trackpad pinch or a two-finger pinch zooms; mouse or pen drag pans. The camera re-aims only when the focus changes or Re-centre is pressed. Keyboard: Tab through stars (missions in due order, then the open rows), Enter opens, Escape goes back; on phones the first tap focuses a star and the second opens it. The winding road (`layoutMissionMap`) and its Vertical/Horizontal switch are gone; an old `?layout=` is ignored. The List view keeps the keyboard-first list. Both share the URL location (mission, checklist, parent, section, item). Missing backend migrations surface unavailable states.
