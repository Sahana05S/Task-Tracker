# M10 — Google Drive and work-file automation

Status: draft, not started. Required predecessors: M01, M02, M04, M09; D11 and provider setup.

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
