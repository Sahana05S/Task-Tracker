# TaskPulse — Build Progress

Briefing note for a fresh context session. Records what exists, what was decided
and why, and what is deliberately unfinished.

**Verified state:** `npx tsc --noEmit` exits 0 · `npx next build` compiles clean from
a wiped `.next` · 8 route entries registered, including `/settings` · `proxy.ts`
picked up as `Proxy (Middleware)` · against a running production server, all five
protected prefixes return `307` to `/login?redirectTo=…` while `/` and `/login`
return `200` · migrations 01-04 apply in order against real PostgreSQL with 37
assertions passing, including per-role RLS behaviour · 21 assertions on the pure
milestone helpers · 36 assertions on the rendered milestones markup.

**Steering lives in `steering/`, not `.kiro/steering/`.** Requests keep naming the
latter; it does not exist, so nothing is auto-loaded and the files have to be read
explicitly.

---

## The UI has been redesigned twice; read this before touching it

The shell has been through three looks, and two written records of it are stale.
This matters because following the wrong one silently reverts work.

| Pass | Look | Status |
| --- | --- | --- |
| 1. Sheet-faithful | `border-slate-200` panels, sky-tinted In Progress badges, `17rem` sidebar | **Superseded.** Still what `steering/tech-stack.md` rule 2 and `steering/responsive-ui-design.md` describe. |
| 2. Neumorphic / soft-card | Borderless white cards on `#F4F5F7`, `0 4px 20px rgb(0 0 0 / 0.03)`, `1rem` radius, breakpoint-driven rail → sidebar | **Superseded.** |
| 3. Utilitarian (current) | Border-led panels, `0.625rem` radius, permanent `w-14` icon rail plus a Sheet drawer, consolidated header, `font-mono` on every figure | **Current.** Described under *Current visual architecture* below. |

Each pass was an explicit instruction that overrode the steering files, which were
never updated to match. **Steering is not authoritative on visuals; this file is.**

An earlier revision of this document also recorded that a Gemini-inspired layout,
a togglable rail and a Settings page did not exist. All three now do — pass 3 added
them. That correction table has been removed rather than left to mislead.

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

Six components, all on the same tokens as the workspace — the public page was the
last thing still wearing the original sheet palette, and a landing page that looks
unlike the product it sells is a liability:

| File | Contents |
| --- | --- |
| `hero-section.tsx` | Headline, two-sentence subtext, **Launch Workspace** + **System Overview**, three figures |
| `tracker-mockup.tsx` | The interactive preview, in a floating browser frame |
| `feature-bento.tsx` | Three cards — Multi-Metric Math, Team Medians, Decay Tracking — plus the three-step workflow |
| `system-capabilities.tsx` | Three cards — Row-Level Security, Role Governance, Auditability — plus the role matrix and the formulas |
| `site-header.tsx` · `site-footer.tsx` | Chrome, using the same `TP` monogram as the workspace rail |

Both grids are **three cards, equal size**. A mixed-size bento would have implied
one of the three measurements mattered more, and the four-up supporting strip that
used to sit under the features was deleted: it restated the security and role
material that the capabilities section covers properly.

The product preview is built from the **real** design-system classes
(`sheet-grid`, `badge-soft`, `task-progress`, `freshness-*`), so it cannot drift
from the product's actual appearance. Its frame is the one place on the site that
uses elevation — it stands in for a screen in front of the page, not a panel
sitting in it — and the backdrop is a blurred flat forest tint, not a gradient,
since the project has no gradients.

**Decommercialised, and kept that way.** All pricing, tiers, trial copy and sales
references were removed. The slot a pricing matrix would occupy holds the
governance material instead. Twenty-three commercial strings are verified absent
from the rendered HTML on every audit; the only remaining occurrences of words like
"pricing" anywhere in the source are comments explaining the absence.

`PLATFORM_FACTS` publishes counts — six tables, seventeen RLS policies, four roles,
one generated column. **Re-count these from the migrations before editing them.**
They were 4/12 before `04` and are easy to leave stale, and a wrong number on a page
that argues for verifiability is worse than no number.

