# recognition

The gamification layer (M16): streaks, the daily star spotlight, the monthly
award ceremony, the leaderboard and the recognition points behind the Hall of
Fame. It adds **no scoring rule**: every figure comes from the shared ten-factor
engine and the M08/M12 award evidence owned by `scoring` and `reports`.
Recognition points are a separate currency and never feed a performance score.

User decisions of 19 October 2026 are recorded in `docs/plans/DECISIONS.md`
("M16 recognition") and `docs/plans/M16-recognition.md`.

## What it does (current slices: streaks, daily star spotlight)
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

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getStreak(userId)` -> `StreakSummary`; `getDailyStarHighlight(userId)` -> `DailyStarHighlight` (server reads; re-exports `client.ts`) |
| `client.ts` | `computeStreak`, `milestonesReached`, `dailyStarHighlight`, `DEFAULT_MILESTONES`, `parseRecognitionPolicy`, `DEFAULT_RECOGNITION_POLICY`, types (`StreakSummary`, `DailyStarHighlight`, `DailyStarSource`, ...) |
| `components/` | `StreakCard`, `StreakFlame`, `StreakStrip`, `MilestoneMeter`, `MilestoneToast`, `CountUp`, `DailyStarSpotlight`, `ConfettiBurst` (client), `useReducedMotion` (client) |

No `actions.ts`: this slice has no commands.

## Private (`internal/`)
| File | Job |
|---|---|
| `queries.ts` | `readActivityDays` (RPC `recognition_activity_days`) |
| `streaks.ts` | Joins the RPC day codes with the pure rule |
| `daily-star.ts` | Reads yesterday's award day through `readTeamAwardModel` (scoring) and maps it |
| `rules.ts` | `computeStreak`, `milestonesReached`, `dailyStarHighlight` (pure) |
| `policy.ts` | Parses `recognition_policy.config`; defaults mirror migration 45 |

## Database it owns
- `taskpulse_private.recognition_policy` (migration 45): global singleton
  (points, milestones, lookback). Per-company settings arrive with M15.3.
- `public.recognition_activity_days(p_as_of, p_employee)` (migration 45):
  one day code per member per Asia/Kolkata day, self only for members, any
  member or everyone for managing directors and project engineers.

## Depends on
`shared/*` (`supabase/server`, `async/settle`, `time/kolkata`, `ui/*`) and the
public API of: `scoring` (`readTeamAwardModel`, `AwardReadModel`), `reports`
(`client.ts` plain-language gap wording for a blocked run), `team` (names,
later slices).
