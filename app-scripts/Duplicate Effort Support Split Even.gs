function duplicateEffortSupportSplitEven() {
  DuplicateTasks('Effort Support', 'Split Even');
}

function duplicateEffortSupportSplitUneven() {
  DuplicateTasks('Effort Support', 'Split Uneven');
}

function duplicateEffortSupportProportional() {
  DuplicateTasks('Effort Support', 'Proportional Support');
}

function duplicateEffortSupportAbsolute() {
  DuplicateTasks('Effort Support', 'Absolute Scale Support');
}

function duplicateSkillSupportSplitEven() {
  DuplicateTasks('Skill Support', 'Split Even');
}

function duplicateSkillSupportSplitUneven() {
  DuplicateTasks('Skill Support', 'Split Uneven');
}

function duplicateSkillSupportProportional() {
  DuplicateTasks('Skill Support', 'Proportional Support');
}

function duplicateSkillSupportAbsolute() {
  DuplicateTasks('Skill Support', 'Absolute Scale Support');
}

function DuplicateTasks(taskType, splitType) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var activeRange = sheet.getActiveCell();

  // Check if the active cell is in column A
  if (activeRange.getColumn() !== 1) {
    SpreadsheetApp.getUi().alert("Please select a cell in column A to run the function.");
    return;
  }

  var row = activeRange.getRow();
  var colCValue = sheet.getRange(row, 3).getValue();  // Value from column C
  var colBValue = sheet.getRange(row, 2).getValue();  // Value from column B
  var colEValue = sheet.getRange(row, 5).getValue();  // Value from column E
  
  if (!colCValue) return;  // Exit if column C is empty
  
  // Determine the suffix and the B column value based on Task Type
  var suffix, newBValue;
  switch (taskType) {
    case 'Effort Support':
      suffix = " - Effort Support";
      newBValue = colBValue;  // Keep the original value
      break;
    case 'Skill Support':
      suffix = " - Skill Support";
      newBValue = "Skill Development";  // Set column B value to "Skill Development"
      break;
    default:
      SpreadsheetApp.getUi().alert("Invalid Task Type");
      return;
  }

  // Append the suffix to the value in column C
  var newCValue = colCValue + suffix;

  // Find the first empty row after the clicked row
  var firstEmptyRow = findFirstEmptyRowAfter(row, sheet);

  // Handle Split Type logic
  var newEValue = handleSplitType(splitType, colEValue, row, firstEmptyRow, sheet);
  if (newEValue === null) return; // Exit if split value is invalid or canceled
  
  // If it's Split Even or Split Uneven, subtract the new value from the original value in Col E
  if (splitType === 'Split Even' || splitType === 'Split Uneven') {
    var updatedEValue = colEValue - newEValue;
    sheet.getRange(row, 5).setValue(updatedEValue);  // Update original row's Col E
  }

  var sheetName_tasks = "2_Tasks";
  var searchRange_tasks = "4:4";

  var taskPriosCol = getColumnNumberByTextInRange(sheetName_tasks,searchRange_tasks,"Priority");
  var taskRevwsCol = getColumnNumberByTextInRange(sheetName_tasks,searchRange_tasks,"Reviewers");
  var taskStatesCol = getColumnNumberByTextInRange(sheetName_tasks,searchRange_tasks,"Status");
  var taskAssignedCol = getColumnNumberByTextInRange(sheetName_tasks,searchRange_tasks,"Task Assigned");
  var taskDuesCol = getColumnNumberByTextInRange(sheetName_tasks,searchRange_tasks,"Due on");

  var valuesToCopy = [
    newBValue,                      // Column B (task type dependent)
    newEValue === 'formula' ? '' : newEValue, // Column E (if it's a formula, skip setting value directly)
    sheet.getRange(row, taskPriosCol).getValue(),
    sheet.getRange(row, taskRevwsCol).getValue(),
    sheet.getRange(row, taskStatesCol).getValue(),
    sheet.getRange(row, taskAssignedCol).getValue(),
    sheet.getRange(row, taskDuesCol).getValue()
  ];

  // Write new values to the first empty row found
  writeDuplicateTask(sheet, firstEmptyRow, valuesToCopy, newCValue);
}

function findFirstEmptyRowAfter(row, sheet) {
  var lastRow = sheet.getLastRow();
  var firstEmptyRow = row + 1;
  while (firstEmptyRow <= lastRow && sheet.getRange(firstEmptyRow, 1).getValue() !== '') {
    firstEmptyRow++;
  }
  return firstEmptyRow;
}

