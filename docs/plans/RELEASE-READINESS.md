# Release readiness — 13 October 2026

## Signed-in hosted-test smoke — 14 October 2026

The isolated test project now passes real Auth/API checks and a temporary local
app's signed-in desktop task/detail/checklist/dashboard/reports rendering plus
mobile-width task-list rendering. A strict hosted DB clock boundary exposed two
near-now live-source failures; a ten-second default as-of lag and reuse of the
selected as-of corrected them. Full suite 472/472, typecheck, production build
and the final hosted browser smoke passed. See [M13 evidence](M13-evidence.md).
This remains **partial** browser and API acceptance: delivered workers,
timer/reversal/Done/Task Tools/full attendance-support/award/archive flows,
hosted legacy upgrade/restore and exact deployable revision are still open.
Production authorization remains **No**. The 13 October readiness wording below
is a historical baseline where it says no native browser check had run.

## Hosted test update — 13 October 2026

The separate `TaskPulse M13 Test` project (`ngpmwzksekkpvrgoqngk`) was
confirmed distinct from the existing app project before installing local
migrations 01–29. Seven synthetic Auth users and bounded task/log/checklist/
attendance/fact records passed real GoTrue/PostgREST role, allowed-command and
denial checks. See [M13 evidence](M13-evidence.md) and the rerunnable
`tools/test_m13_hosted_auth.py` harness. The matrix below now marks partial
native evidence for M01/M02/M04/M05/M06/M12. Other native module flows, signed-in desktop/mobile
UI, delivered workers, hosted upgrade/recovery and exact app revision remain
unverified. Production readiness is still **No**. The app's existing local
project link and environment file remain unchanged, and the existing project
was untouched.

**Decision: not ready for production authorization.** Core tracker commands and
views are implemented and locally tested, but native Supabase authorization,
signed-in browser workflows, and delivery of enabled workers have not been
verified. Complete ten-factor scoring and certified awards additionally require
the missing sales mapping and historical provenance. Drive automation is an
accepted, separately deferred scope; manual asset links remain available.

This assessment is for `main` at `7764489ac6bcc13f0062e67b401c7c9738f5848b`
**plus an uncommitted working tree**. It is not a deployable revision identifier.
The local migration sequence is 01–29; the checksum of local migration 29 is
`59B9CA142E0FB3C480090C2E623F7E7EC5EB6557FC4B63F82E704BF5064C58D8`.
Neither the linked Supabase project's migration ledger nor the live app revision
was inspected or assumed to match this workspace.

## Evidence matrix

“PG” means disposable PostgreSQL with a **JWT-subject/role shim**, not GoTrue,
PostgREST, a signed-in client or production grants. Unit coverage likewise does
not certify a browser workflow. Each earlier module's exact cases are in its
linked evidence file; M13 reran the latest integrated 01–29 harness.

| Scope | Implemented | Unit-tested | PG shim | Native Supabase/API | Signed-in browser | Worker delivery | State |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [M00 rule/source baseline](M00-evidence.md) | Rules/fixtures | Fixture consistency only | N/A | No | No | N/A | Source gaps remain |
| [M01 schema/permissions](M01-evidence.md) | Yes | Yes | Yes | Partial | No | N/A | Native role/column/relationship checks passed; full matrix pending |
| [M02 logs/timers](M02-evidence.md) | Yes | Yes | Yes | Partial | No | N/A | Native log/retry passed; timers/corrections pending |
| [M03 lifecycle/scale](M03-evidence.md) | Yes | Yes | Yes | No | No | N/A | Legacy reconciliation remains |
| [M04 details/templates](M04-evidence.md) | Yes | Yes | Yes | Partial | Partial | N/A | Native creation and signed-in task detail passed; template workflows pending |
| [M05 checklists](M05-evidence.md) | Yes | Yes | Yes | Partial | Partial | N/A | Native nested/N/A and signed-in render passed; Done/linked work pending |
| [M06 attendance/support](M06-evidence.md) | Yes | Yes | Yes | Partial | No | N/A | Native attendance/fact review passed; other modes and source gaps pending |
| [M07 ten factors](M07-evidence.md) | Yes, guarded missing inputs | Yes | Yes | No | No | Recompute lease tested in PG only | Certification blocked |
| [M08 awards](M08-evidence.md) | Yes, guarded missing inputs | Yes | Yes | No | No | Test endpoint/mocks, no delivered schedule | Certification blocked |
| [M09 Task Tools](M09-evidence.md) | Yes; import deferred | Yes | Yes | No | No | N/A | Native flow pending |
| [M10 Drive](M10-evidence.md) | Gated adapter; manual links | Mock/guard tests | Yes | No | No | No real provider call | **Deferred by user** |
| [M11 views/reports](M11-evidence.md) | Yes | Yes | Yes | Partial | Partial | N/A | Native live context and desktop dashboard/reports render passed; cross-surface parity pending |
| [M12 archives](M12-evidence.md) | Yes; incomplete close | Yes | Yes | Partial | No | No current M07/M08 delivered run | Native member denial passed; archive flow pending |
| M13 integration | Readiness/CI/recovery preparation | Integrated regression | Fresh+upgrade+restore | Partial | Partial | No | Acceptance incomplete |

