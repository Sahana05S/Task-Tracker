# settings

Per-company settings (candidate G, DECISIONS "Company settings and activity log
- 21 October 2026"): the lists the workbook kept in A_Sheet_Attributes, the
meeting agenda, the standing monthly missions and a holiday calendar. The
managing director edits them in Settings > Company; everyone in the company
reads them.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | `getCompanySettings()` (built-in defaults before migration 53), `categoryCatalogue()` (the 13 codes with the company's labels, active flags and order), `getCompanyHolidayNames(from, to)` |
| `actions.ts` | `saveCompanySettings(prev, form)`: one section per call (`agenda`, `categories`, `meeting_types`, `standing_missions`, `holidays`, `mission_defaults`, `branding`, `departments`) |
| `client.ts` | Types and pure rules: `buildCategoryCatalogue`, `categoryChoices` (hides inactive codes except the current one), `categoryLabelMap`, `meetingTypeChoices` (keeps a saved value that left the list), `agendaLines`, `renderTitlePattern`, `formatSheetTag`, `canManageCompanySettings`, `STANDING_SCALE_MODES`, `SCALE_MODE_LABELS`, `CompanyBranding`, `BRANDING_URL_FIELDS`, `isBrandUrl` |
| `components/company-settings.tsx` | `CompanySettingsEditor`: the Company tab (eight sections, each saved on its own) |
| `components/company-settings-context.tsx` | `CompanySettingsProvider` (in the workspace layout), `useCategoryCatalogue()`, `useCategoryLabels()`, `useMeetingTypes()`, `useDefaultScaleMode()`, `useCompanyBranding()` |
| `components/company-brand.tsx` | `CompanyBrand` (the top bar's company mark and name, Stellar's when none), `ThemedBrandImage` (light/dark image swap), `useBrandHomeLabel()` |
| `components/meeting-type-select.tsx` | `MeetingTypeSelect`: the meeting-point Meeting type field (free text while a company has no types) |
| `components/meeting-agenda.tsx` | `MeetingAgenda`: the agenda box on Meeting points |

`shared/tracker/enums.ts` stays the code catalogue (`TASK_CATEGORIES`,
`CATEGORY_LABELS`); codes, tags and scoring never change. Client components
that show a mission type's name use `useCategoryLabels()`; server code uses
`categoryCatalogue()`.

## Private (`internal/`)
| File | Job |
|---|---|
| `rules.ts` | Contract types, catalogue rules, payload parser (client-safe) |
| `queries.ts` | `company_settings()` read, cached per request |
| `commands.ts` | `company_settings_command` call and error wording (conflicts via `isConflictCode`) |
| `input.ts` | Parses a section form (`section`, `expectedVersion`, `operationId`, `payload` JSON) |
| `permissions.ts` | `canManageCompanySettings` (UI only) |

## Database it owns (migration 53, `53_company_settings.sql`)
- Tables (private, FORCE RLS, `organization_id`): `taskpulse_private.organization_settings`
  (agenda, `category_overrides` `{code: {label, active, sort}}`, version),
  `meeting_types`, `company_holidays`, `standing_missions` (title pattern with
  `{month}`/`{member}`, type, priority, `per_member`/`single` owner, scale mode),
  `task_tag_counters`.
- `public.company_settings()`: any active member of the company; standing
  missions only for the managing director and project engineer.
- `public.company_settings_command(section, payload, expected_version, operation)`:
  managing director only; versioned (stale version raises PT409), idempotent per
  operation, audited in `audit_events` (`company_settings_<section>`).
- `taskpulse_private.allocate_task_tag(org, month, prefix)`: `<Mon><YY>_<PREFIX><n>`
  with one running number per company and month (the sheet's numbering, shared
  by every prefix), under an advisory lock, skipping tags already taken.
  Used by the `m53_assign_task_tag` trigger (a mission saved without a tag) and
  by `task_tools_preview` copies. Existing `TT-` and typed tags stay valid.
- `public.dated_record_command` is now a wrapper: an attendance save with no
  status on a company calendar date becomes Holiday (regular hours 0, the
  holiday's name). It does nothing until a calendar is saved; recorded
  attendance is never rewritten. `public.team_holiday_dates` adds calendar
  dates to the derived "everyone recorded Holiday" rule.
- Seeds company #1 from the September 2026 workbook: meeting types DL WL ML QTL
  PRF SCD PP AH, the "Regular Meeting Agenda" and six standing missions.

## New missions default (migration 61, `61_new_mission_scale_mode.sql`)
- `organization_settings.default_scale_mode` (`manual`, `hours` or
  `activity_count`; `manual` for every existing company). `company_settings()`
  returns it as `defaultScaleMode` to every member.
- `company_settings_command('mission_defaults', {scaleMode})`: same director
  rule, version, receipt and audit (`company_settings_mission_defaults`) as the
  other sections. Settings > Company > New missions edits it; the New mission
  dialog starts from it. Missions that already exist keep their scale.

## Branding (migration 64, `64_company_branding.sql`)
- `organization_settings.logo_url`, `logo_dark_url`, `mark_url`, `mark_dark_url`
  (optional; checked by `taskpulse_private.is_brand_url`: app-relative `/...` or
  `https://`, up to 500 characters; `isBrandUrl` in `rules.ts` is the same rule).
  `company_settings()` returns `branding` {companyName (from
  `public.organizations.name`), the four addresses} to every member.
- `company_settings_command('branding', {logoUrl, logoDarkUrl, markUrl, markDarkUrl})`:
  same director rule, version, receipt and audit (`company_settings_branding`).
  The company name is platform-owned and not editable here.
- The top bar shows the mark and name (dark variant in the dark theme, falling
  back to the light one); the copied/exported text report names the company.
- Company #1 renamed to Arkensys Realtors; its files live in `public/brands/arkensys/`.

## Departments (migration 65, `65_org_chart.sql`)
- `taskpulse_private.departments` (`organization_id`, `name` unique per company
  ignoring case, `sort`, `active`). People point at a department through
  `users.department_id` (owned by team).
- `company_settings()` returns `departments` (with an active `members` count)
  to every member; `company_settings_command('departments', {departments})`
  saves the whole list (up to 100): rows keep their id, so renaming or hiding
  one keeps its people, and a department that still has people cannot be
  removed. Settings > Company > Departments edits it.

Tests: `modules/settings/__tests__/settings.test.ts`,
`tools/test_company_settings_database.py`, `tools/test_mission_scale_mode_database.py`,
`tools/test_m64_company_branding_database.py`.

## Depends on
`shared/*` only. Pages combine it with `team` (members for the owner select).
