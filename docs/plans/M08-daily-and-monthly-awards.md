# M08 — Automatic daily stars and monthly awards

Status: implemented awaiting native verification on 13 October 2026. All three
D10 follow-up policies are approved and active through migration23. See [M08 evidence](M08-evidence.md).
Native verification/delivery remain outstanding. Required predecessor: M07.

## Outcome

Award daily stars from the shared engine with attendance validity as a gate, then select the monthly winner by daily-win count and performance tie-break.

## Existing code and confirmed problems

lib/stars/scoring.ts admits hoursLogged>0 OR attendanceValid; daily.ts independently scores logs and current checklists. Team star-actions is manager-triggered; a deployed automatic schedule is unverified. Monthly winner currently comes from dashboard composite.

## Implementation steps

1. Select daily candidates using approved membership/task/report-validity rules and the shared engine at the agreed daily cutoff/as-of context.
2. Implement highest-score selection, exact ties and no-winner behavior from D10. Store the full calculation provenance and an explicit absence of winner when applicable.
3. Add a reliable daily scheduled run with timezone, retries, unique date/rule revision and monitoring. Keep manual recomputation as the same command, not a separate formula.
4. Handle late log/attendance/contribution corrections by invalidating affected open dates. Do not mutate frozen award evidence without an authorized M12 revision.
5. Implement monthly counts across eligible recorded daily wins; highest count wins, then current shared score. Define the final tie and exclusion rules explicitly.
6. Separate audited manager override from automatic result, with reason/actor/history and the agreed monthly-count effect. Recalculation must preserve that distinction.
7. Replace misleading daily score trend construction with actual calculated daily scores, not only winner records. Persist all candidate scores when needed for complete employee history.

## Data and interface contract

AwardRun contains date, ruleVersion, context, candidates, eligibility reasons, winner/none and revision. Override references an automatic run and never erases it. Scheduler identity has only its necessary write privileges.

## Acceptance and verification

- [x] High-score but invalid-attendance member cannot win.
- [x] No valid candidates produces no award, not an arbitrary alphabetic winner.
- [x] Daily scheduled/manual retries produce one effective award per date/revision.
- [x] MemberA with4 wins beats memberB with3 despiteB having higher performance; tied wins use shared performance.
- [x] Corrections, overrides and closed-month behavior are auditable and deterministic.
- [x] Employee daily score history includes non-winners, not just winner dates.

These checks are independent fixture/disposable SQL evidence. D10 policies are
approved; native authentication/browser and real scheduler/HTTP delivery remain
unperformed. Missing sales/inputs and frozen archives retain explicit guards.

## UI / workflow integration

Show why a member was ineligible, automatic versus override winner, last successful calculation and stale/recompute state. Monthly star card shows win count and tie-break context.

## Scope boundaries

Do not retain current five-factor daily-star weights or grant ordinary users award-write access. Scheduling must be verified, not assumed from code existence.

## Decisions and rollout

D10 and existing D13 role boundaries are approved; rollout still requires
authorized scheduler/timezone/identity configuration and native checks. Database tests and scheduler replay tests precede live automation.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.