### Typography

Inter, self-hosted through `next/font/google`, exposed as `--font-inter` rather
than as a class so `--font-sans` can put `ui-sans-serif, system-ui, …` behind it —
a failed font fetch degrades to the platform UI font instead of to a serif. The
variable class and `font-sans` both sit on `<html>`, so overlays Radix portals into
`<body>` from outside the React tree inherit the family too.

`globals.css` pins the family in four places rather than relying on inheritance
alone: `html`, `body`, `h1`–`h6` (which also take a tighter track, since Inter's
default spacing reads loose at heading sizes), and `button, input, optgroup,
select, textarea`, which get their own font from the UA stylesheet. Tailwind's
preflight already resets the last group; declaring it means a trimmed preflight
cannot quietly drop a button back to Arial.

Figures go through `.tabular`, `.stat-figure` or `.sheet-numeric`, all three of
which set a monospaced face **and** `tabular-nums`. No bare
`[font-variant-numeric:tabular-nums]` remains in the codebase — proportional digits
with tabular spacing still misalign, because the spacing only equalises advance
widths within one family.

**A real bug was fixed here.** `app/layout.tsx` carried
`className="bg-slate-50 text-slate-900"` on `<body>`. Utilities land in a later
cascade layer than `@layer base`, so those two classes beat the token rule and the
entire application — every workspace route, not just the landing page — rendered on
`#f8fafc` instead of the `#f4f5f7` field the theme defines. The body now uses
`bg-background text-foreground`.

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

Utilitarian. Surfaces are separated by **stroke, not elevation**: a hairline border
is more precise than a drop shadow, costs no vertical space, and does not imply a
panel is floating when it is not. Shadow is spent only on layers that genuinely
float — dropdown, select, the nav sheet, the mobile bar, chart tooltips.

### Tokens (`app/globals.css`)

| Token | Value |
| --- | --- |
| `--background` | `#F4F5F7` warm off-white field |
| `--card` | `#FFFFFF` |
| `--primary` | `#10533B` forest |
| `--primary-hover` | `#0C4230` (darker, so pressing reads as depth) |
| `--primary-subtle` | `#E7F0EC` |
| `--border` | `#E4E7EC` hairline — the structural element |
| `--input` | `#D8DDE5` (a step darker, so fields read as editable) |
| `--radius` | `0.625rem` |
| `--shadow-soft-lg` | `0 14px 40px rgb(0 0 0 / 0.07)` — the **only** shadow |
| `--spacing-header` | `3.5rem`, the header's single-row height |
| `--spacing-bottom-nav` | `4.5rem` |

The soft-card pass's `--shadow-soft`, `--shadow-soft-md` and `--shadow-forest` were
removed, along with the unused `--sidebar-*` colour set. Nothing references them.

Forest is the **only** accent. It marks primary buttons, the hero metric, the
active nav target, progress fill, focus rings and `--chart-1`, and appears nowhere
else, so its presence always means "this is the important one".

Reusable classes carry most of the styling, which keeps component diffs small:
`soft-card`, `soft-card-clip`, `soft-card-interactive`, `soft-inset`,
`soft-divider`, `metric-card`, `metric-card-primary`, `metric-trend`, `tabular`,
`stat-figure`, `eyebrow`, `panel-title`, `nav-item`, `nav-item-active`,
`rail-item`, `rail-item-active`, `nav-count`, `icon-button`.

### Figures are monospaced, without exception

`.tabular` = `font-mono` + `font-variant-numeric: tabular-nums`, and every hour
count, percentage, rate and differential in the workspace routes through it or
through `.stat-figure` / `.sheet-numeric`. A proportional font gives each digit its
own width, so a column of hours will not align no matter how it is padded. The
marketing page is excluded — that copy is display text, not data.

