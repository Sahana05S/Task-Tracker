# M10 — Google Drive and work-file automation

Status: real integration and credential setup deferred by user; independent code/tests retained.
No provider completion or real Google verification is claimed. Manual links remain available.
Required predecessors: M01, M02, M04, M09; D11 business choices are approved; technical identity setup and live verification are now explicitly deferred.

The 13 October M10 request authorizes the independent implementation in forward26. The subsequent three replies approve the sandbox
phase enforced by forward27 and the fixed runtime approval contract.
See [evidence](M10-evidence.md), [configuration](M10-configuration.md) and
[menu coverage](M10-menu-coverage.md). Live database policy remains NULL and worker disabled; the pending configuration
records the approved root/choices without inventing missing identities.
The original acceptance checkboxes below require real provider verification;
mock/disposable checks are recorded separately and do not check them off.

## Outcome

Replace URL-only substitutes with real folder creation, template copying, file creation, rename, carryover shortcuts and approved reviewer access.

## Existing code and confirmed problems

Current createWorkFileLinkAction inserts task_links; renameTaskFolderLinkAction changes link text. Supplied scripts use DriveApp createFolder/makeCopy/createShortcut and recursively copy template folders. Supporting helper bodies are incomplete.

## Implementation steps

1. Confirm organization account/root/template IDs, supported file kinds and ownership model. Implement server-side OAuth/service integration appropriate to the actual Drive environment, with minimum scopes and secure refresh-token storage.
2. Build a provider adapter and durable outbox worker. Separate native database transactions from provider side effects; persist job state, provider IDs, retries and actionable failures.
3. Implement employee/task folder structure and Input/Process/Output template trees with tag/title substitutions. Reuse existing provider IDs on replay; do not rely solely on folder names as identity.
4. Implement supported template copy and blank-file creation for Docs/Sheets/Slides/Drawings/Forms/other requested types. Verify API support and permissions for each; mark unsupported kinds instead of generating fake URLs.
5. Rename actual provider objects and update app links after verified success. Create carryover shortcuts and reviewer access using the agreed permission mapping; record sharing failures independently.
6. Treat native checklist versus external checklist copy authority explicitly. If two-way sync is wanted, define conflict/version rules in a separate accepted contract before implementing it.
7. Support reconnection, revoked credentials, quota limits, partial template copies and resumable retries. Reconciliation identifies orphan jobs/assets and offers safe recovery without automatic destructive cleanup.

## Data and interface contract

ProviderAsset stores external ID, parent IDs, kind, template version, task association and current verified link. Job states: queued/running/succeeded/failed/retryable with attempt history and idempotency key. Service credentials never reach clients or logs.

## Acceptance and verification

- [ ] Creating a task folder produces an actual Drive folder in the agreed root, not only a DB link.
- [ ] Template tree content/names and work-file kinds match accepted script behavior.
- [ ] Replaying a failed job does not duplicate folders/files or unexpectedly broaden sharing.
- [ ] Rename changes the actual folder name; provider failure does not produce a false success label.
- [ ] Revoked OAuth, quota and partial copy failures have visible recovery paths.
- [ ] Reviewer permissions match the approved matrix and native tasks remain usable during provider outage.

## UI / workflow integration

Keep manual Add Link as its own useful feature. Label real Create File/Create Folder actions correctly, and show pending/failed/succeeded jobs plus reconnect/retry controls.

## Scope boundaries

Do not hardcode source script folder IDs as universal defaults or assume Google login automatically grants Drive scopes. No credential or account-permission changes are performed by this plan itself.

## Decisions and rollout

D11 is a real integration blocker. Confirm current provider API behavior from official documentation during implementation. Test in a sandbox root before production configuration; core scoring release may proceed with this track explicitly deferred.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.


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
