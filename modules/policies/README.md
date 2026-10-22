# policies

Company rules the managing director sets from templates, such as "on time every
working day this month" (user decision, 20 October 2026). A met policy gives a
commendation badge, a congratulation notification, a ceremony mention and the
policy's recognition points. **Recognition points never feed the ten-factor
performance score**: this module never imports `modules/scoring/internal`, and
nothing in scoring reads the policy tables.

## How it works
- **Facts in SQL.** `policy_period_facts(from, to, employee?)` returns, per member
  and day, attendance status, check-in time (HH:MM, Asia/Kolkata), confirmed
  regular/off hours, logged hours, an activity flag (a live log or contribution)
  and the team-holiday flag; per member, mission counts at the end of the range
  (open, overdue, stale, rotten, done, undated, rebuilt from dates so a closed
  period is judged as it was) and validated contribution counts. Members read
  themselves, managers their company, the scoped worker its company; 62 days at most.
- **Templates in TypeScript** (`internal/templates/`). Each is
  `{key, label, summary, periodKinds, parameters, defaults, defaultReward, ruleVersion, evaluate}`.
  Adding one is a file, a line in `templates/index.ts` and fixture cases; no migration.
- **One evaluator.** `evaluatePolicy(definition, period, facts)` is used by the
  dialog preview, "Evaluate now" and the nightly worker (`internal/run.ts`), so
  their answers never drift. A period that has not ended gives provisional
  results ("On track", "Not yet"); only final results are commendations.
- **One command** in SQL: `policy_command` (`create`, `revise`, `activate`,
  `deactivate`, `archive` by the managing director; `record_run` and
  `record_failure` by the managing director or the scoped worker). Idempotent per
  operation; a reused operation with different input or a stale version is PT409.
- **Failures are rows.** A failed pass writes a `failed` run with an error code
  and notifies the managing directors once a day. Nothing is shown as a zero.
- **Corrections.** Every retained input change (attendance, logs, contributions,
  sales) and every change to a mission's dates, assignee, archive or discarded
  state records an invalidated date range; `policy_due_work` returns the touched
  periods again. Only rows whose outcome, reasons or evidence changed are
  updated. A commendation that stops being met keeps its date and shows as
  "withdrawn after correction"; notifications are never sent twice.
- **Versions.** Every change is an immutable revision. A closed period is judged
  by the version in force when it ended; the open period by the current one.

## Templates
| Key | Parameters (defaults) | Met when |
|---|---|---|
| `on_time_all_period` | check in by 09:30, late days allowed 0, minimum working days 0, half days count, missing check-in = cannot be judged | check-in at or before the cut-off on every working day, apart from the allowed late days |
| `full_attendance` | leave days allowed 0 | no Absent day and leave within the allowance |
| `logged_every_working_day` | minimum 0.25 h, half days count | at least the minimum logged on every working day |
| `hours_within_attendance` | none | on each day with logged time, logged ≤ confirmed regular + off hours |
| `active_day_streak` (week, month) | 7 days | the approved active-day streak reaches the length inside the period |
| `validated_contributions` | any, 3 | validated facts/ideas/suggestions/sales in the period ≥ the count |
| `no_overdue_at_period_end` | 0 | open missions past due at the period end ≤ allowance |
| `all_missions_fresh_at_period_end` | 0 stale | no rotten mission and stale within the allowance |

A working day is not a team holiday or Holiday record, and is Present (or Half
Day when allowed). A past day with no attendance record makes the outcome
"cannot be judged" (`attendance_missing`, with the dates); today is pending. A
period with no working day at all cannot be judged rather than being a vacuous
"met". Check-in is optional in attendance today, so the on-time template often
reports missing check-ins; the managing director can count them as late.

Periods: day `2026-10-19`, ISO week `2026-W43` (Monday to Sunday), month `2026-10`
(`internal/periods.ts` mirrors `taskpulse_private.policy_period`).

## Public API
| File | What it offers |
|---|---|
| `index.ts` | `getPolicies()`, `getCommendations(range)`, read types, and everything in `client.ts` |
| `client.ts` | Types, `TEMPLATES`/`templateFor`, periods (`periodOf`, `periodLabel`, ...), `evaluatePolicy`, `countOutcomes`, outcome and reason labels |

## Private (`internal/`)
| File | Job |
|---|---|
| `types.ts` | Domain types |
| `periods.ts` | Period keys and bounds, labels |
| `templates/` | The template contract (`spec.ts`) and the eight templates |
| `evaluate.ts` | The evaluator and audience filter |
| `input.ts` | Policy dialog FormData parsing |
| `labels.ts` | Plain words for outcomes and reason codes |
| `queries.ts` | Reads of migration 56 |
| `commands.ts` | `policy_command` |
| `run.ts` | One evaluation pass: facts once per period, evaluate, record, failures as runs |

## Database it owns (migration 56, all private, company-owned)
Tables `taskpulse_private.policies`, `policy_revisions` (immutable),
`policy_runs`, `policy_evaluations`, `policy_period_states`,
`policy_invalidations`, `policy_receipts` (immutable) and `notifications` (read
through `modules/notifications`). Functions `policy_period_facts`,
`policy_due_work`, `policy_command`, `policy_list`, `policy_evaluations_read`,
`policy_runs_read`, `policy_commendations`, `notifications_list`,
`notifications_unread_count`, `notifications_mark_read`. Triggers on
`taskpulse_private.input_history` and `public.tasks` record invalidations.
Holidays come only from `public.team_holiday_dates` (37, plus 53's company
calendar); until that function accepts the scoped worker, the worker uses 37's
rule computed in 56. Harness: `tools/test_policies_database.py`.

The 20 October plan named the tables `public.*`; they are private with read
functions instead, as for the ceremony (50) and waypoints (51), so no table is
reachable through PostgREST directly.

## Depends on
`shared/*` and the public API of `recognition` (`computeStreak` for the streak
template). `recognition` must never import this module (the ceremony and hall of
fame receive commendations from the page), so there is no cycle.
