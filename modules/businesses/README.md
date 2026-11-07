# businesses

## What it does
The company's lines of business (7 November 2026, migration 134; company #1 starts with
"3D printing", "Fish sales" and "Construction services"). Each mission belongs to at most one
business and each person works in some of them. Missions and Today show business chips (All, one
per business, "No business") that open on the viewer's own businesses, or All when they have none;
the choice is kept in `?business=`. A business is a **view, not a permission**: mission rows stay
visible company-wide and work content stays under `can_read_mission_work` (117). Nothing here
feeds a score.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getBusinesses()`, `getMyBusinessIds()`, `getBusinessSummary()`, `getBusinessView()` (list + own + summary), and everything in `client.ts` |
| `actions.ts` | `manageBusiness` (create / update / archive / restore), `setPersonBusinesses` (one person's list), `setMissionBusiness` |
| `client.ts` | Types (`Business`, `BusinessCatalogue`, `BusinessSelection`, `BusinessSummary`), colours (`BUSINESS_DOT_CLASS`), the `?business=` helpers (`parseBusinessParam`, `businessParamValue`, `toggleBusiness`, `matchesBusiness`, `businessQueryFilter`, `defaultBusinessSelection`, `summaryLines`) |
| `components/business-chips.tsx` | The chips and the per-business lines (open missions, permanent missions once 135 exists, this week's hours) |
| `components/business-switcher.tsx` | The chips for a server-read page (Today): a press sets `?business=` and reloads |
| `components/business-dot.tsx` | A mission's coloured dot (cards, table rows, details) |
| `components/business-manager.tsx` | Settings > Company > Businesses (managing director) |
| `components/person-businesses.tsx` | A person's businesses on their Team profile (the managing director edits) |
| `components/mission-business-select.tsx` | The Business field on a mission's Details tab |

The New mission / Edit mission form's Business field lives in `modules/tasks` (`task-dialog.tsx`), sent
as `business_id` in `save_task_with_participants`' `p_fields`.

## Private (`internal/`)
| File | Job |
|---|---|
| `queries.ts` | `businesses()`, `my_businesses()`, `business_summary()` |
| `commands.ts` | `business_command`, `user_businesses_command`, `task_business_command` |
| `rules.ts` | Mappers and the pure chip-selection logic |

## Database it owns (migration 134)
- `taskpulse_private.businesses` (organization_id, name, slug, colour token, sort, active): archived, never deleted.
- `taskpulse_private.user_businesses` (user_id, business_id, organization_id).
- `public.tasks.business_id` (nullable; written only through the commands). Sub-missions take their
  parent's business through the `zz_m134_sub_mission_business` trigger on the Subtask dependency.
- RPCs: `businesses()`, `my_businesses()`, `business_summary()` (any active member);
  `business_command` and `user_businesses_command` (managing director);
  `task_business_command` (managing director, Managers, the mission's Crew);
  `save_task_with_participants` / `create_task_with_scale` accept `business_id` in `p_fields`.
- Every change is audited (`business_<op>`, `user_businesses_set`, `task_business_set`) and idempotent by operation id.
- `business_summary()` reports `permanentMissions` once `tasks.is_permanent` exists (migration 135); until then null.

## Depends on
`shared/*` only. Used by `tasks`, `workspace-views` (Today), `settings` (slot) and the Team profile page.

## Tests
`modules/businesses/__tests__/selection.test.ts`; `tools/test_businesses_database.py` (CI).
