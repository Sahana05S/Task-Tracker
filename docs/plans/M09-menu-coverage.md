# M09 menu coverage - 13 October 2026

All34 supplied On Open Actions menu items are accounted for:12 handler bodies
are supplied and22 are missing. The later three answers approve native replacement
parameters for phases, copying, support and archive. Current classifications are
19 implemented/verified portable native commands,5 partially implemented,
9 source-handler-missing and1 user-approved historical-import deferral.
Native verification does not certify original missing-handler/provider equivalence,
installed Supabase grants or signed-in browser behavior. M00 remains a historical
inventory. See [M09 evidence](M09-evidence.md) for exact tests/limitations.

| # | Menu action / handler | Body | Classification | Native implementation / gap |
| --- | --- | --- | --- | --- |
| 1 | Run Timer / `runTimer` | Missing | Source handler missing | M02 native authorized timer; original timer body missing. |
| 2 | Stop Timer / `stopTimer` | Missing | Source handler missing | M02 native retained stop/segments; source stop body missing. |
| 3 | Enter Time in Minutes and Hours / `enterTimeInMinutesAndHours` | Missing | Source handler missing | M02 measured manual hours; original minutes/hour handler missing. |
| 4 | Weekly Phases / `createWeeklyPhases` | Missing | Implemented and verified (portable commands) | Approved native weekly count/seven-calendar-day phases, explicit dates and atomic commits; source body missing. |
| 5 | Day Count Phases / `createDayCountPhases` | Missing | Implemented and verified (portable commands) | Approved native calendar-day/count phases and atomic commit; source body missing. |
| 6 | Task for All / `duplicateTaskForAllTeamMembers` | Missing | Implemented and verified (portable commands) | Approved native one independent task per active member; captured membership fingerprint; source body missing. |
| 7 | Number and Suffix / `duplicateTaskWithSuffix` | Missing | Implemented and verified (portable commands) | Approved native count/title-suffix copies and concurrent unique tags; source body missing. |
| 8 | Create Task Details Page / `createTaskDetailswithFolder` | Supplied | Partially implemented | M04 native details/template instance; actual folder creation unavailable (M10). |
| 9 | Rename Task Folder / `renameTaskFolder` | Supplied | Partially implemented | Native link-label rename only; actual Drive folder rename unavailable (M10). |
| 10 | Split Even / `duplicateEffortSupportSplitEven` | Supplied | Implemented and verified (portable commands) | All8 approved Effort/Skill and Even/Uneven/live Proportional/Absolute variants; precise bounds, reset inheritance, atomic rollback/retries/source versions and retained credit verified. |
| 11 | Split Uneven / `duplicateEffortSupportSplitUneven` | Supplied | Implemented and verified (portable commands) | All8 approved Effort/Skill and Even/Uneven/live Proportional/Absolute variants; precise bounds, reset inheritance, atomic rollback/retries/source versions and retained credit verified. |
| 12 | Proportional Support / `duplicateEffortSupportProportional` | Supplied | Implemented and verified (portable commands) | All8 approved Effort/Skill and Even/Uneven/live Proportional/Absolute variants; precise bounds, reset inheritance, atomic rollback/retries/source versions and retained credit verified. |
| 13 | Absolute Scale Support / `duplicateEffortSupportAbsolute` | Supplied | Implemented and verified (portable commands) | All8 approved Effort/Skill and Even/Uneven/live Proportional/Absolute variants; precise bounds, reset inheritance, atomic rollback/retries/source versions and retained credit verified. |
| 14 | Split Even / `duplicateSkillSupportSplitEven` | Supplied | Implemented and verified (portable commands) | All8 approved Effort/Skill and Even/Uneven/live Proportional/Absolute variants; precise bounds, reset inheritance, atomic rollback/retries/source versions and retained credit verified. |
| 15 | Split Uneven / `duplicateSkillSupportSplitUneven` | Supplied | Implemented and verified (portable commands) | All8 approved Effort/Skill and Even/Uneven/live Proportional/Absolute variants; precise bounds, reset inheritance, atomic rollback/retries/source versions and retained credit verified. |
| 16 | Proportional Support / `duplicateSkillSupportProportional` | Supplied | Implemented and verified (portable commands) | All8 approved Effort/Skill and Even/Uneven/live Proportional/Absolute variants; precise bounds, reset inheritance, atomic rollback/retries/source versions and retained credit verified. |
| 17 | Absolute Scale Support / `duplicateSkillSupportAbsolute` | Supplied | Implemented and verified (portable commands) | All8 approved Effort/Skill and Even/Uneven/live Proportional/Absolute variants; precise bounds, reset inheritance, atomic rollback/retries/source versions and retained credit verified. |
| 18 | Task Done / `markTasksAsDoneForRange` | Missing | Implemented and verified (portable commands) | Atomic Done commands reuse M05 sections/progress/current-review proof; one invalid item rolls back the batch. |
| 19 | Task Started or Re-Opened / `reopenTasksForRange` | Missing | Implemented and verified (portable commands) | Atomic manager reopen retains M03 reason and version gates; no assumed workbook-specific start behavior. |
| 20 | Protect Done Tasks / `setSoleEditorForDoneTasks` | Missing | Source handler missing | M01/M03/M05 database command gates; workbook sole-editor semantics unavailable. |
| 21 | Collect Task Tags / `collectTaskTags` | Missing | Partially implemented | Visible UUID/tag/title JSON export with archive/handoff metadata; signed-in browser download unverified. |
| 22 | Import Tasks from another tracker / `copyTaskDataWithCalculations` | Missing | User-approved deferral | Historical import explicitly deferred by the user until source mapping/provenance is requested. Native creation remains separate. |
| 23 | Remove Redundant Task / `resetTaskRow` | Missing | Implemented and verified (portable commands) | Approved reasoned retained manager archive replaces physical removal; source/history read-only and no deletion. |
| 24 | Complete Task Start / `updateLinkedSheetsTaskStart` | Missing | Implemented and verified (portable commands) | Native M05 section review/intentional-empty confirmation; applicable Setup cannot be auto-completed. |
| 25 | Complete Task Closures / `updateLinkedSheetsTaskClose` | Missing | Implemented and verified (portable commands) | Same approved M05 Closure review/completion boundary, no blanket leaf completion or provider mutation. |
| 26 | Complete Empty Checklist / `updateLinkedSheetsEmptyChecklist` | Missing | Implemented and verified (portable commands) | Approved explicit initialized-empty/all-N/A distinction; leaves cannot be auto-completed by this tool. |
| 27 | Refresh Data / `AttendanceRefresh` | Missing | Implemented and verified (portable commands) | Approved shared refresh preserves original dates/freshness/progress and queues recomputation; no external attendance refresh. |
| 28 | Move Task Log Entries / `moveTaskLog` | Missing | Source handler missing | Existing M02 retained corrections/reversals; arbitrary log move/import unavailable. |
| 29 | Daily Facts / `showDailyFactsForm` | Missing | Source handler missing | M06 native facts/date/as-of/review commands; exact missing form unavailable. |
| 30 | Ideas / `showideasForm` | Missing | Source handler missing | M06 native idea/review contract; exact missing form unavailable. |
| 31 | Suggestions / `showsuggForm` | Missing | Source handler missing | M06 native suggestion/review contract; exact missing form unavailable. |
| 32 | Templates / `showTemplateDialog` | Supplied | Partially implemented | M04 native published templates; missing TemplateDialog.html/provider template tree; no file copy. |
| 33 | Blank Files / `showBlankFilesDialog` | Supplied | Partially implemented | M04 blank native initialization; missing BlankFilesDialog.html; no provider file creation. |
| 34 | Get Report / `whatsappreport` | Missing | Source handler missing | M07 shared native report sources, Draft for missing sales/history; no WhatsApp delivery or source formatting parity. |

Single duplication, remaining-work carryover and visible tag JSON export are also
native M09 workflows. Approved copy/phase/batch semantics are in DECISIONS, with
concrete evidence in migration25 and approved fixtures. No Drive operation occurs;
manual link labels, native initialization and unrequested provider work remain
separate. Provider files/shortcuts and native API/browser verification are still
outstanding. No M10/M11 or production rollout is authorized.


M10 follow-up: provider rows now have a typed server adapter, retained outbox
commands and distinct UI controls, awaiting D11 setup and real provider/native
verification. The source inventory and M09-only classifications above are
historical. See [M10 workflow coverage](M10-menu-coverage.md).
