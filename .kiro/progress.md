# TaskPulse — Build Progress

Briefing note for a fresh context session. Records what exists, what was decided
and why, and what is deliberately unfinished.

**Verified state:** `npx tsc --noEmit` exits 0 · `npx next build` compiles clean ·
8 routes registered · `proxy.ts` picked up as `Proxy (Middleware)`.

---

## Corrections to the brief that produced this file

Three descriptions in the request for this document do not match the code. They
are corrected here rather than recorded as fact, since the point of this file is
to brief accurately.

| Claimed | Actual |
| --- | --- |
| "Gemini-inspired layout architecture" | The aesthetic is **neumorphic / soft-card**, built from a supplied Donezo dashboard reference: warm off-white field `#F4F5F7`, borderless white cards with `0 4px 20px rgb(0 0 0 / 0.03)`, forest-green accent `#10533B`. Nothing Gemini-derived. |
| "Collapsible rail navigation" | The rail is **breakpoint-driven, not collapsible**. `md:w-20` icon rail, `lg:w-17rem` full sidebar. There is no toggle control, no state, no persisted preference. |
| "Bottom-left user menu with Settings/Sign Out" | Bottom-left placement and Sign Out are correct. The menu contains **Log history**, not Settings — there is no `/settings` route anywhere in the app. |

"Header CTA consolidation" is accurate and is described below.

If a user-collapsible rail and a Settings page are wanted, both are small
additions — say so and they can be built. They are not present today.

---

## Phases 1–5: complete

### Phase 1 — Database & Foundation

Domain types, Supabase client utilities, initial schema, env template.

- `types/tracker.ts` — five union types plus `User`, `Task`, `DailyTaskLog`,
  `MonthlyPerformanceSnapshot`, `ActionResponse<T>`. Nullability mirrors the DDL;
  `scaledProgress` is `readonly` because it is a generated column.
- `types/database.ts` — hand-written `Database` generic. Without it
  `supabase.from(...)` degrades to `SupabaseClient<any>` and every result is
  untyped. Replaceable by `supabase gen types typescript`.
- `lib/supabase/{client,server,middleware}.ts` — uses only `getAll`/`setAll`; the
  deprecated `get`/`set`/`remove` cookie methods break session handling.
- `supabase/migrations/01_init_schema.sql` — 33 statements.

**Verified** by executing the migration on a real PostgreSQL engine (PGlite):
`scaled_progress` computes 40 × 25% = 10.00 and recomputes to 30.00 on update,
direct writes to it are rejected, all CHECK constraints fire, `ON DELETE RESTRICT`
protects assignees, and RLS blocks a non-owner UPDATE. Also confirmed PostgreSQL
serialises `NUMERIC` to an exact JSON number, so typing those columns as `number`
is correct.

### Phase 2 — Auth & Workspace Layout

Tailwind v4 + Shadcn, login/signup, app shell, route guard.

- `proxy.ts` — Next 16 convention. Refreshes the session and redirects anonymous
  traffic from `/dashboard`, `/tasks`, `/logs`, `/milestones` to
  `/login?redirectTo=…`.
- `app/auth/actions.ts` — `login`, `signup`, `logout`.
- `supabase/migrations/02_auth_provisioning.sql` — necessary, because `01` allowed
  only a `managing_director` to insert profiles, making signup impossible.

**Two bugs found and fixed here:**

1. **Open redirect.** The first `login/page.tsx` checked only
   `startsWith('/')`, which accepts `//evil.test` — a protocol-relative URL the
   browser treats as cross-origin. Validation now lives once in
   `lib/auth/redirects.ts` and is tested against `//host`, `https://host`,
   `javascript:` and `/\host`.
2. **Redirect loop.** A user authenticated but without a `public.users` row would
   ping-pong between `/login` and `/dashboard`. `getAuthState()` now returns auth
   identity and profile separately, and `/login` renders an explanation instead of
   bouncing.

### Phase 3 — Task Management

- `app/tasks/actions.ts` — `createTask`, `updateTask`, `updateTaskStatus`,
  `updateTaskProgress`, `deleteTask`.
