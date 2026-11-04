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
link (no request size limit; `shared/supabase/signed-upload.ts` reads the picked
file into memory first, because the Android app's WebView often cannot send a
file-chooser file itself and reported "Failed to fetch", and retries one network
failure), the owning module's command records it, then
`scheduleDriveMove` moves it after the response: folders by app property, a
resumable upload, `file_move_finish` records the Drive id, and only then is the
storage copy deleted. A failed step leaves the file in storage, still viewable,
and it is retried when the next file moves or the managing director opens
Reports > Data checks (up to 8 tries, spaced out).

Folders: `Personal documents/<Employee ID> - <Name>/<Kind> - <file name>`
(bucket `personal-documents`, personnel module) and
`Proofs/<YYYY-MM>/<Task tag> - <Title>/<file name>` (bucket `mission-proofs`,
tasks module, migration 101; the month the mission is assigned in) and
`Missions/<YYYY-MM>/<Task tag> - <Title>/{Input,Process,Output}/<file name>`
(the same bucket, a mission's Input / Process / Output documents by
`task_proofs.kind`, migration 113) and
`Proofs/<YYYY-MM>/Sales/<date> - <client> - <salesperson>/<file name>` (bucket
`sales-proofs`, support module, migration 102). `components/proof-files.tsx`
(`ProofFiles`) is the shared upload/open/remove list (sales proofs and each
group of a mission's Files panel; its wording is set by `label`, `addLabel`,
`noun` and `empty`, `items` adds other rows such as pasted links to the same
list, `children` a secondary option, and `driveReady` adds the honest storage
note from `fileStorageNote`); `client.ts` has the shared
proof file rules (`proofFileProblem`, `proofMimeType`, `PROOF_ACCEPT`, 25 MB)
and `uploadToSignedLink`.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `handleFileView(request)` for `app/api/files/route.ts`; `scheduleDriveMove(org, bucket, path)`, `scheduleDriveRelease(org, bucket, paths)` (run after the response with `after()`); `getFileStorageHealth()` (managing director; names the service account even before a drive is connected); `isFileStorageReady()` (any member: key set and a drive connected, for honest upload wording); everything in `client.ts` |
| `client.ts` | `fileViewHref(bucket, path)`, `fileStorageLine(health)`, `fileStorageNote(ready)` ("Kept in the app until the company Shared Drive is connected." / "Kept in the company Shared Drive."), `sharedDriveIdFrom(text)` and `SHARED_DRIVE_ID`, `FILE_BUCKETS`, `isFileBucket`, the proof file rules, `uploadToSignedLink`, types `FileBucket`, `FileStorageHealth`, `ProofFile` |
| `actions.ts` | `'use server'` `connectSharedDrive` (Settings > Company, managing director): runs `file_storage_configure` with the id or the drive's address |
| `components/file-storage-health.tsx` | `FileStorageHealthNotice`, the Data checks line |
| `components/connect-shared-drive.tsx` | `ConnectSharedDrive`, the Settings > Company panel: status line, service account to add as Content manager, Shared Drive id and Connect |
| `components/proof-files.tsx` | `ProofFiles`, the shared upload list (above) |

## Private (`internal/`)
| File | Job |
|---|---|
| `google.ts` | Service account token and the Drive REST calls (folders, resumable upload, download, trash, drive check) |
| `move.ts` | Moves, retries, releases and the connection check, as the service role for one company |
| `view.ts` | `/api/files` handler: `file_access`, then stream from Drive or redirect to a one-minute storage link |
| `status.ts` | Data checks health (counts plus a live check) |
| `connect.ts` | `file_storage_configure` for the Connect step; whether the company's drive is connected (`file_storage_drive` as the service role) |
| `rules.ts` | Buckets, view links, the health line, the storage note, Shared Drive id parsing (pure) |

## Database it owns
Migration 100 (`100_drive_file_storage.sql`; 101 adds the `mission-proofs` bucket to `file_subject`, `file_access`, `file_move_pending` and `file_storage_status`, 102 the `sales-proofs` bucket; 113 files mission documents under `Missions/` in `file_subject`):
- `taskpulse_private.file_storage` (the company's Shared Drive id, last check)
- `taskpulse_private.drive_files` (one row per stored file: pending, moved with its Drive id, trashed)
- `file_storage_configure(drive_id)` (managing director, audited), `file_storage_status()` (managing director), `file_access(bucket, path)` (every view)
- Service role only, one company per request (`x-taskpulse-organization`): `file_move_claim`, `file_move_finish`, `file_move_pending`, `file_release`, `file_storage_checked`, `file_storage_drive`

## Configuration
- Vercel secret `TASKPULSE_DRIVE_SERVICE_ACCOUNT_JSON`: the service account's JSON key (go-live F7). Never in the repository or chat.
- The Shared Drive id is stored per company by `file_storage_configure`: the managing director pastes it (or the drive's address) in Settings > Company > Shared Drive and presses Connect. The service account must be a Content manager of that drive; the panel names it.
- Without the key or a connected drive, files simply stay in Supabase storage and Data checks says so.
- The service account opens only files inside the Shared Drive. A link someone pastes (`task_links`) is stored as a link; the app cannot open, check or share it.

## Depends on
`shared/supabase` (server and worker clients), `shared/session`. No other modules.
