# recognition

The gamification layer (M16): streaks, the daily star spotlight, the monthly
award ceremony, the leaderboard and the recognition points behind the Hall of
Fame. It adds **no scoring rule**: every figure comes from the shared ten-factor
engine and the M08/M12 award evidence owned by `scoring` and `reports`.
Recognition points are a separate currency and never feed a performance score.

User decisions of 19 October 2026 are recorded in `docs/plans/DECISIONS.md`
("M16 recognition") and `docs/plans/M16-recognition.md`.

## What it does (current slices: streaks, daily star spotlight, leaderboard, ceremony, hall of fame)
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

The hall of fame (`/hall-of-fame`, Team section) is all-time recognition:
points from certified effective daily stars (10), category awards on each
month's latest published ceremony (25) and monthly stars (100), the policy's
values (DECISIONS "M16 recognition", item 3). Points are a separate currency
and never feed a performance score; nothing is stored, so overrides, stale
slots and republished ceremonies change the next read. Tiers: Rookie 0, Bronze
25, Silver 100, Gold 300, Diamond 750. The page shows the viewer's points ring
and tier, a trophy case (monthly star, daily star, longest-streak milestone,
one badge per category; unearned badges say what earns them), the latest
trophies, and everyone in the company by points (equal points share a place).
Without migration 50 it says the hall of fame needs a database update.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getStreak(userId)` -> `StreakSummary`; `getDailyStarHighlight(userId)` -> `DailyStarHighlight`; `getLeaderboard(viewer, period)` -> `LeaderboardModel`, `leaderboardPeriod(month?)`, `getCeremony(viewer, period)` -> `CeremonyModel`, `getHallOfFame(viewerId)` -> `HallOfFameModel` (throws `HallOfFameUnavailable` before migration 50) (server reads; re-exports `client.ts`) |
| `ceremony-actions.ts` | `publishCeremonyAction(form)`: publish or republish an elapsed month (managing director; the database enforces it) |
| `client.ts` | `computeStreak`, `milestonesReached`, `dailyStarHighlight`, `DEFAULT_MILESTONES`, `parseRecognitionPolicy`, `DEFAULT_RECOGNITION_POLICY`, `buildLeaderboard`, `rankExact`, `podiumSteps`, `parseBoardKey`, `BOARD_KEYS`/`BOARD_LABELS`/`BOARD_SUMMARIES`, `selectCategoryWinners`, `monthlyStarAct`, `projectCategories`, `pointsFor`, `tierFor`, `rankHall`, `TIERS`, types (`HallOfFameModel`, `HallEntry`, `TierProgress`, `CeremonyModel`, `CategoryAward`, `MonthlyStarAct`, `StreakSummary`, `DailyStarHighlight`, `DailyStarSource`, `LeaderboardModel`, `Board`, `BoardRow`, ...) |
| `components/` | `StreakCard`, `StreakFlame`, `StreakStrip`, `MilestoneMeter`, `MilestoneToast`, `CountUp`, `DailyStarSpotlight`, `ConfettiBurst` (client), `useReducedMotion` (client), `LeaderboardTabs`, `LeaderboardPodium`, `LeaderboardList`, `LeaderboardBoardStatus`, `CeremonyStage` (client), `CeremonyPublish` (client), `AwardCard`, `HiddenAwardCard`, `FinaleCard`, `PointsRing`, `TierBadge`, `TrophyCase`, `HallOfFameList` |


## Private (`internal/`)
| File | Job |
|---|---|
| `queries.ts` | `readActivityDays` (RPC `recognition_activity_days`) |
| `streaks.ts` | Joins the RPC day codes with the pure rule |
| `daily-star.ts` | Reads yesterday's award day through `readTeamAwardModel` (scoring) and maps it |
| `rules.ts` | `computeStreak`, `milestonesReached`, `dailyStarHighlight` (pure) |
| `leaderboard-rules.ts` | `buildLeaderboard`, `rankExact` (competition ranking on exact values), `podiumSteps` (pure) |
| `leaderboard.ts` | `loadMonth` (the month's shared calculation at the canonical as-of) and the leaderboard projection |
| `ceremony-rules.ts` | `selectCategoryWinners`, `monthlyStarAct`, `projectCategories` (pure; the same category rule runs in migration 50) |
| `ceremony.ts` | Reads the published ceremony or builds the provisional one; publishes through `recognition_ceremony_command` |
| `hall-rules.ts` | `pointsFor`, `tierFor`, `rankHall`, `TIERS` (pure) |
| `hall.ts` | Reads `recognition_points` and scores it with the policy |
| `policy.ts` | Parses `recognition_policy.config`; defaults mirror migration 45 |

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

## Depends on
`shared/*` (`supabase/server`, `async/settle`, `time/*`, `math/exact`, `ui/*`)
and the public API of: `scoring` (`readTeamAwardModel`, `loadPerformance`,
`memberEligibilityReasons`, types), `reports` (`client.ts` plain-language gap
wording), `tasks` (`canManageTasks`, the manager rule). `team` imports this
module, so recognition never imports `team`; pages pass member names in.
