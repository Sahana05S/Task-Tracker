# files

## What it does
Company files in the Google Shared Drive "TaskPulse Files" (go-live Part F,
2 November 2026). Other modules keep their records and permission rules; this
module moves their stored files from the Supabase storage inbox into the drive,
sends released files to the drive's trash and serves every view after a
permission check. Nothing in the drive is shared with staff: the app works as
the service account, and only the managing director (and anyone added as a
drive member) can browse the drive directly. Check-in photos stay in Supabase.

How a file travels: the browser uploads to Supabase storage through a signed
link (no request size limit), the owning module's command records it, then
`scheduleDriveMove` moves it after the response: folders by app property, a
resumable upload, `file_move_finish` records the Drive id, and only then is the
storage copy deleted. A failed step leaves the file in storage, still viewable,
and it is retried when the next file moves or the managing director opens
Reports > Data checks (up to 8 tries, spaced out).

Folders: `Personal documents/<Employee ID> - <Name>/<Kind> - <file name>`
(bucket `personal-documents`, personnel module) and
`Proofs/<YYYY-MM>/<Task tag> - <Title>/<file name>` (bucket `mission-proofs`,
tasks module, migration 101; the month the mission is assigned in) and
`Proofs/<YYYY-MM>/Sales/<date> - <client> - <salesperson>/<file name>` (bucket
`sales-proofs`, support module, migration 102). `components/proof-files.tsx`
(`ProofFiles`) is the shared add/open/remove list; `client.ts` has the shared
proof file rules (`proofFileProblem`, `proofMimeType`, `PROOF_ACCEPT`, 25 MB)
and `uploadToSignedLink`.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `handleFileView(request)` for `app/api/files/route.ts`; `scheduleDriveMove(org, bucket, path)`, `scheduleDriveRelease(org, bucket, paths)` (run after the response with `after()`); `getFileStorageHealth()` (managing director); everything in `client.ts` |
| `client.ts` | `fileViewHref(bucket, path)`, `fileStorageLine(health)`, `FILE_BUCKETS`, `isFileBucket`, types `FileBucket`, `FileStorageHealth` |
| `components/file-storage-health.tsx` | `FileStorageHealthNotice`, the Data checks line |

## Private (`internal/`)
| File | Job |
|---|---|
| `google.ts` | Service account token and the Drive REST calls (folders, resumable upload, download, trash, drive check) |
| `move.ts` | Moves, retries, releases and the connection check, as the service role for one company |
| `view.ts` | `/api/files` handler: `file_access`, then stream from Drive or redirect to a one-minute storage link |
| `status.ts` | Data checks health (counts plus a live check) |
| `rules.ts` | Buckets, view links, the health line (pure) |

## Database it owns
Migration 100 (`100_drive_file_storage.sql`; 101 adds the `mission-proofs` bucket to `file_subject`, `file_access`, `file_move_pending` and `file_storage_status`):
- `taskpulse_private.file_storage` (the company's Shared Drive id, last check)
- `taskpulse_private.drive_files` (one row per stored file: pending, moved with its Drive id, trashed)
- `file_storage_configure(drive_id)` (managing director, audited), `file_storage_status()` (managing director), `file_access(bucket, path)` (every view)
- Service role only, one company per request (`x-taskpulse-organization`): `file_move_claim`, `file_move_finish`, `file_move_pending`, `file_release`, `file_storage_checked`, `file_storage_drive`

## Configuration
- Vercel secret `TASKPULSE_DRIVE_SERVICE_ACCOUNT_JSON`: the service account's JSON key (go-live F7). Never in the repository or chat.
- The Shared Drive id is stored per company by `file_storage_configure` (managing director). The service account must be a Content manager of that drive.
- Without the key or a connected drive, files simply stay in Supabase storage and Data checks says so.

## Depends on
`shared/supabase` (server and worker clients), `shared/session`. No other modules.
