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
| `client.ts` | `buildTaskTimeline` and the timeline, nav-count and Today types; roadmap URL helpers (`roadmapSearch`, `parseRoadmapLocation`, `roadmapScope`, `branchForRow`); constellation geometry (`layoutMissionGraph`, `graphCamera`, `graphFootprint`, `graphRadius`, `wheelZoomFactor`, `LABEL_WIDTH`) and its types; map hashtags (`hashtagMatches`, `labelEdges`, `LABEL_EDGE_CAP`, `HashtagRecords`) |
| `components/` | `shell/*`, `dashboard/*`, `today/*`, `timelines/*`, `missions-workspace.tsx` |

## Private (`internal/`)
| File | Job |
|---|---|
| `nav-counts.ts` | Combines `countOpenTasks`, `countMyLogsInPeriod` and `countOpenMilestones` for the drawer badges |
| `mission-graph.ts` | Pure constellation layout: seeded, fixed-iteration force layout over the missions (same missions, same positions), opened rows fanned around their node, no overlap at rest; the camera aims |
| `graph-hashtags.ts` | Which map nodes carry a chosen hashtag (mission label, a learning note on the mission, or a linked sub-mission row) and the capped nearest-neighbour label lines between them |
| `roadmap.ts` | Today URL location and scope helpers |
| `today.ts` | Combines the owning modules' Today reads into page sections, each one ready or unavailable on its own |
| `timelines/gantt.ts` | Builds the Gantt rows, bars and ticks from tasks |

## Database it owns
None. Today reads through the public APIs of tasks, time-tracking, support,
scoring and team; nothing here queries the database directly.

## Depends on
`shared/*` and the public APIs of `auth`, `tasks`, `time-tracking`,
`milestones`, `scoring`, `support`, `reports`, `team` and `labels` as each screen needs
(Today shows each mission's labels; `loadRoadmapMissions` returns them with each batch).

The shell footer shows a small "Powered by Stellar" line with `StellarMark` (`shared/ui/stellar-mark`), the product mark also used by the top bar, login and landing pages. No new database ownership or formula.

Today puts `MissionRoadmap` first and streams the weekly/award panels below it. `roadmap-actions.ts` authenticates and checks access before loading bounded branches/item time. `loadRoadmapMissions` uses keyset batches and due filters. The Roadmap view is `today/mission-graph-view.tsx` (`MissionGraph`, the constellation, 3 November 2026, plan section 8): each mission is a star placed by `layoutMissionGraph` (hand-written, deterministic, no dependency; decision D-F1), sized by priority, filled by progress (a pie from twelve o'clock, the percentage also in words), with a ring for the viewer's relationship (owner double, assignee solid, collaborator dashed, reviewer dotted, observer thin; the word is in the label too). Lines are only stored `task_dependencies` rows between missions on the map: Subtask solid (parent → sub-mission), Dependency and Blocks dashed, Related dotted; a mission's label says its relations in words and a key under the map explains the styles. Since 6 November 2026 each star is coloured by its kind with a gradient rim (`GraphTone`, tokens `--map-<tone>-a/-b` in globals.css): missions violet, sub-missions amber (a mission another mission on the map holds, or the parent's row linked to it; also a dashed inner ring), Quests teal, objectives neutral; every line fades from its source star's colour to its target's. With a mission open, `loadSubMissionAnchors` (once per mission, `getSubMissionAnchors`, read under the viewer's session) says which Quest or row each of its sub-missions hangs from, and `layoutMissionGraph(..., { anchors })` draws that sub-mission from the deepest of those rows on the map with a curved, slightly heavier "origin" line (`GraphEdge.kind = 'origin'`) instead of the straight mission line; the sub-mission stays clear while unrelated stars fade. Collapsed, or when the row is in another section or unreadable, the mission line stays. Opening a mission adds its Quests and Objectives as child stars through `loadRoadmapBranch`; they sit close around it and only the unrelated missions in the way step aside (a glide reduced motion skips); a "More objectives" star loads the next page without moving the rows already shown. The managing director and project engineers get a My missions / Whole team switch (`?scope=team`). Gestures are unchanged: a plain wheel or one-finger swipe scrolls the page; Ctrl/⌘ + scroll, a trackpad pinch or a two-finger pinch zooms; mouse or pen drag pans. The camera re-aims only when the focus changes or Re-centre is pressed. Keyboard: Tab through stars (missions in due order, then the open rows), Enter opens, Escape goes back; on phones the first tap focuses a star and the second opens it. The winding road (`layoutMissionMap`) and its Vertical/Horizontal switch are gone; an old `?layout=` is ignored. The List view keeps the keyboard-first list. Both share the URL location (mission, checklist, parent, section, item). Missing backend migrations surface unavailable states.

Hashtags on the map (5 November 2026, lane 8): above the map, "Find by hashtag" lists the company's labels (`loadGraphHashtags`, `label_catalogue()`, read the first time the box is focused). Choosing one highlights at once the loaded missions whose labels (`labels_for`, already read per batch) include it, then `loadGraphHashtag(slug)` (`labelled(slug)`, only records the viewer may read, at most 500) adds missions with a Mistakes and learning note carrying it and opened rows that follow a linked sub-mission carrying it. Other stars fade but stay reachable; the count of matches on the map, a link to `/labels/<slug>` and Clear sit beside the chosen hashtag. "Show label links" draws thin dotted primary-colour lines (each match to its nearest other match, one per pair, at most `LABEL_EDGE_CAP` = 60), with a legend entry; they are drawn over the layout and never change positions, and are styled apart from Subtask (solid), Dependency/Blocks (dashed) and Related (round dots). Server actions `loadGraphHashtags` and `loadGraphHashtag` live in `roadmap-actions.ts`.
