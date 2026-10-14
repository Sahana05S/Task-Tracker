# M11 completion evidence — 13 October 2026

State: **Implemented awaiting verification**. Native authentication/API/browser
verification is outstanding; production rollout is not authorized.

## Authorization and preserved baseline

The user's M11 pasted request at attachment
`34591127-26fd-4817-96cf-8aef4b434367/Pasted text.txt` authorizes this module.
M10 real integration/credentials remain deferred by the user's explicit answer.
No M12, production migration, deployment, scheduling, provider operation or
historical redistribution was performed. Work starts from local main
`7764489ac6bcc13f0062e67b401c7c9738f5848b` plus existing M08–M10/user edits.

The pre/post preservation fixtures confirm 38 protected files: original
migrations 01–27, README, package/lock, public landing and milestones, M07 exact
engine/source contract, M08 calculation, M09 tool policy and Drive deferral.
Existing user changes were preserved. No dependency upgrade occurred.

## Implementation and source contract

`lib/presentation/` provides a single month/as-of model used by dashboard,
team/profile, timelines, reports and downloads. Scores and factor cohorts use
the unchanged M07 engine. M08 is the sole award selector; no chart winner or
report-specific score formula was added. Raw factors retain exact rationals;
factor displays/CSV use six decimals, final score two, M07 half-away rounding.
Unavailable required factors prevent a composite/ranking; the available-factor
subtotal is labelled partial. Failed source reads throw or return export 503.

Migration **28_live_presentation_and_report_context.sql** is a forward,
transactional migration after 27. It adds append-only prospective presentation
history for task content, links, dependencies and existing M05 section rollups.
No legacy dates/content are reconstructed; an explicit available-from boundary
protects earlier views. Records, frozen report payloads and business formulas
are not rewritten. History trigger writes roll back with the source transaction.

The read-only `live_presentation_context` RPC requires an active authenticated
actor. Explicit employee details require self or MD/PE. A general team member/DM
gets team metric aggregates plus own logs/contributions/attendance details;
managers get authorized team details. Anonymous, inactive, cross-employee and
DM other-employee requests are rejected in PostgreSQL. Private history/helper
access is revoked. Asset links to protected reports are filtered at the DB boundary.

M11's private aggregate adapter is generated from the installed M07 source
function, with only the canonical-month-only entry restriction removed. It
preserves M07 selection/calculation inputs and is inaccessible directly. The
M11 wrapper bounds the period to 62 days, forbids future as-of requests and
enforces actor/detail scope before dated aggregate reads. The original public
M07 permissions remain intact. A future source-contract migration must refresh
this derived adapter if that installed source function changes.

Employee charts use actual dated month-to-date source observations and preserve
missing gaps/measured zero. They do not divide scaled progress by task hours or
reconstruct historical loading from current tasks. Task productivity remains
percentage points/task-hour; employee productivity remains period-earned
credit/regular attendance-hour. Source context and provenance accompany dated
points. Shared captured credit reconciles rather than doubling team earnings.

Award source mismatches or later revisions have explicit unavailability reasons;
historical effective winners are not guessed from today's ledger. Frozen months
retain original awards. Live reports include readable effort/attendance tables,
rollup evidence, contributions, existing assets and retained award context.
JSON/text/CSV exports and text copy share this payload. The API checks active
authentication/detail scope and the RPC independently enforces it. CSV is
formula-escaped; responses use private/no-store headers. No messages are sent.
The dashboard displays retained snapshot counts with original-rule labels and
no longer presents the legacy recompute button. The pre-existing
`freezeMonthlySnapshot` Server Action was not rewritten in M11; its close/revise
contract needs M12 review before any month-close rollout.

See [view coverage](M11-view-coverage.md) for workbook-to-surface traceability.

## Actual verification

- Full regression: **466 tests / 52 files passed** (baseline 454 / 50).
- TypeScript: `npm run typecheck` passed.
- Production build: `npm run build` passed after the final runtime changes.
- Independent M11 tests cover shared exact result/context, all ten factors,
  unavailable sales/subtotal/ranking, shared-credit reconciliation, no invented
  trends/future points, export units/CSV injection, API denials/errors and
  server-rendered selectors/copy/download/link markup.
- Existing M08 nonwinner/measured-zero history tests pass. Legacy trend and
  fake-deadline assertions were replaced only where the confirmed M11 contract
  corrects them; unrelated regressions remain intact.
- `tools/test_m11_database.py`: fresh **01–28** and upgrade **01–27 → 28** on
  portable PostgreSQL 17, loopback 15432, dedicated disposable M11 databases.
  Seeded non-private tasks, 50/50 participants, 1 task hour, +20% at scale 10
  (1 captured unit each; team 2), 8 regular attendance hours, pending fact/idea,
  retained nonzero uncertified legacy award and missing sales/history.
  Own/manager allowed, DM/cross-employee/inactive/anonymous/private-helper denied,
  original M07 day-context restriction retained, immutable history, transaction
  rollback, unchanged retained reports, no future series and explicit old-history
  unavailability passed. Authentication uses the existing JWT-role shim.
- Preservation fixtures passed for 38 protected files.

## Unperformed checks and remaining sources

No suitable isolated signed-in Supabase/GoTrue/PostgREST browser environment is
available. Native token/session behavior, browser downloads/clipboard, desktop/
mobile layout, Recharts rendering/scrolling and actual keyboard interaction
remain unverified. Server-rendered markup/unit tests are not substitutes. No
production database was used to certify migrations or grants. No Drive call,
provider credential verification or worker delivery check was attempted.

Both reference XLSX files are present; missing source gaps are unchanged:
Summary BN/BO/BP sales field mapping, historical participant/scale/review evidence,
external attendance source, 22 missing legacy menu handler bodies, missing
TemplateDialog/BlankFilesDialog and provider registry/templates/trigger setup.
Those provider/template sources are not prerequisites for core M11. Unknown
sales/history blocks only dependent calculation/award certification.

No additional business decision is needed to finish the independent M11 work.
Rollout requires isolated native verification and explicit production authority;
M12 requires a separate module request. Migration 28 has only run in disposable
databases and should be reviewed with the complete ordered chain before any
authorized rollout. Frozen payloads must remain untouched.