- `lib/tasks/filters.ts` — pure filter and sort. **57 assertions pass**, covering
  search, five facets combining with AND, purity, and enum ordering by domain
  weight so `Focus` outranks `High`. Nulls sort last in *both* directions: an
  undated task is unscheduled, not early.
- Grid with sticky header and frozen tag column; cards below 1024px.

**Bug found:** the filter dropdowns rendered **blank** in server HTML. Radix
derives `SelectValue` text from items inside `SelectContent`, which is not mounted
during SSR. Labels are now resolved and rendered as the trigger's own child.

**Also fixed:** the reviewer picker would have sent the literal string `"none"` to
the database, since Radix reserves the empty string for "no selection".

### Phase 4 — Daily Hours & Progress Logger

- `app/logs/actions.ts` — `createTaskLog`, `updateTaskLog`, `deleteTaskLog`, each
  recalculating the parent task's progress, productivity and metrics eligibility.
- `supabase/migrations/03_log_deletion_policy.sql` — the spec said members could
  delete their own logs but only an UPDATE policy existed, so deletes were
  silently refused.
- **75 assertions pass**, including **zero mismatches** between
  `computeScaledProgress` and PostgreSQL's generated column across 20 pairs chosen
  to include `.005` tie boundaries.

**Bug found by working the example:** `roundToNumericScale(1.005)` returned `1`,
not `1.01`. `1.005` is held as `1.00499999999999989`, so multiplying by 100 lands
below the tie. It now shifts the decimal point through the string form
(`1.005e2` → exactly `100.5`).

**Design correction:** progress is applied as a *delta*, never rederived from the
sum of all log deltas — rederiving would wipe the manual progress edits the grid
allows.

### Phase 5 — Analytics & Performance Dashboard

- `lib/analytics/engine.ts` — medians, differentials, criticality, star algorithm.
  Pure; no React, no Supabase.
- `app/dashboard/actions.ts` — `freezeMonthlySnapshot`, managing-director only,
  upserting on the table's unique key so a month can be recomputed after late logs.
- **102 assertions pass** against a fixture whose every expected value was
  hand-computed from `domain-rules.md` first.

**Bug found by working the example:** hours logged against an `OT` task were
counted in the productivity denominator while the progress was correctly excluded
— so logging off-hours time *lowered* your rate. There are now two quantities:
`hoursLogged` (everything worked) and `eligibleHours` (the rate denominator).

**Three interpretations recorded**, each undefined by the spec:

1. The productivity numerator is derived from monthly logs, not the cumulative
   `scaled_progress` column — a lifetime numerator over a monthly denominator is
   not a rate.
2. Freshness Score is a weighted share of carried tasks: `Fresh` 1.0, `Stale` 0.5,
   `Rotten` 0.0.
3. A task counts toward a month if assigned on or before it ended and not
   completed before it began.

---

## Post-phase work

### Marketing landing page

`/` serves a marketing page to visitors and redirects members to `/dashboard`. It
checks for a *profile*, not just a session, so an unprovisioned account is not
bounced into a guarded route.

The product preview in the hero is built from the **real** design-system classes
(`sheet-grid`, `badge-soft`, `task-progress`), so it cannot drift from the
product's actual appearance.

**Decommercialised on request.** All pricing, tiers, trial copy and sales
references were removed. The pricing slot is now
`components/marketing/capabilities-grid.tsx`: three governance capabilities, a
role permission matrix generated from `USER_ROLES` and `ROLE_LABELS`, and the six
performance formulas written out. Twenty commercial strings were verified absent
from the rendered HTML.

### Toasts and skeletons

Sonner is mounted once in the root layout. Feedback is split by where it can
usefully live:

- Inline grid edits (status, progress) toast their failures — a cell cannot hold a
  sentence, and the visible rollback is already the persistent signal.
- Flows whose surface disappears on success (log create/update, task delete, log
  delete) toast the confirmation, because the drawer that asked is gone.
- Their *errors* stay inline, since the drawer is still open.

