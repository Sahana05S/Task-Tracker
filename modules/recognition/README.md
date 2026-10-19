# recognition

The gamification layer (M16): streaks, the daily star spotlight, the monthly
award ceremony, the leaderboard and the recognition points behind the Hall of
Fame. It adds **no scoring rule**: every figure comes from the shared ten-factor
engine and the M08/M12 award evidence owned by `scoring` and `reports`.
Recognition points are a separate currency and never feed a performance score.

User decisions of 19 October 2026 are recorded in `docs/plans/DECISIONS.md`
("M16 recognition") and `docs/plans/M16-recognition.md`.

## What it does (current slice: streaks)
An "active day" streak per member: a day counts when the member has active
Present/Half Day attendance and at least one non-reversed task log (timer
segments are log rows) or a live fact, idea or suggestion dated that day.
Holiday, Leave, Off Hours and days with no attendance record are skipped; Absent
or a worked day with nothing logged breaks the streak. Milestones: 3, 7, 14, 30,
60, 100 days.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getStreak(userId)` -> `StreakSummary` (server read; re-exports `client.ts`) |
| `client.ts` | `computeStreak`, `milestonesReached`, `DEFAULT_MILESTONES`, `parseRecognitionPolicy`, `DEFAULT_RECOGNITION_POLICY`, types |
| `components/` | `StreakCard`, `StreakFlame`, `StreakStrip`, `MilestoneMeter`, `MilestoneToast`, `CountUp` |

No `actions.ts`: this slice has no commands.

## Private (`internal/`)
| File | Job |
|---|---|
| `queries.ts` | `readActivityDays` (RPC `recognition_activity_days`) |
| `streaks.ts` | Joins the RPC day codes with the pure rule |
| `rules.ts` | `computeStreak`, `milestonesReached` (pure) |
| `policy.ts` | Parses `recognition_policy.config`; defaults mirror migration 45 |

## Database it owns
- `taskpulse_private.recognition_policy` (migration 45): global singleton
  (points, milestones, lookback). Per-company settings arrive with M15.3.
- `public.recognition_activity_days(p_as_of, p_employee)` (migration 45):
  one day code per member per Asia/Kolkata day, self only for members, any
  member or everyone for managing directors and project engineers.

## Depends on
`shared/*` (`supabase/server`, `async/settle`, `ui/*`) and the public API of:
`scoring` (later slices), `team` (names, later slices).
