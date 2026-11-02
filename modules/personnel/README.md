# personnel

## What it does
Personal records (M19): every employee uploads their 10th marksheet, 12th
marksheet, Aadhaar card and college marksheet(s) on their profile's Personal
info tab. Only the person and the managing director see them.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getPersonalRecords(userId)` (with 10-minute viewing links), `getRecordsSummary()` (managing director), `getOwnRecordKinds(userId)` |
| `records-actions.ts` | `startRecordUpload` (signed upload link for one path in the caller's folder), `saveRecord`, `removeRecord` |
| `client.ts` | `RECORD_KINDS`, labels and hints, `fileProblem`, `recordPath`, `recordProgress`, `formatFileSize`, `canViewPersonalRecords`, `uploadToTicket` (browser half of an upload) |
| `components/` | `PersonalRecords` (the tab), `RecordsPrompt` (Today), `RecordsOverview` (Manage people) |

Uploads go from the browser straight to storage through a signed upload link,
so files up to 5 MB never pass through a server request (Vercel caps those at
4.5 MB); the command then records the file. Since migration 100 the files
module then moves it into the company Shared Drive
(`Personal documents/<Employee ID> - <Name>/`) after the response, and trashes
the Drive copy of a replaced or removed file. Viewing links go through
`/api/files`, which checks permission on every open.

## Private (`internal/`)
| File | Job |
|---|---|
| `queries.ts` | `personal_records`, `personal_records_summary`, signed viewing links |
| `commands.ts` | Signed upload links, `personal_record_command`, removing released files |
| `rules.ts` | Kinds, file checks, paths, progress, who sees the tab |
| `mappers.ts` | RPC JSON -> domain model |
| `upload.ts` | Browser upload to a signed link (client-safe) |

## Database it owns
Migration 78 (`78_personal_records.sql`):
- `taskpulse_private.personal_documents` (one active file per kind; college up to 12)
- Storage bucket `personal-documents` (private, 5 MB, PDF/JPEG/PNG/WebP) and its policies
- `personal_records(uuid)`, `personal_records_summary()`, `personal_record_command(...)`, `personal_document_in_use(text)`

Nothing is written to the audit trail's protected changes or the activity feed.

## Depends on
`shared/*` and the files module (`index.ts`, `client.ts`).
