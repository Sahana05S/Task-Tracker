function createFolderFromSelection(columnJValue) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var activeSheet = ss.getActiveSheet();

  // Get the required details from the sheet
  var taskTag = activeSheet.getRange('B1').getValue();
  var taskOwner = activeSheet.getRange('B2').getValue();
  var carryoverTaskTag = activeSheet.getRange('B5').getValue();  // Assuming carryover task tag is in B5

  // Fetch employee ID and folder link
  var employeeDetails = getEmployeeDetails(taskOwner);
  if (employeeDetails.employeeID === '') {
    throw new Error('Employee ID not found for the Task Owner: ' + taskOwner);
  }

  // Get the Jam Boards Folder ID from a named range
  var parentFolderId = getParentFolderId();
  
  // Retrieve or create employee and task folders
  var taskFolder = getOrCreateTaskFolder(parentFolderId, employeeDetails.employeeID, taskTag);

  // Handle the carryover task folder shortcut only if carryoverTaskTag is not empty
  if (carryoverTaskTag.trim() !== '') {
    createCarryoverTaskShortcut(parentFolderId, employeeDetails.employeeID, carryoverTaskTag, taskFolder);
  }

  copyAndRenameTemplate(taskFolder, taskTag);

  // Link the folder in the sheet
  linkFolderInSheet(taskFolder, activeSheet, columnJValue);
}



function getParentFolderId() {
  return SpreadsheetApp.getActiveSpreadsheet().getRangeByName("Jam_Boards_Folder").getValue();
}

function getOrCreateTaskFolder(parentFolderId, employeeID, taskTag) {
  var parentFolder = DriveApp.getFolderById(parentFolderId);
  var employeeFolder = findOrCreateFolder(parentFolder, employeeID);

  return findOrCreateFolder(employeeFolder, taskTag);
}

function findOrCreateFolder(parentFolder, folderName) {
  var folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parentFolder.createFolder(folderName);
  }
}

function createCarryoverTaskShortcut(parentFolderId, employeeID, carryoverTaskTag, taskFolder) {
  var parentFolder = DriveApp.getFolderById(parentFolderId);
  var employeeFolder = parentFolder.getFoldersByName(employeeID).next();

  // Find existing folder containing the carryover task tag
  var carryoverFolder = findCarryoverTaskFolder(employeeFolder, carryoverTaskTag);

  // If the folder is found and is not the same as the taskFolder, create a shortcut
  if (carryoverFolder && carryoverFolder.getId() !== taskFolder.getId()) {
    taskFolder.createShortcut(carryoverFolder.getId());
  }
}

function findCarryoverTaskFolder(employeeFolder, carryoverTaskTag) {
  var folders = employeeFolder.getFolders();
  while (folders.hasNext()) {
    var folder = folders.next();
    if (folder.getName().startsWith(carryoverTaskTag)) {
      return folder;
    }
  }
  return null;
}

function linkFolderInSheet(taskFolder, sheet , columnJValue) {
  var taskTag = taskFolder.getName();
  var employeeFolderLink = taskFolder.getUrl();
  var richText = SpreadsheetApp.newRichTextValue()
    .setText(taskTag)
    .setLinkUrl(employeeFolderLink)
    .build();
  sheet.getRange('B4').setRichTextValue(richText);

   var cname = sheet.getRange('B1').getValue(); 
   var owner = sheet.getRange('B2').getValue(); 
   var tasktag = sheet.getRange('B3').getValue(); 
 
   var spreadsheetUrl = sheet.getParent().getUrl(); // Get the URL of the spreadsheet
   var sheetId = sheet.getSheetId(); // Get the unique ID of the sheet
   var backlinkurl = spreadsheetUrl + "#gid=" + sheetId; // Construct the sheet-specific URL

   var checksheetfullname=cname + " - Master Checklist";
   var masterCheckUrl=createMasterCheckList("1B97lVjV1EBxhNmxtxzXbehDhuYgzFtJYRku2XqiBKkw",checksheetfullname,employeeFolderLink, cname, owner, tasktag, backlinkurl);


   var masCLcell = sheet.getRange("E14"); // Specify the masCLcell where you want to insert the hyperlink

  // Construct the HYPERLINK formula
   var hyperlinkFormula = `=HYPERLINK("${masterCheckUrl}", "${checksheetfullname}")`;

  // Set the formula in the specified cell
   masCLcell.setFormula(hyperlinkFormula);


      var reviewerEmails = columnJValue.split(',').map(email => email.trim());

  // Loop through each email address and process it
  reviewerEmails.forEach(email => {
    var revieweremail = getreviewerEmail(email); // Process each email as needed
    addCommentAccessByUrl(revieweremail, masterCheckUrl ,email); // Grant comment access for each email
  });


    
}


function copyAndRenameTemplate(inputFolder, taskTag) {
  // Hardcode the Template Folder ID
  const templateFolderId = '1jvHDrWE3f_ftWXvkgYwceNa8v0_NY7CL'; // Replace with your actual Template Folder ID
  const templateFolder = DriveApp.getFolderById(templateFolderId);

  // Create a new folder inside the Input Folder with the updated name
  const targetFolderName = templateFolder.getName().replace("[Task Tag]", taskTag);
  const targetFolder = inputFolder.createFolder(targetFolderName);

  // Recursively copy contents from the Template Folder to the new folder
  copyFolderContents(templateFolder, targetFolder, taskTag);
}

function copyFolderContents(sourceFolder, targetFolder, taskTag) {
  // Copy all files in the source folder
  const files = sourceFolder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const targetFileName = file.getName().replace("[Task Tag]", taskTag);
    const copiedFile = file.makeCopy(targetFileName, targetFolder);
  }

  // Recursively copy all subfolders
  const subfolders = sourceFolder.getFolders();
  while (subfolders.hasNext()) {
    const subfolder = subfolders.next();
    const targetSubfolderName = subfolder.getName().replace("[Task Tag]", taskTag);
    const targetSubfolder = targetFolder.createFolder(targetSubfolderName);
    copyFolderContents(subfolder, targetSubfolder, taskTag);
  }
}
