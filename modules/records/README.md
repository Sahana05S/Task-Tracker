# records

Dated records: the one write path for attendance records, daily facts, ideas,
suggestions, sales logs and meeting points, and their retained revision
history (business date and observed revision time stay separate).

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getRecordHistory(kind, id)`, `isRecordReference(kind, id)`, `RECORD_KINDS` |
| `actions.ts` | `'use server'` `writeDatedRecord` (save, withdraw, validate) |

## Private (`internal/`)
| File | Job |
|---|---|
| `input.ts` | Turns a record form into the command payload (attendance hours and local check times; sales and meeting fields) |
| `commands.ts` | Calls `dated_record_command` and checks its `{ id, version }` result |
| `history.ts` | Reads `dated_record_history` and member names |

## Database it owns
| Object | Defined in |
|---|---|
| `dated_record_command` | `19_attendance_and_support_history.sql`, revised in 20 |
| `dated_record_history` | `19_attendance_and_support_history.sql` |

The tables themselves (attendance records, daily facts, ideas, suggestions,
sales logs, meeting points) belong to `attendance` and `support`, which read
them. All objects are company-scoped by migrations 39-40 (M15).

## Depends on
`shared/*` only. `attendance` and `support` depend on this module.
