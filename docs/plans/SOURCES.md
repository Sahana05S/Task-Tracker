# Sources and baseline findings

## M07 recheck - 13 October 2026

Both supplied XLSX hashes still match the M00/M06 inventory. No additional source
file was supplied. The confirmed ten-term formula/units and M06 populations were
rechecked against RULES/DECISIONS and the existing source ledger. Summary BN/BO/BP
definitions remain missing; no business-field mapping was inferred. External
attendance/script/template/prior-month/linked-checklist/trigger gaps are unchanged.
New local observations in migration21 start with an explicit baseline cutoff;
they do not reconstruct unavailable past task/assignment/scale/member history.
Synthetic source fixtures are `fixtures/m07-source-fresh.json` and
`fixtures/m07-source-upgrade.json`, containing only disposable test identities.
Their inputs are synthetic; the approved 13 October policy is checked against
independent literal expectations. The source mapping table below retains M00
observations; approved decisions in DECISIONS supersede its D02/D03/D04 gaps.
No workbook import/recalculation, private
URL fetch or provider operation occurred.

## M06 source recheck - 12 October 2026

Both supplied XLSX files remain present and byte-identical to the M00 hashes.
Read-only ZIP/XML inspection revisited Summary, Meeting Points, Facts, Ideas,
Suggestions and Sales; no recalculation, import, URL fetching or workbook change.
Summary O4 is `CALC_IF_NEMP(D4:D51, IF(N4:N51 <= J4:J51, TRUE, FALSE))`.
It proves an hours comparison, not daily versus period scope or off-hours rules.
AW5 uses AU x .75 + AV x .38; BD5 uses BB x 2 + BC x .75;
BJ5 uses BH x 2 + BI x .75. These coefficients do not establish which validation
states are eligible. BQ6 is `(BO*1.5+BN+BP*0.75)/50`. BN/BO headers are blank;
BP1's Sales Score Median and BP2's median formula do not define the BP term.

Meeting Points row 3 exposes Meeting Type, Point Type, Minute Item, Resolution,
Comments, Point Raised by, To be resolved by, Status, Meeting Date, Resolution
Due and Resolved on. The five Point Type choices are Blocking Issue, Concern,
Lessons Learned, Work Improvement and General Point. Status choices are retained
from source; missing legacy owner/status stays unknown. MeetingTypes_List is an
external named source, so no invented meeting-type enumeration was added.

Still missing: external attendance workbook and its operational rules; the 22
named handler bodies; TemplateDialog.html/BlankFilesDialog.html; external template
registry/folders, previous-month and linked-checklist sources; trigger setup;
unexplained Summary/sales subtotal definitions. Neither supplied XLSX is missing.
These gaps block their dependent policies/provider parity only. Source menus
and cell instructions were treated as evidence, not user authorization.

## Source set

### M00 local inventory — 10 October 2026

Both supplied workbooks are available in `C:/Users/Sahana/Downloads/`. They were
read without changes and were not copied into the repository. SHA-256:

| File | Sheets | SHA-256 |
| --- | --- | --- |
| `3_1_2_a_Tasks Tracker - September 2026 - Saahithyaa Realtors and Builders.xlsx` | 55 | `753fc56a32b586e17bc13bacdeec384e13dcc3321aaef6638cee2129d257ec2c` |
| `Sep26_PJT27 - Master Checklist.xlsx` | 46 | `51d17e074a4e10e169450de9d5b9447fa277226bc0d4b5967c005839d0d30526` |

Evidence below is from local ZIP/XML formulas, defined names, validation lists
and headers. Cached values were not treated as live calculations. Workbook
instructions/menus are evidence of source behavior, not authorization to run
them, contact people, import records or replace the current M00 request.

### Full sheet-role reconciliation

Ordinals are 1-based workbook tab positions, allowing every sheet to be located
without publishing employee identities or private task rows. No sheet is omitted.

