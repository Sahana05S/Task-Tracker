function onOpen() {
  var ui = SpreadsheetApp.getUi();

  // Task Timer menu
  var taskTimerMenu = ui.createMenu('Task Timer')
    .addItem('Run Timer', 'runTimer')
    .addItem('Stop Timer', 'stopTimer')
    .addItem('Enter Time in Minutes and Hours', 'enterTimeInMinutesAndHours');

  // Task Duplication menu
  var taskDuplicationMenu = ui.createMenu('Task Duplication')
    .addItem('Weekly Phases', 'createWeeklyPhases')
    .addItem('Day Count Phases', 'createDayCountPhases')
    .addItem('Task for All', 'duplicateTaskForAllTeamMembers')
    .addItem('Number and Suffix', 'duplicateTaskWithSuffix');
    
  // Task Details menu
  var taskDetailsMenu = ui.createMenu('Task Details')
    .addItem('Create Task Details Page', 'createTaskDetailswithFolder')
    .addItem('Rename Task Folder', 'renameTaskFolder');

  // Effort Support submenu for Support Tasks
  var effortSupportMenu = ui.createMenu('Effort Support')
    .addItem('Split Even', 'duplicateEffortSupportSplitEven')
    .addItem('Split Uneven', 'duplicateEffortSupportSplitUneven')
    .addItem('Proportional Support', 'duplicateEffortSupportProportional')
    .addItem('Absolute Scale Support', 'duplicateEffortSupportAbsolute');
  
  // Skill Support submenu for Support Tasks
  var skillSupportMenu = ui.createMenu('Skill Support')
    .addItem('Split Even', 'duplicateSkillSupportSplitEven')
    .addItem('Split Uneven', 'duplicateSkillSupportSplitUneven')
    .addItem('Proportional Support', 'duplicateSkillSupportProportional')
    .addItem('Absolute Scale Support', 'duplicateSkillSupportAbsolute');

  // Support Tasks menu with Effort Support and Skill Support submenus
  var supportTasksMenu = ui.createMenu('Support Tasks')
    .addSubMenu(effortSupportMenu)  // Add Effort Support submenu
    .addSubMenu(skillSupportMenu);  // Add Skill Support submenu

  // Support Tasks menu with Effort Support and Skill Support submenus
  var taskStatusMenu = ui.createMenu('Task Status')
    .addItem('Task Done', 'markTasksAsDoneForRange')
    .addItem('Task Started or Re-Opened', 'reopenTasksForRange')
    .addItem('Protect Done Tasks', 'setSoleEditorForDoneTasks');

    var tasksImportMenu = ui.createMenu('Import Tasks')
    .addItem('Collect Task Tags', 'collectTaskTags')
    .addItem('Import Tasks from another tracker', 'copyTaskDataWithCalculations')
    .addItem('Remove Redundant Task', 'resetTaskRow');

    var mascCLUpdatesMenu = ui.createMenu('Master Checklist Updates')
    .addItem('Complete Task Start', 'updateLinkedSheetsTaskStart')
    .addItem('Complete Task Closures', 'updateLinkedSheetsTaskClose')
    .addItem('Complete Empty Checklist', 'updateLinkedSheetsEmptyChecklist');

    var dataRefreshMenu = ui.createMenu('Refresh Data')
    .addItem('Refresh Data', 'AttendanceRefresh');

    var taskLogMenu = ui.createMenu('Task Log')
    .addItem('Move Task Log Entries', 'moveTaskLog');
  
  // Main "Tasks Tools" menu with submenus
  ui.createMenu('Tasks Tools')
    .addSubMenu(taskTimerMenu)       // Add Task Timer submenu
    .addSubMenu(taskLogMenu)       // Add Task Log Sub Menu
    .addSubMenu(taskStatusMenu)       // Add Task Status submenu
    .addSubMenu(taskDuplicationMenu) // Add Task Duplication submenu
    .addSubMenu(taskDetailsMenu)     // Add Task Details submenu
    .addSubMenu(supportTasksMenu)    // Add Support Tasks submenu
    .addSubMenu(tasksImportMenu)    // Add Tasks Import Menu
    .addSubMenu(mascCLUpdatesMenu)    // Add Master Checklists Update Menu
    .addSubMenu(dataRefreshMenu)    // Add Support Tasks submenu
    .addToUi();

  // Daily Facts menu
  ui.createMenu('Daily Facts')
    .addItem('Daily Facts', 'showDailyFactsForm')
    .addItem('Ideas', 'showideasForm')
    .addItem('Suggestions', 'showsuggForm')
    .addToUi();

  // Create Work Files menu
  ui.createMenu('Create Work Files')
    .addItem('Templates', 'showTemplateDialog')      // Opens the template dialog
    .addItem('Blank Files', 'showBlankFilesDialog')  // Opens the blank files dialog
    .addToUi();

  // Report menu
  ui.createMenu('Report')
    .addItem('Get Report', 'whatsappreport')
    .addToUi();
}


