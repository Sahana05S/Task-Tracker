# workspace-views

The view layer: screens that combine several modules and own no business
rules or tables of their own. It sits above every domain module; no domain
module may import it (the boundary test enforces this).

- **Shell**: app shell, top bar, navigation drawer, phone bottom nav, section
  tabs, user menu, running-timer pill, workspace header and placeholders.
- **Dashboard**: team stats, productivity and allocation charts, workbook
  dashboard, award summary, calculation details, data-status banner.
- **Today**: the member's day (focus missions, week summary, award snapshot,
  validated contributions).
- **Timelines**: the task Gantt and task relations.
- **Missions list**: `MissionsWorkspace` plugs time tracking's "Log hours"
  button into the tasks workspace.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `getNavCounts`, `getTodayData`, `weekStartOf`. Also re-exports everything in `client.ts`. |
| `client.ts` | `buildTaskTimeline` and the timeline, nav-count and Today types |
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

Today now puts `MissionRoadmap` first and streams the weekly/award panels below it. `roadmap-actions.ts` authenticates and checks active own assignment before loading bounded branches/item time. `loadRoadmapMissions` uses keyset batches, due filters and dual primary/participant sources; `loadRoadmapBranch`/`loadRoadmapItemTime` reuse checklist public reads. Roadmap/list, recursive expand, branch focus, zoom, section tabs and URL restoration share one model. Missing backend migrations surface unavailable states.