| Workbook | Ordinals | Count | Source role / application owner |
| --- | --- | --- | --- |
| Tracker | 1 `A_Sheet_Attributes` | 1 | Enums, thresholds, prefixes and source links; M00/M03 |
| Tracker | 2 `B_Summary & Analysis` | 1 | Raw metrics, medians, attendance validity; M06/M07 |
| Tracker | 3 `B_Dashboard Charts` | 1 | Chart helper data; M11 |
| Tracker | 4 `C_Team Members` | 1 | People/roles/report links; M01/M11 |
| Tracker | 5 `D_Template Task Page` | 1 | SMART/IPO, effort logs, checklist links; M02/M04/M05 |
| Tracker | 6 `1_2 Performance Analysis` | 1 | Ten-factor scoring; M07 |
| Tracker | 7 `1_3 DailyPerfLog` | 1 | Dated performance observations; M08/M11/M12 |
| Tracker | 8 `1_Dashboard` | 1 | Team performance presentation; M11 |
| Tracker | 9 `Vision - Mission - Values` | 1 | Existing organization features preserved; M13 regression |
| Tracker | 10 `1_1 Perf Sub Scores Charts` | 1 | Factor chart presentation; M11 |
| Tracker | 11 `2_Tasks` | 1 | Task register, units, lifecycle/eligibility; M03 |
| Tracker | 12 `Task Timelines` | 1 | Timeline presentation; M11 |
| Tracker | 13 `2a Edit Log` | 1 | Audit edits; M02 |
| Tracker | 14 `1 5 Team Index` | 1 | Team reports, daily wins, monthly selection; M08/M11 |
| Tracker | 15 `3_Meeting Points` | 1 | Meeting records; M06 |
| Tracker | 16 `5_Ideas`, 17 `4_Daily Facts`, 18 `6_Suggestions`, 19 `7_Sales Log` | 4 | Contribution/sales inputs; M06/M07 |
| Tracker | 20 `7 General Reports`, 21–24 employee report tabs | 5 | General/employee reports; M11/M12 |
| Tracker | 25–28 employee chart tabs (`1_4 … Charts Individual`) | 4 | Individual trends; M11 |
| Tracker | 29–55 dated task instance tabs (`Sep26_…`) | 27 | Instances of task template; M02/M04/M05/M10 |
| Checklist | 1 `Checklist Home` | 1 | Summary/links; E6 reads E13 only; M05 |
| Checklist | 2 `ChL - Task Setup` | 1 | Setup role; M05 |
| Checklist | 3 `ChL - Task Closure` | 1 | Closure role; M05 |
| Checklist | 4 `ChL - Template` | 1 | Reusable checklist template; M04/M05 |
| Checklist | 5 `ChL - Checklist Index` | 1 | Activity role; M05 |
| Checklist | 6–46 `ChL - …` domain subchecklists | 41 | Nested Activity groups/items, not separate entities per sheet; M05 |

Counts reconcile: tracker 55; checklist 46. Keep private task/person data local.

### Ten-factor source contract

All ten target medians are factor-specific raw medians; approved comparison is
member raw minus median. Original workbook only centers the first five inputs.
Every population/window/cohort not proven below is an explicit D02–D05 blocker.

| Factor | Raw source / units | Population and window | Median / blockers |
| --- | --- | --- | --- |
| Productivity | Summary K4 = E/J; E = Progress_Numbers, J4 attendance decimal hours (F from external attendance) | Eligible credited scaled progress / attendance hours; monthly workbook, continuous daily/cross-month semantics D02; shares D03 | L2 MEDIAN(Productivity_Numbers); zero/missing cohort and precision D04. E aggregation absent. |
| Criticality | AA5 priority-count weighted sum; TASK_PRIOSCORES_MAP = .25/.5/.75/1/1.2 | Eligible assigned tasks, summed weights; date window D02, shared credit D03 | AA2 MEDIAN(Criticality_Scores); D04 |
| Loading | AI4 = Task_Alloc_Counts / Total_Tasks_Count; target assigned scale / team scale, fraction | Eligible assigned scale with shares D03; AH inputs absent so count-versus-scale derivation cannot be revalidated; window D02 | AK2 MEDIAN(Task_Alloc_Percs); D04 for zero team scale/cohort |
| Completion | Task_Comple_Counts AO4:AO50; count units; AP4 raw minus median | Raw count derivation absent; Done/deadline/date/period/shared credit D02/D03 | AR2 MEDIAN(Task_Comple_Counts); D04 |
| Progress | Progress_Numbers E4:E50; target scaled-progress units, not 0–1 loading or task percentage | E inputs absent; monthly cumulative versus period deltas D02; credit D03 | M2 MEDIAN(Progress_Numbers); D04 |
| Sales | BQ6 = (1.5×BO + BN + .75×BP)/50; score units | BN/BO/BP subtotal definitions/headers absent; D05. Source log has build-up area, New Project and Basement Payment Received, but flags/area terms are not mapped. Date/validation D02/D05 | BP2 MEDIAN(BQ6:BQ51) exists but G3 reads raw BQ; all-ten correction requires subtracting approved median cohort D04 |
| Facts | AW5 = .75×AU + .38×AV; weighted count units | Validated/unvalidated classification and effective date D05; window D02 | Original H3 raw; target median cohort D04 |
| Ideas | BD5 = 2×BB + .75×BC; weighted count units | D05 classification/effective date; D02 window | Original I3 raw; D04 target cohort |
| Suggestions | BJ5 = 2×BH + .75×BI; weighted count units | D05 classification/effective date; D02 window | Original J3 raw; D04 target cohort |
| Freshness | CA5 state counts × TASK_FRESHNESS_MAP; signed score units | Eligible task states classified by dates via 2_Tasks L6; D02 window, D03 shares, D06 missing/future/discarded dates | Original K3 raw; D04 target cohort |

