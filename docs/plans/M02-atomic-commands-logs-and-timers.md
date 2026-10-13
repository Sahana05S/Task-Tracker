# M02 — Atomic commands, logs, timers and audit history

Status: independent commands implemented; record/date decisions and native integration verification pending. Required predecessor: M01 (local SQL verified; native checks outstanding).

See [M02 evidence](M02-evidence.md) for actual commands, safeguards and tests.

## Outcome

Make critical writes transaction-safe, replay-safe and auditable, so later modules do not build on partial updates or lost progress.

## Existing code and confirmed problems

app/logs/actions.ts inserts logs then recalculates separately; lib/logs/task-metrics.ts reads then overwrites progress. Timer stop creates a log and stops the timer in separate writes. Support splitting changes source before insert. Current progress deltas can differ from the actual applied change at0/100 boundaries.

## Implementation steps

1. Implement an authorized database-command layer for create/edit/delete-correct log, timer start/stop/discard, participant changes and generic atomic task initialization. Use locks/versions to prevent lost updates.
2. Track requested delta versus effective applied progress delta where clamping occurs. Define canonical correction events so95+10 records only5 actual task progress for analytics;0−10 cannot create negative produced progress.
3. Recompute the task metrics required by the rule contract in the same transaction; coordinate checklist-owned progress with M05 instead of overwriting it from logs.
4. Guarantee one active timer per permitted user via DB constraint, and exactly one generated log per stop through idempotency/unique references. Retry after timeouts returns the existing result.
5. Implement robust timer recovery if log creation or state change fails. Validate duration/hours, zero-duration behavior, cross-midnight/month boundaries and timezone assignment. Split across dates if the agreed daily-hours contract requires it.
6. Add append-only audit records for sensitive changes/corrections, with actor, timestamp, entity, command and safe before/after details; minimize private content.
7. Provide a durable outbox/job contract for external tasks and recomputation scheduling. Revalidation happens only after confirmed command results.

## Data and interface contract

Command input: actor resolved from authenticated context, operationId/idempotencyKey, expectedVersion, validated payload. Result: committed IDs/version/effective deltas or typed error; no ambiguous partial success. DB writes/audit/outbox are one transaction; external calls remain outside it.

## Acceptance and verification

- [x] Local PostgreSQL: two simultaneous increments preserve both effective changes or report a version conflict; no lost update.
- [x] Local PostgreSQL: duplicate submit/retry produces one log/timer stop and no double progress.
- [x] Local PostgreSQL: failure midway rolls back all dependent writes and audit/outbox state.
- [x] Local PostgreSQL: boundary cases95+10 and0−10 preserve actual progress and truthful analytics deltas.
- [ ] Timer reload/background operation persists state; stop/discard/unauthorized stop are validated in DB.
- [x] Local PostgreSQL: audit events are immutable to ordinary app users and exclude credentials.

## UI / workflow integration

Connect log/timer controls to typed command results. Disable repeat submission as UX only; DB idempotency remains authoritative. Show recoverable conflicts with current task state.

## Scope boundaries

Do not choose a new scoring formula or perform provider calls in transactions. Do not rewrite historical manual progress from log sums without an approved conversion rule.

## Decisions and rollout

D02, D07, D10 and D13 affect date/correction rules. Define command contracts now and migrate their callers incrementally; confirm failures in a test database, not by corrupting live records.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.


## M02 implementation boundary - 10 October 2026

Migrations 12-13 implement create/correct logs, timer start/stop/discard, original
share-version credit, current credit anchors, audit/receipt correlation and blocked
durable invalidations. Reverse-log RPC remains a policy guard, not an enabled
reversal workflow. Direct deletion is denied; history is retained. Zero/small
unrecordable timer durations and ambiguous UTC/Asia-Kolkata day sessions remain
running with actionable errors. No date split is invented.

Database persisted timer/retry behavior is verified separately from browser
reload/background verification, which is outstanding. Terminal/checklist-owned
or linked progress, frozen-period changes, unknown old progress effects and
logged scale changes retain explicit safeguards. The full permitted reversal
and cross-day behavior are blocked only on the two recorded policy questions.
M03/M05/M07/M10/M12 implementation has not begun.

Client ownership flags/linked-owner changes remain locked until M05 to prevent
concurrent ownership changes from bypassing the progress safeguard.
