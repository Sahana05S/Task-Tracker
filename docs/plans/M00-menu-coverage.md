# M00 menu action and script inventory

34 menu items: 12 have supplied handler bodies; 22 bodies are missing.
No action has been user-deferred during M00. Native web coverage below is
static inspection, not executed workflow parity. A named missing source is
not a specification; retain the proposed web behavior label until resolved.

Entry points: timer actions under `app/(workspace)/tasks/[taskTag]/timer-actions.ts`,
task actions in `app/tasks/actions.ts`, checklist actions under the task route,
support actions under `/support`, and tools actions under `/task-tools`.

| # | Menu item / handler | Source status | Current web path / gap | Owner |
| --- | --- | --- | --- | --- |
| 1 | Run Timer / `runTimer` | **Body missing** | `startTaskTimer; timer card`. Native workflow; source semantics unavailable | M02 |
| 2 | Stop Timer / `stopTimer` | **Body missing** | `stopTaskTimer; timer card`. Partial-write/retry risk; source unavailable | M02 |
| 3 | Enter Time in Minutes and Hours / `enterTimeInMinutesAndHours` | **Body missing** | `enterManualTaskTime / createTaskLog`. Native manual time; source unavailable | M02 |
| 4 | Weekly Phases / `createWeeklyPhases` | **Body missing** | `duplicateTaskAction`. Only generic one-task duplicate; phases absent | M09 |
| 5 | Day Count Phases / `createDayCountPhases` | **Body missing** | `duplicateTaskAction`. Only generic duplicate; day-count parameters absent | M09 |
| 6 | Task for All / `duplicateTaskForAllTeamMembers` | **Body missing** | `duplicateTaskAction`. No all-members batch | M09 |
| 7 | Number and Suffix / `duplicateTaskWithSuffix` | **Body missing** | `duplicateTaskAction`. Manual tag input; count/suffix batch absent | M09 |
| 8 | Create Task Details Page / `createTaskDetailswithFolder` | Body supplied | `createTaskDetailsWithFolderAction`. Seeds native sections and saves URLs; no Drive side effect/auto trigger | M04/M10 |
| 9 | Rename Task Folder / `renameTaskFolder` | Body supplied | `renameTaskFolderLinkAction`. Renames link label/notes only, no provider rename | M10 |
| 10 | Split Even / `duplicateEffortSupportSplitEven` | Body supplied | Effort Even: createSplitSupportTaskAction; all four arithmetic modes exist. Atomicity/status/date contract still missing. | M09 |
| 11 | Split Uneven / `duplicateEffortSupportSplitUneven` | Body supplied | Effort Uneven: createSplitSupportTaskAction; all four arithmetic modes exist. Uneven bound/status/date choices D09. | M09 |
| 12 | Proportional Support / `duplicateEffortSupportProportional` | Body supplied | Effort Proportional: createSplitSupportTaskAction; all four arithmetic modes exist. Proportional relation lacks live formula recalculation. | M09 |
| 13 | Absolute Scale Support / `duplicateEffortSupportAbsolute` | Body supplied | Effort Absolute: createSplitSupportTaskAction; all four arithmetic modes exist. Atomicity/status/date contract still missing. | M09 |
| 14 | Split Even / `duplicateSkillSupportSplitEven` | Body supplied | Skill Even: createSplitSupportTaskAction; all four arithmetic modes exist. Atomicity/status/date contract still missing. | M09 |
| 15 | Split Uneven / `duplicateSkillSupportSplitUneven` | Body supplied | Skill Uneven: createSplitSupportTaskAction; all four arithmetic modes exist. Uneven bound/status/date choices D09. | M09 |
| 16 | Proportional Support / `duplicateSkillSupportProportional` | Body supplied | Skill Proportional: createSplitSupportTaskAction; all four arithmetic modes exist. Proportional relation lacks live formula recalculation. | M09 |
| 17 | Absolute Scale Support / `duplicateSkillSupportAbsolute` | Body supplied | Skill Absolute: createSplitSupportTaskAction; all four arithmetic modes exist. Atomicity/status/date contract still missing. | M09 |
| 18 | Task Done / `markTasksAsDoneForRange` | **Body missing** | `updateTaskStatus`. Single-task status; batch/protection not equivalent | M03/M09 |
| 19 | Task Started or Re-Opened / `reopenTasksForRange` | **Body missing** | `updateTaskStatus`. Single-task status; source/gates unresolved | M03 |
| 20 | Protect Done Tasks / `setSoleEditorForDoneTasks` | **Body missing** | `Task RLS / permission helpers`. No closed-task protected-column/reviewer contract | M01/M12 |
| 21 | Collect Task Tags / `collectTaskTags` | **Body missing** | `/tasks registry`. Tag data exists; collection/export handler not replicated | M09 |
| 22 | Import Tasks from another tracker / `copyTaskDataWithCalculations` | **Body missing** | `createTaskFromTools / duplicateTaskAction`. No external workbook import handler | M09; D12 scope |
| 23 | Remove Redundant Task / `resetTaskRow` | **Body missing** | `deleteTask`. Destructive native deletion is not established redundant-row reset parity | M09; D12 scope |
| 24 | Complete Task Start / `updateLinkedSheetsTaskStart` | **Body missing** | `checklist actions / sync.ts`. No separate Setup completion workflow | M05 |
| 25 | Complete Task Closures / `updateLinkedSheetsTaskClose` | **Body missing** | `checklist actions / sync.ts`. No separate Closure completion workflow | M05 |
| 26 | Complete Empty Checklist / `updateLinkedSheetsEmptyChecklist` | **Body missing** | `computeChecklistProgress`. Empty/all-N/A policy unresolved; source absent | M05 |
| 27 | Refresh Data / `AttendanceRefresh` | **Body missing** | `refreshTaskMetricsAction`. Task recalc only, legacy Fresh reset; no external attendance refresh | M06/M07 |
| 28 | Move Task Log Entries / `moveTaskLog` | **Body missing** | `createTaskLogFromTools`. Native log insertion; source move behavior unavailable | M02 |
| 29 | Daily Facts / `showDailyFactsForm` | **Body missing** | `/daily-facts support actions`. Native CRUD/boolean validation; source form absent | M06 |
| 30 | Ideas / `showideasForm` | **Body missing** | `/ideas support actions`. Native CRUD/boolean validation; source form absent | M06 |
| 31 | Suggestions / `showsuggForm` | **Body missing** | `/suggestions support actions`. Native CRUD/boolean validation; source form absent | M06 |
| 32 | Templates / `showTemplateDialog` | Body supplied | `createWorkFileLinkAction`. URL classification only; provider copy absent; TemplateDialog.html missing | M10 |
| 33 | Blank Files / `showBlankFilesDialog` | Body supplied | `createWorkFileLinkAction`. URL classification only; provider creation absent; BlankFilesDialog.html missing | M10 |
| 34 | Get Report / `whatsappreport` | **Body missing** | `generateReportFromToolsAction`. Native report snapshot, no WhatsApp send/format parity | M11/M12 |

