# recognition

The gamification layer (M16): streaks, the daily star spotlight, the monthly
award ceremony, the leaderboard and the recognition points behind the Hall of
Fame. It adds **no scoring rule**: every figure comes from the shared ten-factor
engine and the M08/M12 award evidence owned by `scoring` and `reports`.
Recognition points are a separate currency and never feed a performance score.

User decisions of 19 October 2026 are recorded in `docs/plans/DECISIONS.md`
("M16 recognition") and `docs/plans/M16-recognition.md`; the Waypoints names
are the 20 October 2026 decision. Sales is mapped (migration 46, D05), so
composite-based features show their normal state; the locked state is only the
fallback for a database still at 45 or earlier. Migrations: 45 streaks, 50 the
ceremony, 51 waypoints.

## What it does (current slices: streaks, daily star spotlight, leaderboard, ceremony, waypoints)
An "active day" streak per member: a day counts when the member has active
Present/Half Day attendance and at least one non-reversed task log (timer
segments are log rows) or a live fact, idea or suggestion dated that day.
Holiday, Leave, Off Hours and days with no attendance record are skipped; Absent
or a worked day with nothing logged breaks the streak. Milestones: 3, 7, 14, 30,
60, 100 days.

The daily star spotlight on the Today page shows yesterday's M08 daily star
(Asia/Kolkata) exactly as the award read model certifies it: a winner (with
confetti and a glow when the viewer is the star), a certified "no star" with
its reason, a blocked run stated as waiting for data with the run's own
reasons, or pending when no run exists. It adds no selection logic; the
`scoring` module decides the star.

The leaderboard (`/leaderboard`, Team section) ranks one month of the shared
ten-factor calculation (`loadPerformance`): an Overall board (the composite,
two decimals) for members the engine marks eligible for ranking, and one board
per factor ranked by the raw value for members with that factor available and
no attendance eligibility reason. Exact ties share a place (1, 1, 3); values
are compared exactly, never after rounding. Everyone sees every place and the
Overall score (DECISIONS "M16 recognition", item 2); factor values, the
difference from the median and the reasons a member is unranked are projected
away on the server unless the viewer is that member or a manager. A board with
no ranked member is `unavailable` with the engine's reasons, or `locked` only
when the sales mapping is missing (a database before migration 46). The current
month is read as of the database clock, a past month as of its last instant.

The award ceremony (`/awards`, Team section; last month by default) gives one
category award per factor and then the monthly star. A category goes to the
highest raw value of that factor among members with the factor available, no
attendance eligibility reason and a value above zero; an exact tie at the top
gives no award (the M08 rule); a factor nobody has is "not measured". The
monthly star is the live M08 monthly winner (`getAwards().monthly`: most
certified effective daily stars, ties broken by the composite), so it does not
need a certified month archive; when the ledger and the calculation do not
share a source context (a past month, a closed month) the same `selectMonthly`
runs over the ledger's days. While the month runs the ceremony is
provisional; once it has ended the managing director publishes it (migration
50), which makes it official and immutable; publishing again needs a reason
and keeps every revision. An official ceremony is revealed one card at a time
the first time a tab opens it (Next, Skip, Replay; reduced motion and later
visits show everything). `CeremonyStage` takes a `commendations` slot for the
policies module (wave 3). Winning values are shown only to the winner and
managers. Without migration 50 the page still shows the provisional results
and says publishing needs a database update.

