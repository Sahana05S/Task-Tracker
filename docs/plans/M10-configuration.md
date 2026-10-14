# M10 sandbox configuration and recovery

Current state: **real integration and credential setup are deferred by user**.
The setup/verification procedures below are retained for a future explicit resume;
do not execute them or ask for credentials now. The runtime deferral gate blocks
GET diagnostics, POST workers and provider server-action requests before database
or Google access, even with sandbox environment flags. Automatic Drive operations
are visibly unavailable; manual links and native tracker features remain usable.


The user's three replies approve the initial sandbox phase in DECISIONS. The
only destination root is [the supplied sandbox folder](https://drive.google.com/drive/folders/13G0w_T5i6cKUMiREETYlpH9Z_3G-RyGH).
No templates; Docs/Sheets/Slides only; native checklists canonical; mapped
commenter access on new files without notifications. Paths are
`[Employee ID]/[Task Tag] - [Task Title]/{Input,Process,Output}`. Manual testing
is approved; automatic provider initialization remains disabled until sandbox
checks pass. Existing business folders and their permissions are outside scope.

`lib/integrations/drive/approved-sandbox.json` records those accepted fields.
`fixtures/m10-approved-sandbox.pending.json` deliberately leaves accountScope,
organizationEmail and sharedDriveId null, so it fails validation and cannot be
used as live configuration. Reviewer emails are not inferred. Forward27 and the
runtime policy guard reject choices outside this accepted phase. The live policy
and worker remain disabled; no production setup is authorized.

## Account and least privilege

The approved method is an organization-owned Shared Drive with a dedicated
service identity. OAuth support remains available as prior adapter capability,
but is outside this selected policy. A service account
cannot own ordinary My Drive files; Shared Drive ownership belongs to the
organization. See [Google Shared Drive guidance](https://developers.google.com/workspace/drive/api/guides/about-shareddrives).

The selected recommended service-identity setup uses explicit `drive` scope.
Its Drive access must be provisioned only for the approved sandbox. `drive.file` covers app-created or explicitly selected
resources; it does not grant arbitrary template-tree access. This implementation
has no Picker/consent UI. Provision selected resources through approved Google
authorization, or explicitly approve `drive` for a dedicated identity with access
limited to the sandbox Shared Drive. Never silently upgrade an OAuth grant. The
token principal must match the configured email; an OAuth refresh response with
missing, broader or mismatched Drive scope is rejected. See
[Google scope guidance](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Enable the Google Drive API in the approved Cloud project. For service identity,
place its JSON key only in `TASKPULSE_DRIVE_SERVICE_ACCOUNT_JSON` in the server
secret store and pin its non-secret email in `TASKPULSE_DRIVE_SERVICE_ACCOUNT_EMAIL`. For OAuth, authorize offline access securely with the approved
scope and store `TASKPULSE_DRIVE_OAUTH_CLIENT_ID`,
`TASKPULSE_DRIVE_OAUTH_CLIENT_SECRET`, and
`TASKPULSE_DRIVE_OAUTH_REFRESH_TOKEN` there. Refresh exchange uses Google's fixed
HTTPS token endpoint. Rotation/reconnection is an administrator secret-store
procedure; the UI does not pretend app Google sign-in reconnects Drive.
No credentials go into SQL, task/job payloads, chat, fixtures or browser code.

## Explicit policy

An administrator reviews a secret-free JSON object matching `DrivePolicy` in
`lib/integrations/drive/contract.ts`, then applies it **only to a disposable or
authorized sandbox database** through owner privileges on
`taskpulse_private.drive_configuration`. There is no browser configuration RPC.
The worker validates it before provider calls. Unknown fields are rejected.

| Field | Required meaning |
| --- | --- |
| id / sandbox / accountScope | Approved policy version, literal true, stable account-and-Cloud-project identity for operation markers. Changing client/project can hide private appProperties and requires reconciliation. |
| auth / scope / organizationEmail | Explicit supported account method, exact approved `drive.file` or `drive`, pinned principal email. |
| rootId / sharedDriveId | Sandbox folder ID and Shared Drive ID, or explicit null for OAuth My Drive. Remote folder, drive identity and add-child capability are checked. |
| employeeName / taskName | Explicit name patterns. `[Employee ID]`, `[Task Tag]`, `[Task Title]` substitute literal values. Employee names cannot depend on a task. Names never identify replayed assets. |
| roleFolders | Three explicit path arrays for input/process/output. Approved layout is Input, Process, Output directly under the task folder. Source scripts' inconsistent depth is not guessed. |
| templates | Named registry entries: label, ID, actual source version, MIME type, destination role; optional blankKind drawing/form. No source registry is assumed. |
| initializeTemplates | Explicit registry keys to recursively copy during initialization; empty is an explicit no-template choice. |
| blankKinds | Explicit subset of document/sheet/slides/drawing/form. Drawing/Form each need one matching configured blank template. |
| autoInitialize | Explicit true/false. Approved false until sandbox verification. If approved true, both M04 paths use the same stable initialization request. |
| checklistAuthority | Native is now approved. External checklist copies are assets. External authority or two-way sync requires another accepted contract. |
| reviewerSharing / reviewerEmails | The approved phase uses commenter_files, with an approved user-UUID to Google-email map. Mutable employee profile emails are never used to grant access. |

Only active MD/PE actors queue/retry these structural task operations. A worker
rechecks the requesting manager, current primary assignee/tag/title/reviewer set,
active reviewers, policy equality, task archive state and job/resource leases
before checkpointing dispatch. Reviewer sharing only targets new copied/created
files, never folders, shortcuts, existing manual links or archived targets.
It adds individual commenter access with notifications suppressed. Existing
stronger access is a conflict, never silently changed. Parent/inherited access
remains relevant: ignoring domain-default visibility does not remove inheritance.
See [files.copy](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/copy)
and [permissions.create](https://developers.google.com/workspace/drive/api/reference/rest/v3/permissions/create).

## Worker and sandbox verification

Leave `TASKPULSE_DRIVE_WORKER_ENABLED` unset until policy/auth/root validation is
approved. Delivery also requires a server-only `TASKPULSE_DRIVE_WORKER_TOKEN`
and the existing service-role database secret. `POST /api/internal/drive`
accepts the worker token only when enabled is exactly `sandbox`; there is no
production mode or installed schedule. Process one bounded job per delivery.
External calls happen between database transactions, never inside one.

After secure identity setup: validate the principal/root read-only; no template
verification is needed for this no-template phase. Then
queue a native sandbox task manually, and verify the actual folder tree, URLs,
Docs/Sheets/Slides blank files, rename, reviewer access and a carryover shortcut
whose predecessor is also in this sandbox. Template copying and Drawing/Form
trials are user-deferred and are not prerequisites for this initial phase. Inject
quota/revocation/timeout/partial failure and verify retained recovery under
multiple workers. Run signed-in manager/member/inactive/anonymous API/browser
checks against native Supabase grants. These checks have **not run**.

## Read-only account/root bootstrap

Set the service-account JSON, pinned service email and worker token in server
secrets. Keep `TASKPULSE_DRIVE_WORKER_ENABLED` unset. Authenticated
`GET /api/internal/drive` uses only about.get and files.get for the pinned root;
it neither touches the database nor creates, renames, copies or shares anything.
Its verified_root response supplies the actual Shared Drive ID, principal and
stable accountScope. Missing Shared Drive membership, wrong principal, wrong
folder identity, trash or unavailable add-child capability block the check.
Google's [File metadata](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
provides the driveId evidence; a folder URL is not that evidence.

Use those verified values plus approved employee/user-to-Google-email mappings
with completeApprovedSandboxPolicy. Match accountScope to this exact Cloud
project/service identity. Review/install the complete policy only in an authorized
sandbox database after27; never install the pending null-identity fixture.
Only then enable sandbox delivery for manual test jobs. The UI disables template
copy selection because no templates are approved. Drawing/Form remain deferred.

Each operation now verifies the live parent chain before mutation. A moved
ancestor cannot permit creates/renames/sharing outside the approved root. A
carryover shortcut also requires its predecessor folder inside the same sandbox;
external business predecessors remain guarded. Automatic activation after
recorded sandbox success needs a compatible forward policy change; earlier
migrations and retained manifests are not rewritten.

## Retained recovery

Dispatch intent is committed before Google mutations. Folder IDs are generated
and reserved first. Most native Workspace files cannot use pre-generated IDs;
native copies/files/shortcuts use an appProperties marker atomically written
with creation. After lost responses, the worker reads the persisted ID or searches
that marker; if a dispatched native result is not visible, it blocks without
another POST. There is no automatic uncertain-asset deletion. See
[Google file creation](https://developers.google.com/workspace/drive/api/guides/create-file).

Quota/provider/resource-busy failures wait five minutes before automatic reclaim;
other failures need manager retry/reconciliation. Verified earlier files remain
in the manifest and visible after later copy/sharing failures. Retrying sharing
checks existing permissions rather than recopying the file. A template version
change blocks the pinned manifest; do not relist it into a different implicit
template version. Local finish receipts are replayable for the same lease/outcome.

Requests made with no policy can bind their first approved policy only while
there is no manifest/remote evidence. Subsequent policy/task-context changes
block; an administrator must inspect retained evidence before superseding a
request. General rebinding, adopting arbitrary legacy URLs as provider identities,
deleting or resetting uncertainty, and silently updating template versions are
not exposed as browser commands.

Carryover uses actual approved M09 lineage and a verified predecessor folder.
The shortcut inherits destination access and grants no target access; the worker
never changes the predecessor's ACL or native archived records. Existing
predecessors with only manual URLs show `predecessor_asset_missing` until an
administrator verifies their identity under the approved sandbox/account/root.
No automatic legacy-folder adoption is implemented. See
[Google shortcuts](https://developers.google.com/workspace/drive/api/guides/shortcuts).

Google and PostgreSQL cannot commit together. A native archive/context change
between a dispatch checkpoint and Google's response can leave an unlinked remote
asset. The next checkpoint refuses publication; retained markers/intent support
read-only reconciliation. This does not authorize cleanup or an archived write.

## Independently verified file APIs

| Kind | Implemented operation / authoritative evidence | Actual sandbox verification |
| --- | --- | --- |
| Folder | files.create with folder MIME, parent and reserved ID; [folder guide](https://developers.google.com/workspace/drive/api/guides/folder) | Outstanding |
| Docs | Metadata-only files.create; [Docs folder creation](https://developers.google.com/workspace/docs/api/how-tos/documents) | Outstanding |
| Sheets | Metadata-only files.create; [Sheets creation guide](https://developers.google.com/workspace/sheets/api/guides/create) | Outstanding |
| Slides | Metadata-only files.create; [Slides creation guide](https://developers.google.com/workspace/slides/api/samples/presentation) | Outstanding |
| Drawing / Form | Explicit configured blank-template files.copy, matching supplied script behavior; no blank-creation API claim | Outstanding; templates missing |
| Other | No blank creation; configured ordinary template files may use files.copy; unsupported source shortcuts are blocked | Outstanding |

## Secure provisioning checklist

1. Have the organization administrator provision the dedicated sandbox service
   account in the approved Cloud project and enable Google Drive API. Its access
   must stay within the authorized sandbox; no app command changes root/business
   folder permissions or Drive membership.
2. Put its credential JSON in the server secret store (or ignored local
   `.env.local` for development) as TASKPULSE_DRIVE_SERVICE_ACCOUNT_JSON, and pin
   the matching email as TASKPULSE_DRIVE_SERVICE_ACCOUNT_EMAIL. Never paste the
   JSON/key into chat or put it in the pending policy fixture.
3. Configure TASKPULSE_DRIVE_WORKER_TOKEN privately. Leave
   TASKPULSE_DRIVE_WORKER_ENABLED unset while running the protected GET diagnostic.
   That diagnostic requires no Supabase service secret or database mutation.
4. Supply approved reviewer employee/user-to-Google-email mappings, for example
   EMP4 -> reviewer@company.example. Resolve employee IDs to actual user UUIDs in
   the authorized test environment; do not substitute fixture UUIDs or profile
   email guesses. No mapping means no reviewer grant can succeed.
5. Use the verified root/account metadata to complete and review the policy in
   an authorized sandbox database after27. Then run manual jobs with sandbox
   delivery enabled. Preserve native/production separation and retained history.