## Supplied script files

Hashes identify local source revision without copying hardcoded folder IDs,
emails or source business data. The empty text file contains no handler.

| File | SHA-256 |
| --- | --- |
| `appsscript.json` | `fc63ffc8cd09ad0cdb886311c459bc54ebc2d9cbef3308158fe7aa3d9bbb8d7e` |
| `Create Folder from selection.gs` | `8f6ae1b7233342e0b179ded717b6e3aeea5d83202a37e53e87a454c0a1c619c2` |
| `Create Task Details with Folder.gs.txt` | `e6085c7803193b8cc7c63e81416f0c06b9121744860d873ee967732da562c191` |
| `Create Work Files.gs` | `4432d7a74356a3c6fe82c1efa92682d9b6801b7c4193bc0d8fe3deb64d0f83f5` |
| `Duplicate Effort Support Split Even.gs` | `bddcb7e5274ce8b34f611b3d73a2544924a0487a85fa4ad82a8b6293e7d99a8f` |
| `New Text Document.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `On Open Actions.gs` | `95822cf5894a53dc9889a4f2db4aa05483d563788ec644811a7bfaa302d1ec31` |
| `Rename Task Folder.gs` | `2beec0e0940dce8de64773521c8e66f4d243720c35dcc434b303490431a0248e` |
| `Task Details Page.gs` | `1b0aab03d495bf350abcb7b8ceb58cf701317f9dca92d91f2181b79ac43e3781` |

`Task Details Page.gs` supplies `CreateNewTaskDetailsPageForRow` and helpers;
`Create Folder from selection.gs` supplies the folder/template/carryover helpers.
These helper bodies are available even though they are not direct menu items.
Create Work Files depends on missing HTML dialog files and external templates.
No `onEdit` valid-entry trigger body or daily-star scheduled handler was found.
The supplied appsscript manifest is configuration evidence only, not proof of
installed triggers, authorized provider accounts or active deployment.
