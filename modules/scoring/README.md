# scoring

The one shared scoring contract (AGENTS.md: no second formula):

- **Performance**: the ten-factor median-relative engine (M07), its source
  parsing and resolution, recomputation jobs and report shape.
- **Awards (stars)**: daily and monthly award rules (M08), the award command
  and override, award jobs and the sandbox worker endpoint, the award read
  model, and the retained legacy five-factor daily-star scorer (history only).
- **Analytics**: operational team analytics, dashboard charts and the mission
  headline. These are observations built on the engine, not another engine.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server reads and jobs: `loadPerformance`, `runPerformanceJobs`, `getAwards`, `calculateAward`, `runAwardJobs`, `handleAwardWorkerRun`, `handleHealthCheck` (`GET /api/internal/health`), `getTeamSummaryInputs`, `parseTeamSummary`, `readTeamAwardModel` (raw team-wide award payload for Today). Also re-exports everything in `client.ts`. |
| `client.ts` | Pure engine and rules, safe for `'use client'`: `calculatePerformance`, `FACTORS`, `FACTOR_LABELS`, `COEFFICIENTS`, `memberEligibilityReasons` (attendance reasons that keep a member out of rankings), source parse/resolve, `performanceReport`, award `selectDaily`/`selectMonthly`/`awardContext`, legacy scorer, `computeTeamAnalytics`, dashboard chart and headline builders, and all their types |
| `award-actions.ts` | `'use server'` `calculateDailyStarAction`, `overrideDailyStarAction` |
| `components/` | `MissionHeadlineStrip` (the `/tasks` headline), `PerformanceBreakdown`, `AwardHistory`, `AwardStatus` |

Calendar periods (`currentPeriod`, `resolvePeriod`, `AnalyticsPeriod`) live in
`shared/time/period`; exact decimal arithmetic (`Exact`) in `shared/math/exact`.

## Private (`internal/`)
| Folder | Files |
|---|---|
| `performance/` | `engine.ts` (ten factors, coefficients, cohorts), `sources.ts`, `queries.ts`, `jobs.ts`, `report.ts` |
| `stars/` | `contract.ts` (award policy and selection), `calculation.ts`, `daily.ts` (`award_command`), `jobs.ts`, `read-model.ts`, `team-read-model.ts`, `scoring.ts`, `legacy-scoring.ts`, `worker.ts`, `health.ts` (job-health counts; needs `operations_health()`, not yet migrated) |
| `analytics/` | `engine.ts`, `dashboard-charts.ts`, `headline.ts`, `summary-inputs.ts`, `availability.ts` |
| `cache.ts` | Revalidation after daily star changes |

## Database it owns
| Object | Defined in |
|---|---|
| `performance_source_context`, `claim_performance_jobs`, `finish_performance_job` | `21_performance_sources_and_recomputation.sql` |
| `award_command`, `award_read_model`, `award_policy_context`, `claim_award_jobs`, `queue_due_awards` | `22_award_runs_and_atomic_commands.sql`, revised in 23 (`queue_due_awards` also 40) |
| `team_summary_inputs` (read through `shared/read-models/team-summary`) | 11, revised in 13 and 16 |

All objects are company-scoped by migrations 39-40 (M15). Award workers send
each job's company in `x-taskpulse-organization` (`shared/supabase/worker.ts`).

## Depends on
`shared/*` and the public APIs of `tasks`, `time-tracking`, `attendance` and
`support` (its inputs). None of those import scoring.

The dashboard read (`getTeamAnalytics`, `getWorkbookDashboard`) composes the
live presentation, so it lives in the reports module. `components/` also holds
`PerformanceBreakdown`, `AwardHistory` and `AwardStatus`.
