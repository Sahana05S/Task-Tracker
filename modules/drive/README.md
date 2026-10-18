# drive

## What it does
Google Drive integration for task work files: a durable outbox of Drive jobs
(create, copy, rename, shortcut, reviewer sharing) run by a server worker inside
the approved M10 sandbox folder.

**Live Google Drive is deferred by the user** (13 October 2026, see AGENTS.md
"M10 live integration deferred by user"). `internal/availability.ts` sets
`DRIVE_INTEGRATION_DEFERRED = true`: the server action, the worker run and the
setup diagnostic all return "unavailable" before touching profiles, the database
or Google, even when sandbox environment flags are set. Resuming needs an
explicit user request. No credentials are stored here; secrets come only from
the server environment. Manual asset links remain available elsewhere.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `handleDriveSetupCheck(request)`, `handleDriveWorkerRun(request)` for `app/api/internal/drive/route.ts` (GET = read-only setup check, POST = run one job); `getDriveReadModel()` for Task Tools |
| `actions.ts` | `requestDriveOperation(form)` — queues a Drive job via `drive_command` (blocked while deferred) |
| `client.ts` | `FAILURE_HELP`, `FailureCode`, `DRIVE_INTEGRATION_DEFERRED`, `DRIVE_UNAVAILABLE_MESSAGE` |
| `components/` | `DriveOperations` (Task Tools Drive jobs panel; live Drive deferred) |

## Private (`internal/`)
| File | Job |
|---|---|
| `availability.ts` | The user's deferral switch and unavailable message |
| `contract.ts` | Policy/job/step types, policy validation, failure codes and help text |
| `approved-sandbox.json` / `.ts` | The exact user-approved sandbox policy (secret-free) and its check |
| `auth.ts` | Server-only Google token exchange from environment secrets |
| `provider.ts` | Google Drive REST client, idempotent step execution, reviewer sharing |
| `plan.ts` | Builds the folder/file step plan for a job |
| `jobs.ts` | Claims and runs jobs with checkpoints (one company per job, migration 40) |
| `setup.ts` | Read-only sandbox access verification |
| `worker.ts` | Worker endpoint: token check, setup check and job run |
| `input.ts` | Parse the operation form |
| `commands.ts` | `drive_command` RPC call |
| `cache.ts` | Revalidates Task Tools and task pages |

## Database it owns
- Tables (private schema): `taskpulse_private.drive_configuration`,
  `drive_requests`, `drive_assets`, `drive_events` — migration 26; sandbox
  boundary in 27; company scoping in 40.
- RPCs: `drive_command`, `claim_drive_jobs`, `drive_job_context`,
  `drive_job_plan`, `drive_asset_checkpoint`, `finish_drive_job`,
  `drive_read_model`; private helpers `taskpulse_private.enqueue_drive`,
  `drive_lease` — migration 26 (27 and 40 amend them).
- `drive_read_model` is still called directly by
  `app/(workspace)/task-tools/page.tsx` until the tasks module absorbs it.

## Depends on
`shared/supabase` (server and worker clients), `shared/session`, `types/`. No
other modules.
