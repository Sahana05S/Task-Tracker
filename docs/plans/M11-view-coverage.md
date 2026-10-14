# M11 workbook view coverage — 13 October 2026

The source inventory is the workbook sheet map in SOURCES.md (tracker sheets
6–8, 10, 12, 14, 20–28). Both originally supplied workbooks remain available.
This is functional coverage of the established native contracts, not a visual
copy of workbook tabs or a claim of browser certification.

| Reference / workflow | Previous issue | M11 coverage and evidence | Remaining boundary |
| --- | --- | --- | --- |
| Performance Analysis / factor charts (6, 10) | Weak context and source drilldown; factor units easily confused | Shared M07 CalculationResult; ten-factor raw/median/delta/coefficient/contribution table, cohort/source details, exact 6-decimal factor and 2-decimal final display, explicit subtotal/eligibility | Missing sales mapping and legacy provenance remain unavailable |
| DailyPerfLog (7) | Current task state reconstructed past loading/completion; future dates possible | Dated M07 month-to-date contexts, clipped to as-of/local elapsed days; null gaps remain null; keyboard-accessible value tables; certified retained M08 history remains a distinct observation source | No backfilled history before available-from; native browser QA pending |
| Dashboard (8) | Current task state mixed with historical scoring; misleading progress denominator labels | Shared month/as-of selector; M07 performance/median and loading views; statuses, priorities, categories, assignment counts, credited progress, completion dates/deadline outcomes; M08 award context | Operational counts are distinct from metric populations; visible log hours are scoped details, not an invented team total |
| Team Index (14) | Independent contexts; other employees' restricted hours looked like zero | Context retained in profile/report links; known-value factor results; M08 effective win counts; restricted detail-hour cells visibly unavailable | Current support-index counts are separately labelled; saved records retain original context |
| Employee reports/charts (21–28) | Legacy daily formulas, shared-credit blanket suppression and current score fallback | Every employee UUID uses the same model; captured shares/period earnings; performance, productivity, progress, completion, loading, criticality dated trends; category/priority/status/documentation/six-state freshness and unavailable distributions | Unknown historical titles/section state are explicitly unavailable; no retrospective attribution invention |
| Task Timelines (12) | Missing/backwards deadlines became fake one-day bars | True assignment/deadline intervals, all assignees, status/six freshness states; explicit undated task list; retained dependency/carryover references and stable task-tag links | Relationship/title history begins at M11 baseline; shared tasks repeat as assignment bars |
| General Reports (20) / employee reports (21–24) | Saved report editor without compiled live evidence | Live period/as-of report; task/current-progress versus period-credit distinction; today/yesterday logs; hours/attendance day validity/reasons; recorded Setup/Activity/Closure rollup; contributions/review state; M07 scores/M08 context; raw/manual asset links | General member detail rows are own-only; historical effective award revision may be unavailable if later ledger revisions exist |
| Copy / download | No shared scoped live payload | Human-readable text copy/download, JSON and exact factor CSV; authenticated API plus scoped PostgreSQL RPC; CSV formula escaping; private/no-store responses | No PDF export, messaging or provider operation claimed |
| Live / frozen | New calculations risked implying archive replacement | Explicit live labels, retained reports/snapshot counts separately labelled with original rules; legacy dashboard recompute control removed; migration/report equality checks | Existing Server Action close/revise behavior requires M12 review; M12 is not started |
| Drive / native task workflows | Provider absence could block core tracker | Existing manual links usable; all provider automation remains explicitly deferred/disabled; native task/checklist workflows preserved | Credential/root/provider/browser verification deferred by user |

Checks: independent model/export/API denial/server-rendered markup tests and real
disposable PostgreSQL fresh/upgrade tests. Server markup checks are not signed-in
browser, keyboard interaction, responsive rendering or GoTrue/PostgREST checks.
