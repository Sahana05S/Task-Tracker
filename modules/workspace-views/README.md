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
| `client.ts` | `buildTaskTimeline` and the timeline, nav-count and Today types; roadmap URL helpers (`roadmapSearch`, `parseRoadmapLocation`, `roadmapLayout`, `branchForRow`) and the device's map layout (`readMapLayout`, `rememberMapLayout`); map geometry (`layoutMissionMap` with a vertical or horizontal `orientation`, `mapCamera`, `wheelZoomFactor`) |
| `components/` | `shell/*`, `dashboard/*`, `today/*`, `timelines/*`, `missions-workspace.tsx` |

## Private (`internal/`)
| File | Job |
|---|---|
| `nav-counts.ts` | Combines `countOpenTasks`, `countMyLogsInPeriod` and `countOpenMilestones` for the drawer badges |
| `today.ts` | Combines the owning modules' Today reads into page sections, each one ready or unavailable on its own |
| `timelines/gantt.ts` | Builds the Gantt rows, bars and ticks from tasks |

## Database it owns
None. Today reads through the public APIs of tasks, time-tracking, support,
scoring and team; nothing here queries the database directly.

## Depends on
`shared/*` and the public APIs of `auth`, `tasks`, `time-tracking`,
`milestones`, `scoring`, `support`, `reports` and `team` as each screen needs.

The shell footer shows a small "Powered by Stellar" line with `StellarMark` (`shared/ui/stellar-mark`), the product mark also used by the top bar, login and landing pages. No new database ownership or formula.

Today now puts `MissionRoadmap` first and streams the weekly/award panels below it. `roadmap-actions.ts` authenticates and checks active own assignment before loading bounded branches/item time. `loadRoadmapMissions` uses keyset batches, due filters and dual primary/participant sources; `loadRoadmapBranch`/`loadRoadmapItemTime` reuse checklist public reads. The Roadmap view is `today/mission-map.tsx`: one pannable/zoomable map where missions wind down a road and opened branches fan out on their side, with a leaf card for quick completion and the shared work panel; writes reread only the open branches. A plain wheel or one-finger swipe scrolls the page; Ctrl/⌘ + scroll, a trackpad pinch or a two-finger pinch zooms (the first plain scroll shows a short hint); mouse or pen drag pans. The camera re-aims only when the focused node changes, the layout flips or Re-centre is pressed, never on resize or when nodes load, with a 300 ms move that reduced motion turns off. A Vertical/Horizontal switch beside Roadmap/List transposes the map (`?layout=horizontal`, remembered per device; vertical until switched). The List view keeps the keyboard-first list. Both share the URL location (mission, checklist, parent, section, item). Missing backend migrations surface unavailable states.
