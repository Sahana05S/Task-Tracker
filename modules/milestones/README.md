# milestones

The `/milestones` page: the company's vision, mission and core values
(statements) and its monthly milestones with delivered/target counts. Every
member reads it; managing directors and project engineers edit it.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getMilestonesPageData()`, `MilestonesPageData`, `MILESTONES_MIGRATION`, and the goal helpers (`summariseMilestones`, `openMilestoneCount`, `sortMilestones`, `milestoneCompletion`) |
| `actions.ts` | `'use server'` commands `updateStatement`, `createMilestone`, `updateMilestone`, `deleteMilestone`; types `StatementActionState`, `MilestoneActionState` |
| `client.ts` | Pure helpers for `'use client'` code: goal helpers, statement keys, `findStatement`, `parseCoreValues` |
| `components/` | `MilestoneBoard`, `OrganizationShowcase`, `SchemaNotice` (plus their children `MilestoneChecklist`, `MilestoneDialog`, `StatementEditor`) |

## Private (`internal/`)
| File | Job |
|---|---|
| `queries.ts` | Loads statements, milestones and the member directory; reports a missing schema as `schema-missing` |
| `commands.ts` | Inserts/updates/deletes rows and turns PostgREST errors into user messages |
| `permissions.ts` | The editor role check and its message (UI only; RLS is the real boundary) |
| `input.ts` | Parses and validates the statement and milestone forms |
| `cache.ts` | Revalidates `/milestones` and the workspace layout (nav badge) |
| `goals.ts` | Pure milestone rules: tallies, open count, ordering, completion % |
| `statements.ts` | Pure statement rules: showcase keys, core-value parsing |
| `mappers.ts` | Database row -> domain model |

## Database it owns
| Object | Defined in | Use |
|---|---|---|
| `company_statements` (table) | `04_milestones_and_vision.sql`; policies rebuilt in `10_permissions_and_participant_contract.sql`; company key in `39_organizations_tenancy_foundation.sql` | read + update (`title`, `statement`, `subtext`, `updated_by`) |
| `company_milestones` (table) | `04_milestones_and_vision.sql`; policies rebuilt in `10_permissions_and_participant_contract.sql` | read, insert, update, delete |

No RPCs. The module also reads `users` (owner picker), which the team area owns.
`lib/layout/nav-counts.ts` still reads `company_milestones` directly for the
navigation badge; that belongs to the workspace-views refactor.

## Depends on
`shared/*` (Supabase server client and user mappers, session actor, form
readers, tracker enums/format, UI) and `components/missions/mission-ui`
(not yet a module).