Decorative icons were removed where the text already carries the meaning: the `↗`
metric arrow, metric-card label glyphs, the sparkle beside the star performer, the
clock and trend icons on log badges, and the pencil and bin on Edit/Delete. Icons
that do something stayed: rail navigation, `+` on Add Task, and the external-link
glyph, which is the only signal that a link opens a new tab.

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

### Layout — rail plus drawer (`components/layout/app-shell.tsx`)

Three surfaces and nothing else:

| Surface | File | Behaviour |
| --- | --- | --- |
| Icon rail | `nav-rail.tsx` | Permanent `w-14`, `md:` and up. Brand mark `TP` at the top, four icon targets, the initials tile at the foot. **Always collapsed** — it never expands in place. |
| Expanded drawer | `nav-drawer.tsx` | Shadcn `Sheet`, `side="left"`, `w-72`. Same four destinations with labels, captions and count badges. Slides **over** the content. |
| Mobile bar | `mobile-bottom-nav.tsx` | Below `768px`, where a fixed rail would cost too much of a phone screen. |

The rail staying collapsed is the point: the content column keeps one width at
every viewport, so opening navigation never reflows the data grid. Open state is
held in React context (`nav-drawer-context.tsx`) because the header and the drawer
are siblings, not ancestor and descendant.

Counts come from `lib/layout/nav-counts.ts`, fetched by the guarded layout with
`{ count: 'exact', head: true }` — open tasks across the team, the member's own log
entries this month, milestones still in progress. A tally, not a payload.

Every rail target carries a `title` for the native tooltip **and** a visually
hidden label, since an icon names nothing to a screen reader. The **active target is
marked three ways at once** — forest text, bold weight, and a `:before` indicator
bar — so the state survives a colourblind reading and stays legible in the rail
where the label is hidden.

### One header per page (`components/layout/workspace-header.tsx`)

There is no shell-level header. Each page renders `WorkspaceHeader` with its own
`title`, `description` and `actions`. A layout cannot see its child's title or
actions, and threading them upward through context would be a lot of machinery to
avoid one prop — so a single row holds everything instead of stacking two bars.

Left to right: the `≡` drawer toggle, the page title and description, then the
global actions (**Log Hours**, notification bell) followed by whatever the page
contributes — **Recompute snapshot** on the dashboard, **Add Task** on tasks.

The old top-right cluster is gone, and with it the duplicate sign-out button that
lived in it. The global search field and its `⌘F` binding were also removed: the
task filter bar already searches the only searchable data, and a second field that
merely redirected to `/tasks?q=` was clutter.

**Add Task** is a `Link` to `/tasks?new=1` (`components/tasks/new-task-button.tsx`).
`TaskWorkspace` reads the parameter, opens the dialog and then `router.replace`s it
away. Simpler than shared state, and `/tasks?new=1` is deep-linkable. It renders
only for `managing_director` and `project_engineer`; the Server Action re-checks
regardless, because a hidden button is not access control.

### Account menu (`components/layout/user-menu.tsx`)

Two presentations, one component, selected by `variant`:

- `rail` — a monospaced two-character initials tile at the foot of the icon rail.
  Name, email and role appear nowhere in the shell; the expanded profile block the
  sidebar used to carry was deleted. They live in the dropdown, which is where
  someone looks when they actually want them.
- `row` — a wider trigger showing initials beside name over email, used in the
  drawer footer below 768px.

Exactly one of the two is reachable at any viewport, so there is still a single
route to Settings and Sign Out and no duplicate sign-out control in any header.

### Account menu — two bugs found and fixed

**Sign Out did nothing.** The menu item was a `<button type="submit">` inside a
`<form action={logout}>`, wrapped by `DropdownMenuItem asChild`. Radix closes the
menu when an item is selected; that state update flushes synchronously during the
click, the portal unmounts, and by the time the browser processes the click's
default action there is no form in the document to submit. Now the item calls
`event.preventDefault()` in `onSelect` and submits through a ref, so
`requestSubmit()` fires before the menu begins to close. Navigation items keep
`asChild` + `Link` — those work, and real anchors keep middle-click, copy-link and
the correct screen-reader announcement.

