# team

The people side of TaskPulse: the `/team` index, each employee's profile and
reports pages (who may see which), the company org chart (`/team?view=chart`),
the director's daily-star controls on the team page, the director's People page (`/team/manage`: invite, role, details,
remove/restore access) and the signed-in member's own Settings (display name).

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `getPeopleAdminData` (members and open invitations of the director's company), `getTeamIndexData`, `getEmployeeProfileData`, `getEmployeeReportsData`, `getEmployeeByEmployeeId`, `resolveEmployeeRouteState`, `getMemberNames` (id -> display name; empty on error), `getOrgChart` (`available` is false before migration 65), and their types. Also re-exports everything in `client.ts`. |
| `client.ts` | Pure: `canViewTeamModule`, `canViewEmployeeProfile`, `canViewEmployeeReports`, `employeeHref`, `employeeReportsHref`, `normalizeEmployeeIdParam`, `buildEmployeeAnalyticsCharts` (with the profile chart types `EmployeeDayHours`, `EmployeeStarDay`, `StarDayState`, `EmployeeAttendanceDay`), `optionalEmployeePerformance`, the org chart's `buildOrgTree`, `parseOrgChart`, `teamSize`, `TODAY_STATUSES` and types |
| `profile-actions.ts` | `'use server'` `updateDisplayName` |
| `people-actions.ts` | `'use server'` `inviteMember`, `revokeInvitation`, `updateMember` (managing director only; enforced by `people_command`) |
| `components/` | `EmployeeChartsPanel` (profile Charts tab: ten factor small multiples against the dashed team median, hours per day, missions and deadlines, mission mix), `ScoreVsMedianChart`, `StarCalendar` (daily star log), `AwardControls`, `SettingsForm`, `InviteForm` / `InvitationList` / `MemberList` (`people-admin.tsx`; the member edit form sets Reports to, Job title and Department), `OrgChart` (top-down tree from `md`, indented list on phones), `TeamViewSwitch` (List / Chart) |

## Private (`internal/`)
| File | Job |
|---|---|
| `queries.ts` | Team index, employee profile and reports data (composes tasks, logs, attendance, support, scoring and the live presentation) |
| `employee-charts.ts` | Employee chart read model: score and each factor with the team median per dated observation, hours per day, daily star days, missions done and deadlines (from the scoring dashboard read model), mission mix |
| `performance-availability.ts` | Shows performance as unavailable, not zero, when progress is unmeasured |
| `permissions.ts` | Who may view the team, a profile or reports (UI; RLS is the real boundary) |
| `routes.ts` | Employee id URL parameters and links |
| `mappers.ts` | Daily star, score component and report snapshot rows |
| `profile.ts` | Display-name validation and the own-row update |
| `member-names.ts` | Member display names keyed by id (used by Today) |
| `people.ts` | People page: form parsing, members/invitations read, `people_command` call |
| `org-chart.ts` | `org_chart()` read |
| `org-tree.ts` | Pure org chart parser and tree builder (nearest active manager, loop guard) |

## Database it owns
| Object | Defined in |
|---|---|
| `users` (profile reads; own `full_name` update) | `01_init_schema.sql`; own-profile policy in `02_auth_provisioning.sql` |
| `daily_star_records`, `performance_score_components` (legacy history reads) | `01_init_schema.sql` |
| `member_invitations`, `people_command(text,jsonb)`, invite-only `handle_new_user`, last-director guard | `49_people_admin_invitations.sql` |
| `users.reports_to`, `job_title`, `department_id` (same company, no loops, active manager; a new non-director starts under the earliest active director), `people_command` placement fields, `org_chart()` (any active member; today's status coarse only: in, half day, away, not recorded) | `65_org_chart.sql` |

It also reads tables owned by other modules (`daily_task_logs`,
`attendance_records`, `report_snapshots`, `task_links`). All objects are
company-scoped by migrations 39-40 (M15).

## Depends on
`shared/*` and the public APIs of `reports`, `scoring`, `tasks`,
`time-tracking`, `attendance`, `support` and `settings` (the Team index names
calendar holidays; Settings > Company lives in the settings module). No module imports team; it is a
top-level view of the others.

## Employee profile tabs
`/team/[employeeId]` has Overview (tiles, daily star log, score against the
team median, calculation details), Charts (`?tab=charts`) and Missions
(`?tab=missions`: task list and log compilation); the Reports tab is the
`/team/[employeeId]/reports` route. The header (`profile-header.tsx` beside
the page) carries `period`/`asOf` across tabs and links the member's daily
report on `/reports`.