function handleSplitType(splitType, colEValue, sourceRow, newRow, sheet) {
  var ui = SpreadsheetApp.getUi();
  switch (splitType) {
    case 'Split Even':
      return colEValue / 2;
    case 'Split Uneven':
      var unevenResponse = ui.prompt('Enter Split Value', `Enter a value less than or equal to ${colEValue/2}:`, ui.ButtonSet.OK_CANCEL);
      if (unevenResponse.getSelectedButton() == ui.Button.OK) {
        var unevenValue = parseFloat(unevenResponse.getResponseText());
        if (isNaN(unevenValue) || unevenValue > colEValue || unevenValue < 0) {
          ui.alert('Invalid Split Value');
          return null;
        }
        return unevenValue;
      } else {
        return null; // User canceled
      }
    case 'Proportional Support':
      var propResponse = ui.prompt('Enter Proportional Value', 'Enter a percentage between 0 and 100:', ui.ButtonSet.OK_CANCEL);
      if (propResponse.getSelectedButton() == ui.Button.OK) {
        var percentage = parseInt(propResponse.getResponseText(), 10);
        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
          ui.alert('Invalid Percentage');
          return null;
        }
        // Set the formula in the new row (Column E)
        var formula = `=${percentage / 100} * E${sourceRow}`;
        sheet.getRange(newRow, 5).setFormula(formula);  // Set formula in the new row's Column E
        return 'formula'; // Returning 'formula' indicates that a formula has been set
      } else {
        return null; // User canceled
      }
    case 'Absolute Scale Support':
      var absResponse = ui.prompt('Enter Absolute Scale Value', 'Enter a value between 0 and 500:', ui.ButtonSet.OK_CANCEL);
      if (absResponse.getSelectedButton() == ui.Button.OK) {
        var absValue = parseFloat(absResponse.getResponseText());
        if (isNaN(absValue) || absValue < 0 || absValue > 500) {
          ui.alert('Invalid Scale Value');
          return null;
        }
        return absValue;
      } else {
        return null; // User canceled
      }
    default:
      ui.alert('Invalid Split Type');
      return null;
  }
}

function writeDuplicateTask(sheet, row, valuesToCopy, newCValue) {
  sheet.getRange(row, 2).setValue(valuesToCopy[0]);  // Column B
  if (valuesToCopy[1] !== '') {
    sheet.getRange(row, 5).setValue(valuesToCopy[1]);  // Column E (only if not a formula)
  }

  var sheetName_tasks = "2_Tasks";
  var searchRange_tasks = "4:4";

  var taskPriosCol = getColumnNumberByTextInRange(sheetName_tasks,searchRange_tasks,"Priority");
  var taskRevwsCol = getColumnNumberByTextInRange(sheetName_tasks,searchRange_tasks,"Reviewers");
  var taskStatesCol = getColumnNumberByTextInRange(sheetName_tasks,searchRange_tasks,"Status");
  var taskAssignedCol = getColumnNumberByTextInRange(sheetName_tasks,searchRange_tasks,"Task Assigned");
  var taskDuesCol = getColumnNumberByTextInRange(sheetName_tasks,searchRange_tasks,"Due on");

  sheet.getRange(row, taskPriosCol).setValue(valuesToCopy[2]);
  sheet.getRange(row, taskRevwsCol).setValue(valuesToCopy[3]);
  sheet.getRange(row, taskStatesCol).setValue(valuesToCopy[4]);
  sheet.getRange(row, taskAssignedCol).setValue(valuesToCopy[5]);
  sheet.getRange(row, taskDuesCol).setValue(valuesToCopy[6]);
  sheet.getRange(row, 3).setValue(newCValue);
}

/**
 * Function to get the column number of a named range in a given spreadsheet
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - The active spreadsheet
 * @param {string} namedRangeName - The name of the named range
 * @return {number|null} - The column number of the named range, or null if not found
 */
function getNamedRangeColumnNumber(ss, namedRangeName) {
  const namedRange = ss.getRangeByName(namedRangeName);
  
  if (namedRange) {
    return namedRange.getColumn();
  } else {
    SpreadsheetApp.getUi().alert(`Named range '${namedRangeName}' not found.`);
    Logger.log(`Named range '${namedRangeName}' not found.`);
    return null;
  }
}

/**
 * Function to find the column number of a specific text within a given range on a specified sheet
 * @param {string} sheetName - The name of the sheet
 * @param {string} rangeNotation - The range in A1 notation (e.g., "A1:Z1")
 * @param {string} searchText - The text to search for within the range
 * @return {number|null} - The column number where the text is found, or null if not found
 */
function getColumnNumberByTextInRange(sheetName, rangeNotation, searchText) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert(`Sheet '${sheetName}' not found.`);
    Logger.log(`Sheet '${sheetName}' not found.`);
    return null;
  }
  
  try {
    const range = sheet.getRange(rangeNotation);
    const values = range.getValues()[0]; // Assuming a single row (horizontal range)

    for (let i = 0; i < values.length; i++) {
      if (values[i] === searchText) {
        return range.getColumn() + i; // Adding offset to get actual column number in the sheet
      }
    }

    // Show an alert if the text is not found
    SpreadsheetApp.getUi().alert(`Text '${searchText}' not found in the specified range.`);
    Logger.log(`Text '${searchText}' not found in the specified range.`);
    return null;
    
  } catch (e) {
    SpreadsheetApp.getUi().alert(`Invalid range notation '${rangeNotation}' for sheet '${sheetName}'.`);
    Logger.log(`Error: ${e.message}`);
    return null;
  }
}


/**
 * Converts a column number to a column letter.
 * For example: 1 -> "A", 27 -> "AA", 52 -> "AZ".
 *
 * @param {number} columnNumber - The column number to convert (1-based index).
 * @returns {string} The corresponding column letter.
 */
function columnNumberToLetter(columnNumber) {
  let columnLetter = "";
  
  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    columnLetter = String.fromCharCode(remainder + 65) + columnLetter;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }
  
  return columnLetter;
}