**No account menu existed below 768px.** `NavRail` is `hidden md:flex`, and the
consolidated header carries no profile trigger, so a phone had no route to Settings
or Sign Out at all. The drawer footer now renders `UserMenu variant="row"` behind
`md:hidden`, which keeps exactly one access point per viewport rather than two on
the desktop.

The dropdown holds name, email, role badge, employee ID, **Dashboard**,
**Profile & settings** and **Sign out**.

### Settings (`/settings`)

A real page, not a dead link — but a narrow one. Display name is the only editable
field, because migration `02`'s "Users can update their own profile" policy pins
`role` and `is_active` in its `WITH CHECK`; a form offering either would be
rejected at the database rather than in the UI. Email belongs to Supabase Auth and
is not wired up. `updateDisplayName` lives in `app/settings/actions.ts`.

`/settings` is also listed in `proxy.ts`'s `PROTECTED_PREFIXES`. Without that it
would have been guarded by the layout alone, one gate instead of two.

Settings is deliberately **not** in `NAV_ITEMS`. It is account business, reached
from the account menu; putting it in the rail would imply it is a workspace
section. `NAV_SECTIONS` and the old `MENU` / `GENERAL` groupings were removed
entirely.

---

## Vision & milestones — now database-backed

`04_milestones_and_vision.sql` retires `lib/milestones/content.ts`, which held the
vision, mission, values and five milestones as typed constants. Changing a vision
statement used to mean a code change and a deploy.

### Two tables

| Table | Shape |
| --- | --- |
| `company_statements` | `id`, `key_name` UNIQUE, `title`, `statement`, `subtext`, `updated_at`, `updated_by` |
| `company_milestones` | `id`, `title`, `description`, `status`, `owner_id`, `delivered_count`, `target_count`, `due_date`, `created_at` |

`key_name` is the stable handle the showcase selects by — `vision`, `mission`,
`core_values` — so renaming a title never breaks a query. It is deliberately not
editable through the UI: changing it would make a card vanish rather than change it.

**Core values are one row, not four.** Its `statement` carries one value per line in
`Name: description` form, parsed by `parseCoreValues`. That keeps the table to the
specified columns and the card to one Edit control; the trade is that ordering and
per-value metadata are not addressable. Splitting into a `company_values` table
would only change the parser.

**`owner_id` is a real foreign key**, so it can name a member but not a group. The
static content used labels like "Project Engineering" and "Whole team"; those are
now a null owner, rendered as "Whole team". An unresolvable id renders as "Former
member" rather than blank, which happens when `ON DELETE SET NULL` has not yet been
observed by a cached page.

Over-delivery is permitted — `delivered_count` may exceed `target_count`, because
hitting five of four is a real outcome. The progress bar clamps at 100%, since a bar
overflowing its track reads as a rendering fault rather than as good news.

### Security

`SELECT` for every authenticated member, `INSERT`/`UPDATE`/`DELETE` for
`managing_director` and `project_engineer` only, through the existing
`public.get_user_role()` helper. `MILESTONE_MANAGER_ROLES` in
`lib/tracker/enums.ts` mirrors the policy and is declared separately from
`TASK_MANAGER_ROLES` — the same two roles today, but "may reassign a task" and "may
rewrite the company vision" are different rights, and aliasing them would make
widening one silently widen the other.

Verified against a real PostgreSQL (PGlite) with 01-04 applied and `auth.uid()`
stubbed: 37 assertions covering structure, constraints, the `updated_at` trigger,
seed idempotency and per-role read/write behaviour for all three roles.

### UI