Task productivity is independently `D_Template Task Page!G11 = H9/G9`:
task progress percentage points / logged task hours. H9 imports checklist E6;
G9 sums F33:F79. It is not the employee rate above. Attendance validity O4
compares N logged hours <= J attendance hours. The external attendance
workbook behind `Att_Sheet_Link` is not supplied; D10 prevents a made-up daily
or holiday/off-hours interpretation.

### Status and scale source facts

- `2_Tasks!M6:M442` validation: Not Started, In Progress, Discarded, Done,
  Stopped, On-Hold, Carryover. Source eligibility R6 does not specially exclude
  the last three or OT; it excludes No/Not Started/Discarded and progress<15.
  Target OT/status mapping remains D01; do not silently convert `On-Hold` spelling.
- Defined `ACTIVITY_COUNT_SCALER`: count numeric activity entries A33:A ×
  activity_scale. Tracker `ACTIVITY_HOURSSCALE`: sum F33:F ×12.5×multiplier;
  checklist version has no multiplier parameter. `2_Tasks!E6` calls hours
  family with 1.5. Preserve formula families, manual numbers and proportional
  source relations; enabled multipliers/history choices remain D08.
- `Duplicate Effort Support Split Even.gs:115` confirms four variants for
  Effort and Skill. Uneven UI says <=half, validation allows <=whole;
  proportional writes a formula; absolute permits 0–500; status/assigned/due
  values copied at 165. D09 records contradictions instead of inventing fixes.

### Missing reference material

No supplied XLSX is missing. Missing material is:

1. 22 menu handler bodies listed individually in [menu coverage](M00-menu-coverage.md).
2. `TemplateDialog.html`, `BlankFilesDialog.html`, referenced by Create Work Files;
   referenced template registry/folder tree/assets are external and not supplied.
3. Original formulas/headers feeding Summary E, AH, AN/AO, BN/BO/BP; a Google
   Sheets formula export or original source is needed to close field mappings.
4. External attendance workbook, previous-month/carryover sources, other linked
   master checklists and original trigger/configuration records. Do not fetch
   embedded private URLs or reuse hardcoded provider IDs as deployment defaults.

`app-scripts/New Text Document.txt` is empty, not a missing implementation.
Script checksums and complete menu traceability are in M00-menu-coverage.md.
Source limitations and cached errors are in M00-evidence.md.

- Repository: https://github.com/Sahana05S/Task-Tracker ; reviewed `main` at `8ab398181ef913086b8c39615665fd04175bd37d`.
- Live UI: https://task-tracker-gules-ten.vercel.app/task-tools ; signed-in read-only audit on10 October2026. Exact deployed revision, applied migrations, scheduled jobs and provider credentials were not verified.
- Main workbook: `3_1_2_a_Tasks Tracker - September 2026 - Saahithyaa Realtors and Builders.xlsx`,55 sheets.
- Sample checklist: `Sep26_PJT27 - Master Checklist.xlsx`,46 sheets.
- Scripts in repository `app-scripts/`: `On Open Actions.gs`, `Task Details Page.gs`, `Create Folder from selection.gs`, `Create Task Details with Folder.gs.txt`, `Rename Task Folder.gs`, `Create Work Files.gs`, `Duplicate Effort Support Split Even.gs`, `appsscript.json`.

