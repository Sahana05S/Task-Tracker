# hr

## What it does
HR documents and reviews (M19, 26 October 2026):
- **Documents** (`/hr/documents`): the company letterhead and the Code of Conduct on it, each downloadable as PDF
  through the browser's Save as PDF (print styles in `app/globals.css`, `.paper`). Every member reads and accepts
  the current Code of Conduct; the managing director edits and publishes new versions and sees who has accepted.
- **Performance reviews** (`/hr/reviews`, migration 81): see below once added.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getCodeOfConduct()`; everything in `client.ts` |
| `conduct-actions.ts` | `publishConduct` (managing director), `acknowledgeConduct` (any member) |
| `client.ts` | `conductBlocks` (plain text -> headings, lists, paragraphs), the starting draft, limits, types |
| `components/` | `Letterhead`, `ConductText`, `ConductAcceptance`, `ConductEditor`, `PrintButton` |

## Private (`internal/`)
| File | Job |
|---|---|
| `conduct.ts` | `code_of_conduct`, `code_of_conduct_command` |
| `rules.ts` | Starting draft, text blocks, limits |

## Database it owns
Migration 80 (`80_letterhead_and_code_of_conduct.sql`):
- `taskpulse_private.code_of_conduct_versions` (numbered, one per publish) and `code_of_conduct_acknowledgements`
- `code_of_conduct()`, `code_of_conduct_command(text, text, text, integer, uuid)`

The same migration adds the letterhead's contact lines to `organization_settings` (owned by **settings**:
`company_settings()` `letterhead`, `company_settings_command` section `letterhead`).

## Depends on
`shared/*` and the public API of: settings (branding and letterhead lines).
