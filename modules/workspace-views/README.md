# workspace-views

The view layer: screens that combine several modules and own no business
rules or tables of their own. It sits above every domain module; no domain
module may import it (the boundary test enforces this).

- **Shell**: app shell, top bar, navigation drawer, phone bottom nav, section
  tabs, user menu, running-timer pill, workspace header and placeholders.
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
| `client.ts` | `buildTaskTimeline` and the timeline, nav-count and Today types; roadmap URL helpers (`roadmapSearch`, `parseRoadmapLocation`, `branchForRow`); map geometry (`layoutMissionMap`, `mapCamera`) |
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

The shell renders a compact `BeaverCompanion` with request-provided timer context. Its Hide/Show preference is local to the browser; it never blocks work. Raster poses live in public/mascot and pure presentation in shared/ui/taskpulse-beaver. No new database ownership or formula.

Today now puts `MissionRoadmap` first and streams the weekly/award panels below it. `roadmap-actions.ts` authenticates and checks active own assignment before loading bounded branches/item time. `loadRoadmapMissions` uses keyset batches, due filters and dual primary/participant sources; `loadRoadmapBranch`/`loadRoadmapItemTime` reuse checklist public reads. The Roadmap view is `today/mission-map.tsx`: one pannable/zoomable map where missions wind down a road and opened branches fan out on their side, with a leaf card for quick completion and the shared work panel; writes reread only the open branches. The List view keeps the keyboard-first list. Both share the URL location (mission, checklist, parent, section, item). Missing backend migrations surface unavailable states.
