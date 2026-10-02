/** @OnlyCurrentDoc */

function CreateNewTaskDetailsPageForRow(currentCell) {
  var spreadsheet = SpreadsheetApp.getActive();
  
  var taskTag = getTaskDetails(currentCell, 'A'); // Task Tag is in Column A
  var taskOwnerName = getTaskDetails(currentCell, 'I'); // Task Owner Name in Column I
  var taskName = getTaskDetails(currentCell, 'C'); // Task Name in Column C
  var taskReviewers = getTaskDetails(currentCell, 'J'); // Task Reviewers in Column J
  
  var ownerEmail = getOwnerEmail(taskOwnerName);
  if (!ownerEmail) {
    SpreadsheetApp.getUi().alert('Task owner name not found in the list.');
    return null;
  }

  //var carryoverTaskTag = promptForCarryoverTaskTag(currentCell);
  var carryoverTaskTag = "";
  
  var newSheet = duplicateAndPrepareSheet(taskTag, taskName, taskOwnerName, carryoverTaskTag,taskReviewers);
  
  linkToNewSheet(currentCell, newSheet, taskName);
  
  setPermissions(newSheet, ownerEmail);	

  setReportsAndChartsLinks(taskOwnerName, newSheet, spreadsheet)			 

  //var prevMonthSheetLink = findCarryoverTaskPageLink(carryoverTaskTag);
  //linkPreviousTaskInSheet(newSheet, carryoverTaskTag, prevMonthSheetLink);
  
  return newSheet;
}

function setReportsAndChartsLinks(taskOwnerName, newSheet, spreadsheet) {
  
  // Get the Team_Info_C range and find the task owner's EmpID
  var teamInfoRange = spreadsheet.getRangeByName('Team_Info_C');
  var teamInfoValues = teamInfoRange.getValues();
  var empID = '';
  
  for (var i = 0; i < teamInfoValues.length; i++) {
    if (teamInfoValues[i][0] === taskOwnerName) {
      empID = teamInfoValues[i][4]; // Column 5 contains EmpID
      break;
    }
  }

  if (!empID) {
    SpreadsheetApp.getUi().alert('Employee ID not found for ' + taskOwnerName);
    return;
  }
  
  // Construct the sheet names based on EmpID
  var reportSheetName = "2_1 " + empID + " Reports";
  var chartSheetName = "1_4 " + empID + " Charts Individual";
  
  // Find the sheets by their names
  var reportSheet = spreadsheet.getSheetByName(reportSheetName);
  var chartSheet = spreadsheet.getSheetByName(chartSheetName);
  
  if (!reportSheet || !chartSheet) {
    SpreadsheetApp.getUi().alert('Report or Chart sheet not found for ' + taskOwnerName);
    return;
  }
  
  // Construct the hyperlinks to the report and chart sheets
  var reportLink = SpreadsheetApp.newRichTextValue()
    .setText(reportSheetName)
    .setLinkUrl("#gid=" + reportSheet.getSheetId())
    .build();
  
  var chartLink = SpreadsheetApp.newRichTextValue()
    .setText(chartSheetName)
    .setLinkUrl("#gid=" + chartSheet.getSheetId())
    .build();
  
  // Insert the links into the new task sheet (e.g., in E2 for report, E4 for chart)
  newSheet.getRange('E2').setRichTextValue(reportLink); // Report sheet link in E2
  newSheet.getRange('E4').setRichTextValue(chartLink);  // Chart sheet link in E4
}


function getTaskDetails(cell, column) {
  return cell.getSheet().getRange(column + cell.getRow()).getValue();
}

function getOwnerEmail(taskOwnerName) {
  var ownersSheet = SpreadsheetApp.getActive().getSheetByName('C_Team Members');
  var ownersData = ownersSheet.getRange('A2:B100').getValues();
  var ownerEmails = ownersData.reduce(function(map, row) {
    map[row[0]] = row[1];
    return map;
  }, {});
  return ownerEmails[taskOwnerName] || null;
}

function promptForCarryoverTaskTag(currentCell) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const cellValue = getTaskDetails(currentCell, 'D'); // Task Comment in Column D

  // Regex pattern to match the carryover task tag format #COTTg-{CarryOvertaskTag}#
  const carryoverTagPattern = /#COTTg-(\w+)#/;
  const match = cellValue.match(carryoverTagPattern);

  if (match) {
    // Return the extracted carryover task tag if found
    return match[1];
  } else {
    // Prompt the user to enter a carryover task tag if not found
    const ui = SpreadsheetApp.getUi();
    const response = ui.prompt('Enter Carryover Task Tag (optional)', ui.ButtonSet.OK_CANCEL);
    return response.getResponseText();
  }
}

