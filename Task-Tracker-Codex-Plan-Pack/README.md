# Task Tracker: Codex implementation plan pack

Draft v1 — 10 October 2026. Planning files only; no application code, database or deployment has been changed. Prompts are intentionally deferred.

## Install into your repository

1. Extract this archive outside your repository first.
2. Copy `PLAN.md` and `IMPLEMENTATION.md` to the repository root. Copy `docs/plans/` into the existing `docs/` directory.
3. Review `AGENTS.md` before placing it at the repository root. If an AGENTS.md already exists, merge these project rules into it instead of overwriting it. This file gives Codex standing project guidance; it is not a skill.
4. Do not replace your existing repository README with this package README.
5. Keep the source workbooks and Apps Scripts available to Codex. `docs/plans/SOURCES.md` identifies them. Do not commit private business data merely to make a reference available.
6. Start with Module M00. Record decisions in `docs/plans/DECISIONS.md`; then implement one ready module at a time. We will write the execution prompts separately.

## Files and their jobs

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Standing instructions Codex should follow in this repository. |
| `PLAN.md` | Overall goal, module order, dependencies and release boundaries. |
| `IMPLEMENTATION.md` | Practical workflow, architecture conventions and definition of done. |
| `docs/plans/RULES.md` | Confirmed business rules, units and unresolved boundaries. |
| `docs/plans/DECISIONS.md` | Choices that must not be invented by Codex. |
| `docs/plans/ACCEPTANCE.md` | Independent numerical examples and workflow/security tests. |
| `docs/plans/SOURCES.md` | Evidence, existing file paths and old-document conflicts. |
| `docs/plans/STATUS.md` | Progress, validation evidence, blockers and handoff record. |
| `docs/plans/M00-...md` through `M13-...md` | Complete module-level implementation plans. |

## Draft boundaries

Confirmed rules are separated from proposed architecture and open product decisions. An unresolved decision blocks only the affected behavior; Codex should continue independent work. Optional external integration must not delay correction of core calculations. A passing test suite is necessary but is not evidence of workbook parity by itself.

Code baseline reviewed: `Sahana05S/Task-Tracker`, `main`, commit `8ab398181ef913086b8c39615665fd04175bd37d`. Recheck the branch before implementation because it may have advanced. The exact deployed commit and applied migrations have not been established.
