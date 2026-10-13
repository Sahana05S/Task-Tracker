# M11 — Dashboard, employee analytics, timelines and reports

Status: draft, not started. Required predecessors: M07, M08, M09.

## Outcome

Make all views present the same calculations, with clear period/as-of scopes and complete workbook chart/report coverage.

## Existing code and confirmed problems

Inspect lib/analytics/dashboard-charts.ts, lib/team/employee-charts.ts, team queries, report/support pages and timelines. Current charts can put a present fallback score at future month-end; period logs and current task totals differ; historical assignment/scale is inferred from present state.

## Implementation steps

1. Create shared view models for dashboard/team/member/report surfaces from the new engine. Label units, as-of date, rule version, date scope and eligibility consistently.
2. Render ten subscores with raw/median/delta/contribution drilldown and a clear zero/missing-data distinction. Display correct attendance/task productivity measures and fractional loading as percentages.
3. Complete employee daily performance for every member, progress/completion/loading/criticality trends and documentation/freshness distributions using dated evidence. Never fabricate future observations from current snapshots.
4. Use consistent multi-assignee filters/attribution. Operational task counts may include ineligible tasks but are distinguished from score populations.
5. Align Gantt bars with task dates, status, six-state freshness, undated tasks and approved dependencies/carryover. Missing dates require an explicit representation, not a fake real deadline.
6. Complete general and employee reports: today/yesterday task compilation, logs/raw links, attendance/effort, checklist sections, contribution records, award reasons and score factors.
7. Replace generic report snippets with the actual agreed report payload/export. If a WhatsApp-style report is needed, offer copy/export text; transmission is a separately authorized action.
8. Validate accessibility, responsive layouts, named inputs, empty/loading/error states and permissions. Ensure failed source reads do not disappear into0/empty charts.

## Data and interface contract

Every chart datum has period/asOf/source/ruleVersion provenance. Live report payload uses one CalculationResult and related operational records; frozen reports defer to M12. CSV/PDF/text export formats are selected by user need and preserve units, scope and visibility.

## Acceptance and verification

- [ ] Dashboard, team profile, report and award breakdown agree for identical context.
- [ ] No historical chart point is invented after today; a current snapshot is explicitly labelled.
- [ ] All six freshness states and ten factor comparisons are present where required.
- [ ] Multi-assignee filters show shared tasks; totals reconcile under the accepted credit rule.
- [ ] Empty/missing/error states are distinct and source failures remain visible.
- [ ] Report includes the agreed task/attendance/contribution details and respects role visibility.
- [ ] Keyboard navigation, readable selectors and mobile layout pass representative QA.

## UI / workflow integration

Reuse existing components and preserve public landing/milestone functionality. Give score drilldowns enough context for users to understand exclusions and periods without exposing implementation internals.

## Scope boundaries

Do not use present task state to invent historic daily values or introduce another chart-specific score engine. Do not add automatic messaging without a separate request.

## Decisions and rollout

D02/D03/D06/D13 affect presentation. Verify with seeded nonzero data and multiple roles; empty production pages are insufficient evidence of correct reports.

Use the shared definition of done in IMPLEMENTATION.md. Update STATUS.md with acceptance evidence, actual migration/revision, tests and limitations. Recheck predecessor contracts if their code has advanced. Planning proposals become authoritative only when confirmed in DECISIONS.md.
