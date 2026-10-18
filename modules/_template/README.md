# <module name>

Copy this folder to `modules/<name>/` when you move an area into a module, then
delete this line. See `docs/ARCHITECTURE.md` for the rules.

## What it does
One or two sentences in plain words.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | Server-side reads and types, e.g. `getTaskWorkspace()` |
| `actions.ts` | `'use server'` commands, e.g. `createTask()` |
| `client.ts` | Types and pure helpers safe for `'use client'` components |
| `components/` | The module's UI, rendered by pages in `app/` |

## Private (`internal/`)
| File | Job |
|---|---|
| `queries.ts` | Reads from Supabase |
| `commands.ts` | Writes / RPC calls |
| `rules.ts` | Business rules (pure functions) |
| `permissions.ts` | Who may do what (UI messages; the database is the real boundary) |
| `input.ts` | Parse and validate FormData |
| `mappers.ts` | Database row -> domain model |

## Database it owns
Tables, views and RPCs this module reads/writes, with the migration that defines them.

## Depends on
`shared/*` and the public API of: <other modules>.
