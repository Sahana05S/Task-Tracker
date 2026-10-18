# TaskPulse code layout

This explains where code lives and the rules that keep features independent.
It is enforced by `__tests__/architecture/boundaries.test.ts`, which runs with
`npm test`.

## The idea in one line

Every feature lives in one folder under `modules/`. Other code talks to it only
through its public files. Everything else in the folder is private.

```
app/            Routing only. Pages read through a module's index.ts, render its
                components and submit to its actions.ts.
modules/<name>/ One feature: its rules, data access, actions and UI.
shared/         Small common kernel every module may use.
types/          Generated database types and shared domain types.
supabase/       Migrations (one numbered sequence; never rewritten).
```

## Inside a module

```
modules/tasks/
  README.md      What it does, public API, tables/RPCs it owns
  index.ts       PUBLIC  server-side reads + types
  actions.ts     PUBLIC  'use server' commands
  client.ts      PUBLIC  types and pure helpers for 'use client' components
  components/    PUBLIC  the module's UI
  internal/      PRIVATE queries, commands, rules, permissions, input, mappers
  __tests__/
```

Public functions are short and read like a recipe; each step is a private
function that does one job:

```ts
// modules/tasks/actions.ts (public)
export async function createTask(_: TaskActionState, form: FormData) {
  const actor = await resolveActor();                 // shared/session
  if (!actor.ok) return failure(actor.error);
  const input = parseTaskInput(form);                 // internal/input
  if (!input.ok) return failure(input.error);
  if (!canManageTasks(actor.profile.role)) return failure(NOT_ALLOWED); // internal/permissions
  const result = await insertTask(input.value);       // internal/commands
  revalidateTaskViews();                              // internal/cache
  return result;
}
```

Start from `modules/_template/` when creating a module.

## Rules

1. **Never import another module's `internal/`.** Use its `index.ts`,
   `actions.ts`, `client.ts` or `components/`. Need something that isn't public?
   Add it to that module's public file deliberately.
2. **`shared/` depends on nothing in `modules/`, `lib/`, `components/` or `app/`.**
   If code needs a module, it isn't shared.
3. **Pages, route handlers and components don't call `.from()` or `.rpc()`.** Data
   access lives in a module's `internal/`. The test keeps a shrinking list of
   files that still do (`LEGACY_DIRECT_DB`); remove a file from it once it is clean.
4. **Dependencies point one way:** `shared` <- domain modules <- view modules
   (`workspace-views`) <- `app`. No cycles between modules.
5. **The database stays the real permission boundary.** Checks in `permissions.ts`
   give friendly messages; RLS/RPC checks enforce them (see AGENTS.md).
6. **Client components, and pure helpers they use, import only `client.ts` or
   `components/`** so server code never lands in the browser bundle. `index.ts`
   re-exports `client.ts`, but importing it pulls in server reads; `npm run build`
   fails if that reaches a client component.

## Shared kernel

| Path | Use it for |
|---|---|
| `shared/supabase/` | `server.ts`, `client.ts`, `worker.ts` Supabase clients, session middleware |
| `shared/session/` | `getCurrentProfile`, `requireProfile`, `requireRole`, `resolveActor` |
| `shared/forms/form-data.ts` | `readString`, `readNullableString`, `UUID_PATTERN`, `ISO_DATE_PATTERN` |
| `shared/time/kolkata.ts` | `kolkataDate()`, the business time zone |
| `shared/commands/` | Command results and idempotent operation ids |
| `shared/tracker/` | Common enums and display formatters |
| `shared/ui/` | Buttons, inputs, dialogs (shadcn components) |
| `shared/utils.ts` | `cn()` class-name helper |

## Module map

| Module | What it owns | Was in | Status |
|---|---|---|---|
| auth | Login, sign-out, redirects, protected routes | lib/auth, app/auth, app/login | Moved |
| organizations | Companies, per-company settings, onboarding (M15) | migrations 39-40 TS code | To do |
| tasks | Tasks, participants, shares, details, Task Tools | lib/tasks, lib/task-tools, components/tasks | Moved |
| checklists | Nested checklist pages, item time, progress | lib/checklists, components/checklists | Moved |
| time-tracking | Work logs and timers | lib/logs, lib/timers, components/logs | To do |
| attendance | Attendance and holidays | lib/attendance | Moved |
| support | Knowledge, sales logs, dated records | lib/support, components/support | Moved |
| milestones | Milestones, statements, goals | lib/milestones, components/milestones | Moved |
| team | Employees and profiles | lib/team, components/team | To do |
| scoring | Ten-factor performance engine, analytics, stars/awards | lib/performance, lib/analytics, lib/stars | To do |
| reports | Live reports, exports, month close | lib/presentation, lib/month, components/reports | To do |
| drive | Google Drive integration (deferred by user) | lib/integrations/drive | Moved |
| workspace-views | Dashboard, Today, Timelines, nav counts | lib/today, lib/timelines, components/dashboard | To do |
| marketing | Public landing page | lib/marketing, components/marketing | Moved |

## Git workflow

- `refactor/base` is the integration branch for this refactor (cut from
  `m13-verification`, which is ahead of `main`).
- One short-lived branch per module (`refactor/<module>`), cut from
  `refactor/base` and merged back once typecheck, tests and build pass.
- After the refactor, feature work follows the same pattern: one short branch per
  change, named after the module it touches (`tasks/...`, `scoring/...`).
- Nothing is merged into `main` or deployed without the owner's go-ahead.
