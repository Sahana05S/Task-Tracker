# M10 evidence - 13 October 2026

**Real integration and credential setup deferred by user. Independent code/tests retained; provider completion is not claimed.**

The three subsequent replies approve D11 business choices; see the current
follow-up below. Earlier proposal/count/setup statements describe the baseline.
The user's pasted M10 request authorizes independent implementation and
disposable testing. It supersedes earlier no-M10/no-Drive module boundaries;
production migrations/deployment/workers/sharing remain unauthorized. Local
main is at `7764489ac6bcc13f0062e67b401c7c9738f5848b` with preserved pre-existing
M08/M09/user edits. No real Google calls, production changes, M11 or commits.

## Implemented independently

Forward `26_drive_outbox_and_verified_assets.sql` adds secret-free NULL policy,
request/manifest/identity/evidence sidecars and narrow commands around the
**existing outbox_jobs**. It does not create a parallel job queue. Migrations
01-25 are unchanged. Atomic native initialization/request creation shares M04
initialization hooks. Configuration absent/failed providers do not prevent
native task use. No scoring/award/carryover formula or historical import change.

Typed server provider uses actual Drive v3 create/copy/update/permissions APIs,
server token exchange, principal/root checks and bounded recursive manifests.
Implemented operations: employee/task/IPO folders; configured template trees;
Docs/Sheets/Slides blank files; explicit Drawing/Form blank-template copies;
verified asset rename; lineage-backed predecessor shortcut; configured reviewer
comment access. Other blank types are unavailable. Actual side effects remain
**mock-tested, not provider-verified**. See [configuration and official API
references](M10-configuration.md) and [script/workflow gaps](M10-menu-coverage.md).

UI retains Add Existing Link and adds separate provider create/copy/rename/
shortcut controls, per-job state/attempts, verified links, actionable failures,
retained retry and secure reconnect instructions. Unconfigured controls are
disabled. Provider-managed links reject the old label-only rename command.
Stored names/URLs appear only after verified remote metadata, never synthesized.
No embedded OAuth consent/Picker or generic legacy-URL adoption is implemented.

## Permission, retries and retained history

Active MD/PE actors queue/retry structural commands; inactive/member/reviewer/
DM/anonymous protected commands are denied at the database boundary. Narrow
service RPCs enforce live job/resource leases, active original manager, current
task/participant/reviewer context, policy equality and archive guards. Only
approved individual commenter access on new files is available; no folder/
shortcut/predecessor/public/domain/owner sharing. Emails come from approved
configuration, never mutable profile fields. Notifications are suppressed.

Folder reservations and atomic appProperties markers retain remote identity.
Missing dispatched native results block for reconciliation rather than repeat
creation. Verified partial copies survive failures; sharing retry does not
recreate files. Quota/provider/busy failures wait five minutes; explicit missing,
revoked, changed, denied or uncertain evidence remains blocked. Local completion
has a same-lease/outcome replay receipt. No automatic deletion/uncertainty reset.
Source template versions are captured and checked; an edit blocks that manifest.

## Verification

- Focused Drive tests: 3 files / 31 tests passed; regression: 47 files / 427
  tests passed, including 37 Drive cases after separate five-kind MIME/operation
  fixtures and an unsupported-kind guard were added. They cover remote success/lost response, hidden markers/no repeat,
  folder-ID recovery, marker/parent conflicts, remote rename, pinned source,
  shortcut target, sharing isolation/conflicts, quota/revocation, credential
  boundary, partial manifest recovery and native URL absence.
- `npm run typecheck` passed; production build passed with the Drive route.
- Disposable PostgreSQL fresh 01-26 and upgrade 01-25 -> 26 passed under the
  M09 JWT-role shim: manager versus forbidden actors, direct private-write denial,
  version/replay conflicts, native/request rollback injection, safe verified
  metadata, legacy-label guard, concurrent claims/resource fencing, failure
  retention, shared manual/auto request, archive denial and frozen snapshot
  preservation. The harness is `tools/test_m10_database.py`, loopback only.
- Final preservation comparison and verification artifact are recorded in
  `fixtures/m10-verification-summary.json`; the before-map records 01-25,
  README, landing, dependencies, scoring sources, M09 contract and final QA.

These checks certify neither deployed grants nor Google behavior. Native
Supabase/GoTrue/PostgREST authorization, signed-in browser/API flows, actual
Shared Drive/OAuth authorization and all real provider side effects/failure
injections remain **unperformed**. No configured sandbox root or credentials
were supplied; existing app Google login is not accepted as Drive consent.

## Baseline missing reference/setup and handoff (before replies)

Missing: TemplateDialog/BlankFilesDialog HTML, actual Templates Info registry/
template trees, configured blank Drawing/Form assets, reviewer/helper bodies,
original folder-depth mapping and sandbox Cloud/account/root authorization.
The two original XLSX references and supplied scripts remain available; no
additional workbook analysis or guessed missing helper content was required.
Missing sales mapping remains a scoring-certification limitation, not a Drive
implementation blocker.

D11 still needs three bounded responses: ownership/auth/scope; sandbox root and
template configuration with layout/file kinds; native checklist authority and
reviewer access mapping. Recommended starting policy: organization Shared Drive
with dedicated restricted identity if available, explicit employee/task/IPO
paths, Docs/Sheets/Slides, manual initialization until tested, native canonical
checklists and mapped commenter access on new files. These are proposals;
**none are activated or recorded as user approval**.

