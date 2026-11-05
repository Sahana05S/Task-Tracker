# team

The people side of Stellar: the `/team` index, each employee's profile and
reports pages (who may see which), the company org chart (`/team?view=chart`),
the director's daily-star controls on the team page, the director's People page (`/team/manage`: invite, role, details,
remove/restore access) and the signed-in member's own Settings (display name).

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `getPeopleAdminData` (members and open invitations of the director's company), `getTeamIndexData`, `getEmployeeProfileData`, `getEmployeeReportsData`, `getEmployeeByEmployeeId`, `resolveEmployeeRouteState`, `getMemberNames` (id -> display name; empty on error), `getOrgChart` (`available` is false before migration 65), and their types. Also re-exports everything in `client.ts`. |
| `client.ts` | Pure: `canViewTeamModule`, `canViewEmployeeProfile`, `canViewEmployeeReports`, `employeeHref`, `employeeReportsHref`, `normalizeEmployeeIdParam`, `buildEmployeeAnalyticsCharts` (with the profile chart types `EmployeeDayHours`, `EmployeeStarDay`, `StarDayState`), `optionalEmployeePerformance`, the org chart's `buildOrgTree`, `orgTiers` (top-level managing directors as one leadership row; people with no manager join the level under it, `noManager`, so the chart is one tree), `levelRows` and `ORG_LEVEL_WIDTH` (levels wider than four wrap into balanced rows), `parseOrgChart`, `teamSize`, `TODAY_STATUSES` and types |
| `profile-actions.ts` | `'use server'` `updateDisplayName` |
| `people-actions.ts` | `'use server'` `inviteMember`, `revokeInvitation`, `updateMember` (managing director only; enforced by `people_command`) |
| `components/` | `EmployeeChartsPanel` (profile Charts tab: ten factor small multiples against the dashed team median, hours per day, missions and deadlines, mission mix), `ScoreVsMedianChart`, `StarCalendar` (daily star log), `AwardControls`, `SettingsForm`, `InviteForm` / `InvitationList` / `MemberList` (`people-admin.tsx`; the member edit form sets Reports to, Job title and Department), `OrgChart` (top-down tree from `md`, indented list on phones; two or more top-level managing directors share one leadership row joined to everyone below, each of whom names their manager, since 3 November 2026), `TeamViewSwitch` (List / Chart) |

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
| `org-tree.ts` | Pure org chart parser and tree builder (nearest active manager, loop guard), `orgTiers` (the leadership row) and `levelRows` (wrapping) |

## Database it owns
| Object | Defined in |
|---|---|
| `users` (profile reads; own `full_name` update) | `01_init_schema.sql`; own-profile policy in `02_auth_provisioning.sql`; since 94 a member can no longer change their own `email` |
| Invitations (`handle_new_user`) | 49; since 94 applied only to a confirmed address, employee IDs checked within the company |
| `daily_star_records`, `performance_score_components` (legacy history reads) | `01_init_schema.sql` |
| `member_invitations`, `people_command(text,jsonb)`, invite-only `handle_new_user`, last-director guard | `49_people_admin_invitations.sql` |
| Direct writes to `users` change only `full_name`, for every role (directors included); roles, activation, placement and email change only through `people_command` or `handle_new_user` | `105_users_direct_write_display_name_only.sql` |
| Three roles (5 November 2026): Managing Director, **Manager** (enum code `project_engineer`, same powers as before) and Team Member. `data_manager` is retired: `people_command` refuses to invite as or move anyone into it (23514); existing engineers, data managers and their open invitations became team members, each with a `retire_role` audit row | `125_roles_manager.sql` |
| `users.reports_to`, `job_title`, `department_id` (same company, no loops, active manager; a new non-director starts under the earliest active director, also when the company is attached later: 103), `people_command` placement fields, `org_chart()` (any active member; today's status coarse only: in, half day, away, not recorded; from the active attendance record only since 107) | `65_org_chart.sql`, `103_org_chart_default_manager.sql`, `107_org_chart_active_status.sql` |

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
