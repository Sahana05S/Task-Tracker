# hr

## What it does
HR documents and reviews (M19, 26 October 2026):
- **Documents** (`/hr/documents`): the company letterhead and the Code of Conduct on it, each downloadable as PDF
  through the browser's Save as PDF (print styles in `app/globals.css`, `.paper`). Every member reads and accepts
  the current Code of Conduct; the managing director edits and publishes new versions and sees who has accepted.
- **Performance reviews** (`/hr/reviews`, migration 81), the page first asked for as "HR acknowledgement":
  the managing director keeps a list of metrics and starts reviews; each employee scores themselves 1-5 per
  metric and lists pros (strengths) and cons (areas to improve), then submits; the director adds their own
  scores, pros, cons and a summary and completes it. The employee sees the director's side once completed.
  The sheet prints on the letterhead. Reviews add no scoring rule and never feed a performance score.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getCodeOfConduct()`; everything in `client.ts` |
| `index.ts` (reviews) | `getReviewList()`, `getReview(id)`, `getPendingSelfReviews(userId)` |
| `conduct-actions.ts` | `publishConduct` (managing director), `acknowledgeConduct` (any member) |
| `review-actions.ts` | `reviewAction` (create, self, director, return, withdraw, metric) |
| `client.ts` | `conductBlocks` (plain text -> headings, lists, paragraphs), the starting draft, limits, types |
| `components/` | `Letterhead`, `ConductText`, `ConductAcceptance`, `ConductEditor`, `PrintButton`, `HrTabs`, `HrPrompt` (Today), `ReviewList`, `NewReview`, `ReviewMetrics`, `ReviewEditor`, `ReviewAdminActions`, `ReviewPaper` |

## Private (`internal/`)
| File | Job |
|---|---|
| `conduct.ts` | `code_of_conduct`, `code_of_conduct_command` |
| `rules.ts` | Starting draft, text blocks, limits, review statuses, score labels, averages |
| `reviews.ts` | `performance_reviews`, `performance_review`, `performance_review_command` |
| `review-model.ts` | Review payloads -> types |
| `review-input.ts` | Parse and check review forms |

## Database it owns
Migration 80 (`80_letterhead_and_code_of_conduct.sql`):
- `taskpulse_private.code_of_conduct_versions` (numbered, one per publish) and `code_of_conduct_acknowledgements`
- `code_of_conduct()`, `code_of_conduct_command(text, text, text, integer, uuid)`

Migration 81 (`81_performance_reviews.sql`):
- `taskpulse_private.review_metrics` (seeded with six), `performance_reviews`, `performance_review_ratings`
  (each review keeps a copy of its metric names)
- `performance_reviews()`, `performance_review(uuid)`, `performance_review_command(text, uuid, jsonb, bigint, uuid)`

Migration 80 also adds the letterhead's contact lines to `organization_settings` (owned by **settings**:
`company_settings()` `letterhead`, `company_settings_command` section `letterhead`).

## Depends on
`shared/*` and the public API of: settings (branding and letterhead lines).