Review/apply forward26 in an authorized sandbox, provision approved secrets and
policy, then run read-only account/root/template verification followed by real
sandbox workflow/failure tests. Worker remains disabled until that setup is
explicitly approved. Carryover requires a verified predecessor folder; arbitrary
legacy URLs are not automatically adopted. Changed contexts/policies and the
unavoidable remote/local transaction gap require administrator evidence review.
See recovery procedure in M10-configuration. Do not deploy or start M11.

## Approved follow-up implementation and current verification

The user's exact replies settle the initial D11 policy: dedicated Shared Drive
service account, sole supplied sandbox root, employee/task/IPO layout, no
initial templates, Docs/Sheets/Slides, manual initialization until sandbox success,
native canonical checklists and mapped commenters on new files without emails.
Drawing/Form are user-deferred. Account identity/credentials/mapping are technical
setup still missing; the supplied folder's actual Shared Drive membership is
unverified.

New forward27_approved_drive_sandbox_boundary.sql adds a NULL-safe exact policy
constraint. It rejects other roots, OAuth/other scope, automatic mode, templates,
extra kinds, changed paths, authority or sharing choices. It does not rewrite26,
install credentials, change existing business data or activate a worker. An
incompatible previous configuration causes upgrade to fail without replacement.
Runtime uses the same accepted profile. Before create/rename/share, the adapter
checks live ancestry; shortcut targets must also be in the sandbox. Assets moved
outside the root cannot be modified. No predecessor or root ACL is changed.

The new token-protected GET setup check verifies the selected service principal
and pinned root read-only, discovers actual driveId/accountScope, and requires no
mutating worker enablement or database access. It exposes safe failure codes
rather than secrets. Missing identities stay null in the pending JSON; no source
IDs or personal accounts are substituted. Template-copy UI is disabled for the
no-template phase; automatic code remains present and disabled.

Current focused/regression/build/typecheck/database totals are recorded in
fixtures/m10-approved-verification-summary.json. Fresh01-27 and upgrade01-26->27
passed policy rejection/manual replay/role/retained-report checks. Current
mock tests cover moved destination/rename/sharing/shortcut targets and read-only
root bootstrap in addition to prior recovery cases. No live Google check was
performed: secure service-account credentials/email and reviewer mapping are
missing. Production, M11 and earlier formula/module policies remain unchanged.

Current follow-up results: focused5 files/59 tests passed; the final regression49
files/451 tests includes all61 Drive cases (including two added setup-endpoint
checks). TypeScript and production build passed. Fresh01-27 and upgrade01-26->27
portable PostgreSQL passed. Preservation checks confirm the earlier32 protected
files plus migration26 are unchanged. No Drive credential/pin/token/enable variable
names are present in process or .env.local. No real provider request was made.


## M10 live integration deferred by user - 13 October 2026

The user explicitly said "Defer real Google Drive integration and credential
setup for now." Manual asset links remain available. Provider workers, setup
diagnostics, create/copy/rename/shortcut/sharing requests and retries are unavailable
under the current explicit runtime deferral, even if sandbox environment flags
are supplied. No credentials or mappings are requested during this deferral.
Automatic initialization code is retained but provider operations stay disabled.
Native details, checklists, execution, scoring, awards and reports do not depend
on Drive credentials. This supersedes earlier requests to provision/test now.

M10's independent code and tests are documented; actual Google side effects,
account/root/Shared Drive verification, real failure trials and provider-backed
browser flows are deferred and unverified. This is not provider completion.
Approved sandbox/ownership/layout/authority/sharing choices remain recorded for
an explicit future resume. No credentials, schedules, real Drive changes,
production apply/deploy or migration rewriting occurred. M11 is the next planned
module; this handoff does not implement it, and Drive is not a prerequisite.

### Deferral boundary and current checks

lib/integrations/drive/availability.ts records the explicit current deferral.
The worker/setup endpoints and provider server action fail closed before creating
clients, authenticating Google or queuing jobs. Environment enable flags cannot
override it. Provider UI hides creation/retry/reconnection controls, displays
unavailable clearly and retains historical job/asset evidence. Native task pages
and workflow coverage use the same deferred terminology; Add Existing Link is
unchanged. Migrations26-27 and prior numerical/module contracts are unchanged.
No SQL changes require a new database run; previously recorded fresh/upgrade
01-27 results remain historical passing evidence, not re-run claims.

Current focused/regression/typecheck/build/preservation results are in
fixtures/m10-deferred-verification-summary.json. Boundary cases test both GET
and POST with a valid token plus sandbox flags and prove zero database/provider
calls, and prove the provider server action cannot queue work. Earlier auth tests
use an explicit non-deferred mock solely to retain future authorization coverage.
That test mock never changes the default runtime gate or enables a worker.

Live account/root verification, actual folder/file/copy/rename/shortcut/sharing,
Google quota/revocation/timeout/partial-failure recovery, deployed native auth/API
and signed-in provider/browser tests were not performed. Actual Drive validation
is deferred by user; native authentication limitations remain independently
recorded. Missing source dialogs/helper/template content is not invented; initial
no-template/Drawing/Form deferrals and core sales limitations remain distinct.
M10 is handed off without asking more setup questions. M11 remains unstarted.

Current deferral verification: focused6 files/64 tests; regression50 files/454
tests; TypeScript, production build and diff check passed. Prior32 protected
files and migrations26-27 remain unchanged. No database tests were re-run because
no SQL changed. No live Google or native browser/auth check ran; no production
changes or M11 implementation occurred. The core tracker is independent of this
explicitly deferred provider scope.