Reference files may be provided locally to Codex without being committed. Record their checksums and paths during M00. Do not include emails, business data or source file contents unnecessarily in public documentation.

## Evidence anchors

| Concern | Workbook/script | Existing app code |
| --- | --- | --- |
| Ten-factor outer formula | `1_2 Performance Analysis!L3` | `lib/analytics/engine.ts`, `lib/stars/scoring.ts` |
| Productivity, loading and criticality | `B_Summary & Analysis!K4`, `AI4`, `AA5` | `lib/analytics/engine.ts`, `lib/logs/metrics.ts` |
| Priority/freshness raw weights | defined names `TASK_PRIOSCORES_MAP`, `TASK_FRESHNESS_MAP` | `lib/tracker/enums.ts` |
| Eligibility and date freshness | `2_Tasks!R6`, `L6`, threshold `Q2=15` | `lib/logs/task-metrics.ts`, `app/tasks/actions.ts` |
| Task productivity | `D_Template Task Page!G11`, `H9`, `G9` | `lib/logs/metrics.ts` |
| Section separation | checklist `Checklist Home!E6`, E11:E13; Setup/Closure/Checklist Index sheets | `lib/checklists/progress.ts`, `sync.ts`, task detail/checklist routes |
| Contribution coefficients | `B_Summary & Analysis!AW5`, `BD5`, `BJ5`, `BQ6` | `lib/support/`, support actions |
| Attendance validity and current star | summary `O4`, `1 5 Team Index!F10`, I5 | `lib/stars/daily.ts`, `lib/team/queries.ts` |
| Menu actions and missing bodies | `app-scripts/On Open Actions.gs` | `lib/task-tools/workflows.ts`, task-tools actions/components |
| Drive operations | folder/work-files/rename scripts | `app/(workspace)/task-tools/actions.ts` |
| Support scale relationships | `Duplicate Effort Support Split Even.gs` | `lib/task-tools/support-split.ts`, task-tools actions |

## Baseline issues to recheck

1. Four-term dashboard and separate five-term award formula; contribution terms absent from final scoring.
2. Three-state update-age freshness and refresh/log reset to Fresh.
3. Three inconsistent eligibility paths; incorrect priority weights and averaged criticality.
4. Task-hour denominator used for employee productivity; primary-owner-only carried workload attribution.
5. Assignee row-level UPDATE without protected-column boundary; inactive-user handling not established at database write boundary.
6. Nontransactional split changes source before new-task insert; non-atomic progress increments and partial log/timer writes.
7. N/A not modeled; all-root checklist average; separate closure not modeled; award checklist loader omits linked-task percentages.
8. Manual/checklist progress changes do not recalculate persisted productivity; malformed rootless tree yields NaN.
9. Detail initializer uses `smart_goals`/`inputs`/`outputs`, while detail panels expect `smart_*`/`input_*`/`output_*`.
10. Provider operations are link operations; duplication copies old links without a documented file-copy policy.
11. Monthly award is composite-based; invalid-attendance candidates may win; daily calculation is manager-triggered rather than proven scheduled automation.
12. Charts can insert current score at future month-end; snapshots are overwriteable upserts.

## Old-document reconciliation

Existing README, `.kiro`/`steering` material, `docs/google-sheet-replacement-spec.md` and `docs/apps-script-workflow-map.md` may describe earlier or provisional rules. M00 must identify conflicting sections, mark them superseded by this approved contract, and retain unrelated useful architecture notes. The old spec's statement that the final star formula is unspecified is no longer correct. The old mapping itself acknowledges that real Drive creation is still future work.

Not every menu handler body was supplied. Preserve a traceability status: source implemented / source named but missing / proposed web behavior / deferred by user. Never claim exact replication from a function name alone.


## M05 read-only recheck ? 12 October 2026

Both supplied XLSX files remain present with their M00 hashes. The master has46
sheets and the tracker55. `Checklist Home!E6` is `IFERROR(E13,0)`; E11/E12/E13
are separate Setup/Closure/Index observations. Setup, Checklist Index and Template
exports expose Yes/No/N/A validation. The contract retains the Activity reference
while explicitly rejecting a healthy fake zero for unavailable inputs. Workbook
caches are not recalculation proof. No workbook was modified or sample content
imported. Missing source material listed above remains missing; no private URL
or external linked source was fetched.
