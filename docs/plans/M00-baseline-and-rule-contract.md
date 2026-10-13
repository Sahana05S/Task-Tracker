# M00 — Baseline and rule contract

Status: In progress — independent work complete on 10 October 2026; source and
decision-dependent contract items remain pending. Required predecessors: None.

## Outcome

Establish one traceable, executable business specification before further implementation. Reconcile the workbook, scripts, current code and user corrections; distinguish known defects from missing product choices.

## Existing code and confirmed problems

Read RULES.md, SOURCES.md, the current branch and existing README/docs/steering files. The reviewed commit passes233 unit tests and typecheck despite business mismatches. Repository migration state does not prove deployed database state.

## Implementation steps

1. Inventory routes, command paths, migration history, tests, scheduled jobs and integrations. Record current local/repository commit; determine deployed commit and applied migrations if access permits.
2. Extract formula references, named ranges and menu actions from the supplied sources. Map all55 tracker sheets and46 checklist sheets by functional role rather than implementing one table per sheet.
3. Complete field mapping for sales, completion, attendance validity, status options and scale formula families. Record missing Apps Script bodies explicitly.
4. Resolve only the necessary decisions in DECISIONS.md. Preserve already confirmed choices; document cross-month/as-of semantics and multi-assignee credit with worked examples.
5. Create independent fixtures from business rules, not by calling the current implementation to generate expected values. Include score-input fixtures, task/attendance/contribution source fixtures and all edge boundaries.
6. Define permission matrix, numerical precision, rule version and migration compatibility approach. Add traceability IDs linking each rule to module/tests.
7. Mark conflicting formulas in older docs superseded. Identify the existing build/test configuration and create a reproducible QA baseline without production mutations.

## Data and interface contract

Deliver a versioned rule contract, source inventory, decision records, fixture schemas and permission matrix. Fixture factor inputs must identify units/cohort/as-of date. Record source references rather than copying private workbook rows into the repo.

## Acceptance and verification

- [x] Each score factor has a named raw source, unit, population, date window and median rule or an explicit blocking decision. SOURCES ten-factor table maps all ten; D02–D05 identify absent inputs/cohorts/windows.
- [x] All ten outer coefficients reconcile to the confirmed formula; loading0.05 contributes2.0 before other terms, not200. 48 independent fixture cases pass consistency verification, including ten isolated coefficients, full raw cohorts and date boundaries.
- [x] Every menu action has an implementation/source/deferral status. Missing handler bodies are not marked replicated. M00-menu-coverage has 34 rows: 12 bodies supplied, 22 missing; no user deferrals invented.
- [x] Baseline test/typecheck/build results are reproducible or their exact environmental blocker is documented. 233 tests, typecheck and build pass locally; clean install, DB, browser, provider/native workbook and deployed verification limits recorded.
- [x] The module checklist names the decisions that block later work; unrelated modules remain executable. DECISIONS preserves all proposals, requests only D03 and M01's D13 subset next; M01 remains not started.

## Completion evidence for the authorized independent work

- [M00 evidence](M00-evidence.md): revision, local inventory, F01–F13 rule
  comparisons, historical-document conflicts, data quality, check limitations.
- [SOURCES](SOURCES.md): checksums/paths, complete 55/46 sheet-role mapping,
  field units/anchors, missing input/formula/dialog/source list.
- [Menu coverage](M00-menu-coverage.md): all 34 actions, current native gaps,
  missing bodies, module owners and script checksums.
- [Permission/compatibility draft](M00-permissions.md): existing boundary,
  protected fields, proposed actor rights, numerical/migration approach.
- [Fixtures](fixtures/README.md): 48 fixed expectations; 23 blocked examples;
  executable standard-library consistency verifier, no app imports or changes.
- [DECISIONS](DECISIONS.md#smallest-next-decision-set): two questions with worked
  examples/recommendations. No unresolved rule promoted to approved.

These checkboxes accept the independent planning deliverables only. M00 is not
marked Verified: complete source reconstruction, final cohort/window/precision
and discretionary rights need later decisions/material. Database and provider
conformance have not been tested. No production rule version is activated.

## UI / workflow integration

No UI change required. Produce a readable feature-coverage matrix and data-quality inventory for existing records.

## Scope boundaries

No production schema changes, data imports, formula switches or provider access changes in this planning/baseline module.

## Decisions and rollout

Resolve D01–D13 incrementally. Confirm deployment facts independently; do not assume the reviewed main branch is live.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.