`loading.tsx` skeletons exist for `/dashboard`, `/tasks` and `/logs`. All
placeholders are `aria-hidden`, with one `role="status"` announcement per route.

---

## Current visual architecture

Neumorphic soft-card. Surfaces are separated by **elevation and radius rather than
stroke**.

### Tokens (`app/globals.css`)

| Token | Value |
| --- | --- |
| `--background` | `#F4F5F7` warm off-white field |
| `--card` | `#FFFFFF` |
| `--primary` | `#10533B` forest |
| `--primary-hover` | `#0C4230` (darker, so pressing reads as depth) |
| `--primary-subtle` | `#E7F0EC` |
| `--border` | `#EEF0F3` hairline, internal dividers only |
| `--radius` | `1rem`, stepping to `1.5rem` for cards |
| `--shadow-soft` | `0 4px 20px rgb(0 0 0 / 0.03)` |
| `--shadow-forest` | `0 10px 30px rgb(16 83 59 / 0.18)` |

Forest is the **only** accent. It marks primary buttons, the hero metric, the
active nav row, progress fill, focus rings and `--chart-1`, and appears nowhere
else, so its presence always means "this is the important one".

Reusable classes carry most of the styling, which keeps component diffs small:
`soft-card`, `soft-card-clip`, `soft-card-interactive`, `soft-inset`,
`metric-card`, `metric-card-primary`, `metric-arrow`, `stat-figure`, `stat-label`,
`eyebrow`, `kbd`, `nav-section-label`, `nav-item`, `nav-item-active`,
`icon-button`.

### Badge taxonomy — deliberately non-colliding

The requested `bg-amber-100` for in-progress collided with Priority `Medium`,
which was already amber. Two identical chips two columns apart meaning unrelated
things would damage a dense row, so Priority moved off amber.

| Taxonomy | Mapping |
| --- | --- |
| **Status** | Done `emerald-100/800` · In Progress `amber-100/800` · Not Started `slate-100/600` · Discarded `slate-200/500` struck through |
| **Priority** | Focus `rose-100/800` semibold · High `orange-100/800` · Medium `sky-100/800` · Low `slate-100/600` · No dimmed |
| **Freshness** | Dot plus label — a different *form*, so it stays distinguishable where hues repeat |
| **Category / Role** | Neutral `slate-100/600`; thirteen categories carry no hue meaning |

### Layout

| Viewport | Behaviour |
| --- | --- |
| `< 768px` | Header with branding, floating rounded bottom bar, raised Log Hours action |
| `768–1024px` | `w-20` icon rail with native tooltips, no bottom bar |
| `> 1024px` | Full `17rem` sidebar with MENU/GENERAL sections and profile block |

The **active nav row is marked three ways at once** — forest text, bold weight,
and a rounded `:before` indicator bar — so the state survives a colourblind
reading and stays legible in the icon rail where the label is hidden.

### Header CTA consolidation

One row holds: search field with a working `⌘F` / `Ctrl+F` binding, a notification
bell, primary **Add Task** (rendered only for `managing_director` and
`project_engineer`; the Server Action re-checks regardless), secondary **Log
Hours**, and the profile trigger on mobile.

The reference design's "Add Project" and "Import Data" were adapted: this product
has no projects to add, so the actions are the domain equivalents.

### Bottom-left account menu

`UserMenu` sits in the sidebar footer, showing avatar, name over email, and a
chevron. The dropdown carries name, email, employee ID, role badge, **Log
history**, and **Sign out** (a form submitting the `logout` Server Action). Sign
out also appears as a GENERAL section row in the sidebar.

**There is no Settings item, and no `/settings` route.**

---

## Route protection

`proxy.ts` at the project root. Named for the Next.js 16 convention — the
`middleware` file convention was renamed to `proxy`, and the exported function
from `middleware` to `proxy`. The old name still runs but is deprecated; on
Next 15 or earlier, rename the file and export `middleware`.

Two responsibilities, in order:

1. Refresh the Supabase session on every matched request. Server Components cannot
   write cookies, so this is the only place the rotated token can be persisted.
