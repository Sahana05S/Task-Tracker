# team

The people side of TaskPulse: the `/team` index, each employee's profile and
reports pages (who may see which), the director's daily-star controls on the
team page, the director's People page (`/team/manage`: invite, role, details,
remove/restore access) and the signed-in member's own Settings (display name).

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads: `getPeopleAdminData` (members and open invitations of the director's company), `getTeamIndexData`, `getEmployeeProfileData`, `getEmployeeReportsData`, `getEmployeeByEmployeeId`, `resolveEmployeeRouteState`, `getMemberNames` (id -> display name; empty on error), and their types. Also re-exports everything in `client.ts`. |
| `client.ts` | Pure: `canViewTeamModule`, `canViewEmployeeProfile`, `canViewEmployeeReports`, `employeeHref`, `employeeReportsHref`, `normalizeEmployeeIdParam`, `buildEmployeeAnalyticsCharts`, `optionalEmployeePerformance` |
| `profile-actions.ts` | `'use server'` `updateDisplayName` |
| `people-actions.ts` | `'use server'` `inviteMember`, `revokeInvitation`, `updateMember` (managing director only; enforced by `people_command`) |
| `components/` | `EmployeeAnalyticsCharts`, `AwardControls`, `SettingsForm`, `InviteForm` / `InvitationList` / `MemberList` (`people-admin.tsx`) |

## Private (`internal/`)
| File | Job |
|---|---|
| `queries.ts` | Team index, employee profile and reports data (composes tasks, logs, attendance, support, scoring and the live presentation) |
| `employee-charts.ts` | Employee trend and distribution charts |
| `performance-availability.ts` | Shows performance as unavailable, not zero, when progress is unmeasured |
| `permissions.ts` | Who may view the team, a profile or reports (UI; RLS is the real boundary) |
| `routes.ts` | Employee id URL parameters and links |
| `mappers.ts` | Daily star, score component and report snapshot rows |
| `profile.ts` | Display-name validation and the own-row update |
| `member-names.ts` | Member display names keyed by id (used by Today) |
| `people.ts` | People page: form parsing, members/invitations read, `people_command` call |

## Database it owns
| Object | Defined in |
|---|---|
| `users` (profile reads; own `full_name` update) | `01_init_schema.sql`; own-profile policy in `02_auth_provisioning.sql` |
| `daily_star_records`, `performance_score_components` (legacy history reads) | `01_init_schema.sql` |
| `member_invitations`, `people_command(text,jsonb)`, invite-only `handle_new_user`, last-director guard | `49_people_admin_invitations.sql` |

It also reads tables owned by other modules (`daily_task_logs`,
`attendance_records`, `report_snapshots`, `task_links`). All objects are
company-scoped by migrations 39-40 (M15).

## Depends on
`shared/*` and the public APIs of `reports`, `scoring`, `tasks`,
`time-tracking`, `attendance` and `support`. No module imports team; it is a
top-level view of the others.