function duplicateAndPrepareSheet(taskTag, taskName, taskOwnerName, carryoverTaskTag, taskReviewers) {
  var spreadsheet = SpreadsheetApp.getActive();
  var templateSheet = spreadsheet.getSheetByName('D_Template Task Page');
  var newSheet = templateSheet.copyTo(spreadsheet);
  
  newSheet.setName(taskTag);
  newSheet.showSheet();
  
  newSheet.getRange('B1').setValue(taskTag);
  newSheet.getRange('B2').setValue(taskOwnerName);
  newSheet.getRange('B3').setValue(taskName);
  newSheet.getRange('B5').setValue(carryoverTaskTag);
  newSheet.getRange('B9').setValue(taskReviewers);
  
  return newSheet;
}

function linkToNewSheet(currentCell, newSheet, taskName) {
  var spreadsheet = SpreadsheetApp.getActive();
  var sheetUrl = spreadsheet.getUrl() + '#gid=' + newSheet.getSheetId();
  var cellToHyperlink = currentCell.offset(0, 2); // Assuming Column C is two columns to the right
  var richText = SpreadsheetApp.newRichTextValue()
    .setText(taskName)
    .setLinkUrl(sheetUrl)
    .build();
  cellToHyperlink.setRichTextValue(richText);
}

function setPermissions(sheet, ownerEmail) {
  var protection = sheet.protect().setDescription('Task Sheet Protection');

  // Add the task owner as an editor
  protection.addEditor(ownerEmail);

  // Remove only 'saahithyaa_allmem@sahcon.org' if it's an editor
  var editorToRemove = "saahithyaa_allmem@sahcon.org";
  if (protection.getEditors().some(function (editor) {
    return editor.getEmail().toLowerCase() === editorToRemove.toLowerCase();
  })) {
    protection.removeEditor(editorToRemove);
  }
}



function findCarryoverTaskPageLink(carryoverTaskTag) {
  var link = getPreviousMonthSheetLink();
  try {
    var prevMonthWorkbook = SpreadsheetApp.openByUrl(link);
    var sheets = prevMonthWorkbook.getSheets();
    for (var i = 0; i < sheets.length; i++) {
      if (sheets[i].getName().includes(carryoverTaskTag)) {
        return prevMonthWorkbook.getUrl() + '#gid=' + sheets[i].getSheetId();
      }
    }
    // If no matching sheet is found, provide an informative alert
    SpreadsheetApp.getUi().alert('No sheet found with the carryover task tag: ' + carryoverTaskTag);
    return ""; // Return an empty string if no matching sheet is found
  } catch (e) {
    // If there's a permission error, provide an informative alert
    SpreadsheetApp.getUi().alert("Permission Error", "You do not have permission to access the Previous Month's Sheet. Please check the sharing settings or contact the owner for access. Here is the link: " + link, SpreadsheetApp.getUi().ButtonSet.OK);
    return "";
  }
}

function linkPreviousTaskInSheet(sheet, taskTag, link) {
  if (link === "") {
    // If no link is provided, show an alert to the user
    SpreadsheetApp.getUi().alert('Failed to find the carryover task page link. Please check the carryover task tag and try again.');
    return;
  }
  var cell = sheet.getRange('B5');
  var richText = SpreadsheetApp.newRichTextValue()
    .setText(taskTag)
    .setLinkUrl(link)
    .build();
  cell.setRichTextValue(richText);
}

function getPreviousMonthSheetLink() {
  var spreadsheet = SpreadsheetApp.getActive();
  var linkCell = spreadsheet.getRangeByName("Prev_Month_Sheet").getValue();
  return linkCell;
}

function testAuthorization111() {
  try {
    var link = getPreviousMonthSheetLink(); // Ensure this fetches the actual URL of the spreadsheet
    var workbook = SpreadsheetApp.openByUrl(link);
    Logger.log("Access granted. Sheet name: " + workbook.getName());
  } catch (e) {
    Logger.log("Error: " + e.toString());
    Logger.log("Link: " + link);
  }
}
