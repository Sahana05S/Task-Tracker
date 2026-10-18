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
| `today.ts` | Loads the Today page sections, each one ready or unavailable on its own |
| `timelines/gantt.ts` | Builds the Gantt rows, bars and ticks from tasks |

## Database it owns
None. Today still reads a few tables owned by other modules directly
(`today.ts`); move those reads behind their modules' public APIs when Today
changes next.

## Depends on
`shared/*` and the public APIs of `auth`, `tasks`, `time-tracking`,
`milestones`, `scoring`, `reports` and `team`'s neighbours as each screen needs.
