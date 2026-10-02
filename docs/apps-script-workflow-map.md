# Apps Script Workflow Map

The uploaded `app-scripts` folder confirms that the workbook custom menus are mostly orchestration around task pages, Drive folders/files, support-task duplication, timers, logs, checklist updates, refreshes, and reports.

| Apps Script entry | Workbook behavior | Web app equivalent |
| --- | --- | --- |
| `onOpen` | Builds the `Tasks Tools`, `Daily Facts`, `Create Work Files`, and `Report` menus. | `/task-tools` exposes the same operational hub, with feature routes kept in the sidebar. |
| `runTimer`, `stopTimer`, `enterTimeInMinutesAndHours` | Starts/stops task timers and records manual time. | Task timer card uses `task_timers` and `daily_task_logs`. |
| `moveTaskLog` | Moves selected log rows into the task log area. | Task log card writes normalized log rows directly. |
| `markTasksAsDoneForRange`, `reopenTasksForRange`, `setSoleEditorForDoneTasks` | Bulk status changes and protection for done rows. | Task status card updates status; database RLS replaces sheet protection. |
| `createTaskDetailswithFolder` | Creates task-detail sheet, links it, creates folder, creates master checklist link. | Task details card seeds structured sections and records task folder/checklist links. |
| `CreateNewTaskDetailsPageForRow` | Copies the task detail sheet template and fills owner/reviewer/report links. | Task page route plus seeded `task_detail_sections`; employee reports/charts remain linked by app routes. |
| `createFolderFromSelection` | Creates employee/task folders, copies the folder template, links folder and checklist. | Task details/work-file forms save folder/checklist links; real Drive creation can be added later through Google Drive API. |
| `renameTaskFolder` | Replaces `[Task Title]` in the task folder template name. | Rename task folder link updates the stored folder link label/notes. |
| `showTemplateDialog`, `showBlankFilesDialog`, `createTemplate`, `createOrDuplicateUnnamedFile` | Creates template/blank work files under Input/Process/Output folders and links them. | Create work files card stores the created asset URL and classifies it by link type. |
| `duplicateEffortSupport*`, `duplicateSkillSupport*` | Creates support-task rows using even, uneven, proportional, or absolute scale rules. | Support task card now supports manual creation and split-support duplication rules. |
| `AttendanceRefresh` | Refreshes workbook metrics. | Refresh metrics card recalculates task metrics; attendance remains its own module. |
| `whatsappreport` | Generates a workbook report message. | Report card stores report snapshots for the selected period/member. |

## Remaining Integration Decision

The web app currently stores external folder/file URLs instead of creating Google Drive files directly. If you want the app to create Drive folders, Docs, Sheets, Slides, Drawings, Forms, and shortcuts automatically, the next module should add Google OAuth + Drive API integration and replace the manual URL fields.