2. Turn anonymous requests away from `/dashboard`, `/tasks`, `/logs`,
   `/milestones`, preserving the destination as `?redirectTo=`.

This is the first gate, not the only one. `app/(workspace)/layout.tsx` proves a
profile exists before any page renders, and RLS is the final boundary. Keeping the
check in both places means a route added later is protected even if the proxy
matcher is not updated.

**Verified:** all four prefixes and a nested path return 307 to
`/login?redirectTo=…`; `/` and `/login` return 200.

---

## Verification approach

No unit test framework is installed. Pure logic was verified by exercising the
real modules through temporary Next route handlers, so the `@/` aliases resolved
exactly as they do in the app; SQL was verified by executing migrations on PGlite,
a real PostgreSQL engine in WASM. All harnesses and their dependencies were removed
after use.

| Suite | Assertions |
| --- | --- |
| Filter and sort logic | 57 |
| Metric formulas vs PostgreSQL | 75 (0 mismatches) |
| Analytics engine | 102 |
| Auth provisioning & RLS | all passed |
| Action fail-closed probes | all passed |

Every Server Action was confirmed to refuse when unauthenticated, with auth
checked *before* field validation so an empty form does not leak which fields
exist.

**Adding a real test runner (Vitest) is the highest-value next infrastructure
step.** The current approach proved the code but leaves nothing behind to catch a
regression.

---

## Known gaps

Ordered by how much they matter.

1. **Freshness decay is not maintained.** `tasks.freshness` resets to `Fresh` when
   logged against, but nothing advances it to `Stale` or `Rotten`. It reads
   optimistically and feeds two terms of the star formula. Needs a scheduled job
   comparing `updated_at` against the 7- and 14-day thresholds.
2. **Star formula is scale-dominated.** `0.3 × total scaled progress` swamps the
   other three terms, so the award effectively means "did the most weighted work".
   Implemented exactly as specified rather than silently normalised; the card
   prints each weighted term so the dominance is visible. Normalising progress
   against the team maximum is a one-line change that *changes who wins*.
3. **Metric recalculation is not atomic.** Read-then-write; concurrent logs on one
   task could lose a delta. Needs an RPC.
4. **Steering files are in the wrong place and partly stale.** They sit in
   `steering/`, not `.kiro/steering/`, so Kiro does not auto-load them. Worse,
   `responsive-ui-design.md` still mandates the superseded sheet-faithful
   aesthetic with `border-slate-200` micro-borders and sky-tinted in-progress
   badges, and `tech-stack.md` rule 2 says to implement them strictly. **A future
   phase reading those would revert the current UI.** Moving and rewriting them is
   recommended before the next visual change.
5. **Aggregates and filtering run in application code.** PostgREST has no
   `GROUP BY`; the grid fetches once and filters client-side. Both need to move to
   SQL with pagination as data grows.
6. **No settings route, no user-collapsible rail.** Noted in the corrections above.
7. **Milestone content is static** in `lib/milestones/content.ts`; making the
   checklist editable needs a table and policies.
8. **Legal pages are not hosted** — the footer uses a mailto address rather than
   linking routes that do not exist.
9. **Duplicate `employee_id` on signup** surfaces as a generic Supabase error. The
   action cannot pre-check because the SELECT policy is granted to `authenticated`
   only.

---

## Conventions to preserve

- Strict TypeScript. No `any` — the `Database` generic exists to keep query
  results typed.
- No inline CSS. Dynamic progress uses the native `<progress>` element rather than
  a div with a percentage width, so it is announced to assistive technology for
  free and needs no style attribute.
- Client components never write to the database; mutations go through Server
  Actions returning `ActionResponse<T>`.
- Authorisation is checked in the action *and* enforced by RLS.
- Undefined is not zero. Productivity with no hours is `null`, not `0`, and
  medians skip undefined values rather than folding them in.
- Domain enums have a single source of truth in `lib/tracker/enums.ts`, with
  `satisfies Record<Enum, …>` so adding a member breaks the build rather than
  silently omitting an option.