## Release scopes

| Scope | Assessment | Gate before production authorization |
| --- | --- | --- |
| Core operations: tasks, details, checklist, logs, attendance, support, tools, live/incomplete reporting and non-certified archives | **Not ready** for production. Local behavior is implemented, but the actual auth/API/browser/upgrade destination is unverified. | Isolated native Supabase with synthetic users, direct protected-write denials, signed-in desktop/mobile scenarios, staging migration and restore, then explicit release review. |
| Complete ten-factor ranking, daily/monthly awards and certified archives | **Blocked**. Known factors can be shown with unavailable reasons; final score/winner must stay unavailable. | Authoritative BN/BO/BP mapping, source-date/validation and historical ownership/status evidence; independent complete synthetic score/award/archive path; native worker delivery and replay. |
| Drive automation | **Deferred by user**. Manual links are available and provider operations remain disabled. | Explicit future resume, secure sandbox identity/configuration and provider-native tests. It is excluded from the core gate. |
| Historical workbook import | **Deferred by user**. | Separate approved source mapping and provenance plan. |

## Source and coverage blockers

Read-only reinspection of the supplied 55-sheet tracker (SHA-256
`753fc56a32b586e17bc13bacdeec384e13dcc3321aaef6638cee2129d257ec2c`)
found blank `B_Summary & Analysis!BN1/BO1`, no `BN6/BO6/BP6` input formulas,
`BP1 = Sales Score Median`, `BP2 = MEDIAN(BQ6:BQ51)`, and
`BQ6 = CALC_IF_NEMP(BM6:BM51,(BO6:BO51*1.5 + BN6:BN51*1 + BP6:BP51*0.75)/50)`.
The sales log's build-up area/new-project/basement-payment labels do not prove
which raw fields, aggregation, unit, ownership, date or validation state supply
BN, BO and BP. In particular, BP2 is a median label/formula, not proof of BP's
per-person subtotal. The sample checklist workbook is present with its recorded
SHA-256 `51d17e074a4e10e169450de9d5b9447fa277226bc0d4b5967c005839d0d30526`.

For older rows, source owner, assignment/share/scale versions, business dates,
review state and as-of history cannot be reconstructed from a current row or
old snapshot alone. The external attendance source, original Summary subtotal
definitions, 22 menu-handler bodies and referenced provider templates/trigger
configuration remain missing. [SOURCES](SOURCES.md) lists each class; the
[M09 menu ledger](M09-menu-coverage.md), [M10 provider ledger](M10-menu-coverage.md)
and [M11 view ledger](M11-view-coverage.md) distinguish approved native
replacement, missing source semantics and accepted deferral. These are coverage
maps, not signed-in acceptance results.

## Native acceptance fixture and gate

Use the [synthetic scenario](fixtures/m13-native-scenario.json) to seed **only an
identified disposable native project** with synthetic director,
engineer, data manager, assigned reviewer, two active members and one inactive
member. Use a shared task with 50/50 shares, one nested Activity checklist with
Yes/No/N/A leaves and confirmed empty Setup, a dated midnight timer, corrected
and reversed logs, measured attendance/off-hours, independently reviewed
fact/idea/suggestion, all eight support modes, carryover, daily run/override,
and two retained month revisions. Keep a second task outside each actor's scope
for direct cross-task write attempts. Use synthetic sales values **only in a
fixture adapter clearly separated from real field mapping**; they cannot make
real data certified. Record source IDs, expected exact values, test token role,
API response, browser observation, worker job ID and migration ledger per case.

The gate is failed until native tokens prove allowed and denied writes, inactive
and anonymous restrictions, self-review and role escalation denials, employee
detail/export scoping and director-only awards/archive changes. Repeat the
workflow at desktop/mobile widths with keyboard controls, reloads, conflict and
error recovery. Reconcile each visible factor with the literal cases in
[ACCEPTANCE](ACCEPTANCE.md), including 0.00625 employee productivity, fractional
loading, the 10.10 ten-term vector and missing-sales unavailability.

## Resolved handling and missing source evidence

1. **BN, BO and BP:** the user approved keeping sales/final score/ranking/
   certified award Unavailable and will supply the source definitions later.
   We still need the original formulas/headers or a field mapping with units,
   aggregation, ownership, business date and validation status. A basement
   payment label is not proof of a particular column's meaning.
2. **Older records:** the user approved retaining non-certified status for
   missing task share/scale, contribution owner/review, business date and
   attendance/award history. A dated source export or record-by-record
   reconciliation is needed before any affected historical input is certified.
   For example, a September sale without a reviewer record remains unvalidated
   for certification rather than being assumed approved.

These source gaps do not delay the separate native core-operation verification.
The separate disposable native project and synthetic accounts now exist.
Remaining core acceptance requires the untested native workflows and signed-in
browser checks; the app's original link has not been reclassified as safe.