| File | Role |
| --- | --- |
| `app/(workspace)/milestones/page.tsx` | Server Component. Fetches, summarises, computes `canManage` |
| `lib/milestones/queries.ts` | Three parallel reads: statements, milestones, member directory |
| `components/milestones/schema-notice.tsx` | Shown when the tables are absent, i.e. `04` has not been applied |
| `components/milestones/organization-showcase.tsx` | Server Component. Vision, mission, values cards |
| `components/milestones/statement-editor.tsx` | Client island per card: Edit button plus its Sheet |
| `components/milestones/milestone-board.tsx` | Client. Owns dialog state and the delete confirmation |
| `components/milestones/milestone-checklist.tsx` | Presentational list |
| `components/milestones/milestone-dialog.tsx` | Create/edit Sheet |
| `app/milestones/actions.ts` | `updateStatement`, `createMilestone`, `updateMilestone`, `deleteMilestone` |

The reading path stays a Server Component, which is what every member hits; only
the editors ship JavaScript. The board holds dialog state centrally rather than per
row, so a list of goals mounts one editor and one confirmation instead of two
overlays each.

`canManage` decides only whether controls render. The actions re-check the role and
RLS checks it a third time, because a hidden button is not access control.

**A missing table renders a notice, not a 500.** `getMilestonesPageData` returns a
discriminated union — `status: 'ready'` or `status: 'schema-missing'` — and only the
narrow "table does not exist" case takes the second branch. Two codes identify it,
because the answer depends on which layer refuses first: PostgREST keeps its own
schema cache and answers `PGRST205` before a query is issued, while `42P01` is
PostgreSQL's `undefined_table`. Every other failure still throws, since degrading on
all errors would turn a broken policy into a page that quietly claims leadership has
written nothing.

This replaced a thrown error, which was the wrong call. It took the whole route down
with a 500 and stranded the visitor there with no header to navigate out of, to
report a setup step with one obvious fix. It also left `queries.ts` inconsistent with
`getNavCounts`, which has always degraded rather than failed.

Statement icons and core-value icons were dropped. They were decorative on cards
that already have headings, and the utilitarian pass removed that class of glyph
everywhere else. Values are numbered instead, which says "one of several" without
inventing a symbol for an idea like "Shared Ownership".

### Shared form primitives

`Field`, `LabeledSelect` and `FormError` moved to `components/ui/form-field.tsx`.
The task, milestone and statement editors all need the same label-hint-control
stack, and three private copies would have drifted the first time one changed.
`components/tasks/task-dialog.tsx` now imports them instead of declaring its own.
`components/ui/textarea.tsx` was also brought onto the token palette — it was still
carrying `border-slate-200` and a sky focus ring from the first design pass.

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
4. **Steering files are in the wrong place and two redesigns stale.** They sit in
   `steering/`, not `.kiro/steering/`, so Kiro does not auto-load them. Worse,
   `responsive-ui-design.md` still mandates the original sheet-faithful aesthetic —
   `border-slate-200` micro-borders, sky-tinted in-progress badges, a `17rem`
   sidebar — and `tech-stack.md` rule 2 says to implement it strictly. Both the
   soft-card pass and the current utilitarian pass overrode it on explicit
   instruction and neither updated the files. **A future phase reading those would
   revert the current UI.** Moving and rewriting them is recommended before the
   next visual change.
5. **Aggregates and filtering run in application code.** PostgREST has no
   `GROUP BY`; the grid fetches once and filters client-side. Both need to move to
   SQL with pagination as data grows.
6. **Settings holds one field, and the bell does nothing.** `/settings` can only
   change a display name — the RLS policy blocks the rest, as described above. The
   notification bell in the header is rendered and labelled but has no
   notifications table and no producer behind it.
7. **Milestone ownership and history are thin.** `owner_id` cannot name a group,
   core values are one text field rather than rows, and `company_milestones` has no
   `updated_at`, so milestone edits are not attributable. All three are noted where
   they are decided, in the migration and in *Vision & milestones* above.
8. **The editing drawers are not covered by the render audit.** Radix renders
   dialog content through `ReactDOM.createPortal` into `document.body`, and with no
   document on the server an open Sheet contributes nothing to the server HTML. The
   milestone and statement forms were verified by type checking and by build, and
   their controlled-select arrangement is the one already proven in the task
   dialog, but no test exercises their rendered markup. A browser-based test is the
   only way to close this.
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