Waypoints are per-mission progress stages: 30% Ignition, 50% Escape Velocity,
70% Deep Space, 90% Final Approach, 100% Landing. The database stores each
mission's first crossing of each one (triggers on `tasks.progress_percentage`,
so every write path counts) and never removes it when progress drops. Every
current assignee is credited; only the person whose save crossed it gets the
celebration (toast and confetti, within 15 minutes, once per browser). They
award no points and never touch a performance score. Shown as a track on
Missions cards, a Waypoint column in the Missions table and the mission
overview, a "Waypoints reached" row on Today's week card and a "Waypoints this
month" tile on the profile. On a database before 51 the tracks follow current
progress only and the two counts are hidden.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getStreak(userId)` -> `StreakSummary`; `getDailyStarHighlight(userId)` -> `DailyStarHighlight`; `getLeaderboard(viewer, period)` -> `LeaderboardModel`, `leaderboardPeriod(month?)`, `getCeremony(viewer, period)` -> `CeremonyModel`; `getTaskWaypoints(taskIds)` -> `TaskWaypointsModel`; `getMissionWaypoints(tasks)` -> `MissionWaypoints` (reached keys + the viewer's recent crossings, what pages ship to the browser); `getWaypointCount(userId, from, to)` -> `WaypointCount \| null` (null before 51) (server reads; re-exports `client.ts`) |
| `ceremony-actions.ts` | `publishCeremonyAction(form)`: publish or republish an elapsed month (managing director; the database enforces it) |
| `client.ts` | `computeStreak`, `milestonesReached`, `dailyStarHighlight`, `DEFAULT_MILESTONES`, `parseRecognitionPolicy`, `DEFAULT_RECOGNITION_POLICY`, `buildLeaderboard`, `rankExact`, `podiumSteps`, `parseBoardKey`, `BOARD_KEYS`/`BOARD_LABELS`/`BOARD_SUMMARIES`, `selectCategoryWinners`, `monthlyStarAct`, `projectCategories`, `DEFAULT_WAYPOINTS`, `parseWaypoints`, `waypointState`, `missionWaypoints`, `freshCelebrations`, `CELEBRATION_WINDOW_MS`, types (`Waypoint`, `WaypointCrossing`, `CeremonyModel`, `CategoryAward`, `MonthlyStarAct`, `StreakSummary`, `DailyStarHighlight`, `DailyStarSource`, `LeaderboardModel`, `Board`, `BoardRow`, ...) |
| `components/` | `StreakCard`, `StreakFlame`, `StreakStrip`, `MilestoneMeter`, `MilestoneToast`, `CountUp`, `DailyStarSpotlight`, `ConfettiBurst` (client), `useReducedMotion` (client), `LeaderboardTabs`, `LeaderboardPodium`, `LeaderboardList`, `LeaderboardBoardStatus`, `CeremonyStage` (client), `CeremonyPublish` (client), `AwardCard`, `HiddenAwardCard`, `FinaleCard`, `WaypointTrack` (server-safe), `WaypointCelebration` (client), `WaypointProvider` + `MissionWaypointSlot` (client; fill the tasks module's `WaypointSlot`) |


## Private (`internal/`)
| File | Job |
|---|---|
| `queries.ts` | `readActivityDays` (RPC `recognition_activity_days`) |
| `streaks.ts` | Joins the RPC day codes with the pure rule |
| `daily-star.ts` | Reads yesterday's award day through `readTeamAwardModel` (scoring) and maps it |
| `rules.ts` | `computeStreak`, `milestonesReached`, `dailyStarHighlight` (pure); `DEFAULT_WAYPOINTS` |
| `leaderboard-rules.ts` | `buildLeaderboard`, `rankExact` (competition ranking on exact values), `podiumSteps` (pure) |
| `leaderboard.ts` | `loadMonth` (the month's shared calculation at the canonical as-of) and the leaderboard projection |
| `ceremony-rules.ts` | `selectCategoryWinners`, `monthlyStarAct`, `projectCategories` (pure; the same category rule runs in migration 50) |
| `ceremony.ts` | Reads the published ceremony or builds the provisional one; publishes through `recognition_ceremony_command` |
| `waypoints.ts` | RPCs `recognition_task_waypoints` / `recognition_waypoint_counts`, batched by 500, with the pre-51 fallback |
| `waypoint-rules.ts` | `waypointState` (reached = stored crossings + current progress; next), `missionWaypoints` (payload trim), `freshCelebrations` (pure) |
| `policy.ts` | Parses `recognition_policy.config`; defaults mirror migrations 45 and 51 |

## Database it owns
- `taskpulse_private.recognition_policy` (migration 45): global singleton
  (points, milestones, lookback). Per-company settings arrive with M15.3.
- `public.recognition_activity_days(p_as_of, p_employee)` (migration 45):
  one day code per member per Asia/Kolkata day, self only for members, any
  member or everyone for managing directors and project engineers.
- Migration 50 (company-owned, `organization_id`, immutable, FORCE RLS via
  `m15_secure()`): `taskpulse_private.recognition_ceremonies` (one row per
  published revision of a month, with the monthly star),
  `recognition_ceremony_awards` (ten category rows per revision) and
  `recognition_ceremony_receipts` (idempotent replays). Functions:
  `public.recognition_ceremony_command(p_period, p_payload, p_operation,
  p_expected_revision)` (managing director, elapsed month, a calculation no
  older than 15 minutes on the current source watermark covering exactly the
  company's active members; the database derives the category winners and the
  monthly star itself and refuses a payload whose monthly star differs from
  the daily evidence), `public.recognition_ceremony_read(p_period)` (everyone
  in the company; winning values for the winner and managers) and
  `public.recognition_points(p_employee)` (derived trophy counts per active
  member; dated entries for self or managers). Private helpers
  `recognition_daily_wins`, `recognition_category`, `recognition_monthly_star`.
- `taskpulse_private.task_waypoints` (migration 51): first crossings per
  mission and waypoint (`source` progress / insert / backfill; backfill never
  counts), company-owned, written only by `taskpulse_private.record_task_waypoints`
  (triggers `zz_m16_task_waypoints_insert` / `_progress` on `public.tasks`).
  `recognition_policy.config` gains `waypoints` and reserves `points.waypoint` /
  `points.landing` at 0.
- `public.recognition_task_waypoints(p_task_ids)` (51): stored crossings of up
  to 500 missions of the caller's company, with "was it your save".
- `public.recognition_waypoint_counts(p_from, p_to, p_employee)` (51): per
  member, crediting every current assignee; visibility as activity days.

## Depends on
`shared/*` (`supabase/server`, `async/settle`, `time/*`, `math/exact`, `ui/*`)
and the public API of: `scoring` (`readTeamAwardModel`, `loadPerformance`,
`memberEligibilityReasons`, types), `reports` (`client.ts` plain-language gap
wording), `tasks` (`canManageTasks`, the manager rule). `team` imports this
module, so recognition never imports `team`; pages pass member names in.
