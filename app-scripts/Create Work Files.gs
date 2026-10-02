/**********************************************************************************************
 * 
 * HTML DIALOG Functions
 * 
 **********************************************************************************************/

function showTemplateDialog() {
  const htmlOutput = HtmlService.createHtmlOutputFromFile('TemplateDialog')
    .setWidth(300)
    .setHeight(150);

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Select a Template');
}

function showBlankFilesDialog() {
  const htmlOutput = HtmlService.createHtmlOutputFromFile('BlankFilesDialog')
    .setWidth(300)
    .setHeight(150);
  
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Select a Blank File');
}

/**********************************************************************************************
 * 
 * TEMPLATE FILES COPY Functions
 * 
 **********************************************************************************************/

 function getTemplates() {
  const templates = getTemplatesFromSheet('1NQodHLH9q7zpD8KFKMsW8anwSUykoYw4O0KVDtRROp0');
  return templates;  // Send the templates data to the client
}


// Function to get templates from the external Sheets file
function getTemplatesFromSheet(sheetId) {
  
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('Templates Info');
 
  const range = sheet.getRange('A2:B' + sheet.getLastRow());  // Read from A2 to C (dynamically)
 
  return range.getValues();  // Returns a 2D array with template names and file IDs
}

function createTemplate(templateId, templateName) {
  if (templateId && templateName) {
     
     if (templateId ==="12LnSOVI93_wGrgabsti3-LcewrUumiXIORNUXQFLzpQ") {
      openmasterchecklist();
       
     }else{
    duplicateTemplate(templateId, 'Unnamed ' + templateName);
     }
  } else {
    SpreadsheetApp.getUi().alert('Invalid template selected.');
  }
}

/**********************************************************************************************
 * 
 * BLANK FILES COPY Functions
 * 
 **********************************************************************************************/

// Function to create or duplicate unnamed files and place them next to the current Sheets file
// Function to create or duplicate unnamed files and place them next to the current Sheets file
function createOrDuplicateUnnamedFile(fileType) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let newFile, newFileUrl, displayText;

  // Get the task tag (the name of the sheet)
  const sheet = spreadsheet.getActiveSheet();
  const taskTag = sheet.getName();  // Get the name of the current sheet (Task Tag)

  // Prefix the task tag to the display name
  let fileNamePrefix = `${taskTag} - `;

  try {
    // Step 4: Create a new blank file or duplicate from a template
    switch (fileType) {
      case 'Sheet':
        newFile = SpreadsheetApp.create(`${fileNamePrefix}Unnamed Sheet`);
        displayText = `${fileNamePrefix}Unnamed Sheet`;
        break;
      case 'Slides':
        newFile = SlidesApp.create(`${fileNamePrefix}Unnamed Slides`);
        displayText = `${fileNamePrefix}Unnamed Slides`;
        break;
      case 'Document':
        newFile = DocumentApp.create(`${fileNamePrefix}Unnamed Document`);
        displayText = `${fileNamePrefix}Unnamed Document`;
        break;
      case 'Drawing':
        const drawingTemplateId = '13gVs7XbLiHUDJ1u_2O5zdpGArVHCdvfLQHv4NYSnkso'; // Replace with your Drawing template file ID
        duplicateTemplate(drawingTemplateId, `Unnamed Drawing`);
        return; // Avoid calling the helper function for Drawing
      case 'Form':
        const formTemplateId = '1QJ5niLQcGFfPv2APNkFA8cGjejfbZJbvPtfxG_yfPhk'; // Replace with your Form template file ID
        duplicateTemplate(formTemplateId, `Unnamed Form`);
        return; // Avoid calling the helper function for Form
    }

    // If the file is not a Drawing or Form, handle the folder navigation and hyperlink creation
    if (newFile) {
      handleFileCreationProcess(newFile, displayText);
    }
  } catch (error) {
    // Show an error toast message in case of failure
    spreadsheet.toast('Error: ' + error.message, 'Error', 5);  // Toast for 5 seconds
  }
}

// Helper function to handle file creation process (folder navigation, hyperlink, and toasts)
function handleFileCreationProcess(newFile, displayText) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // Show a toast message indicating the process has started
  spreadsheet.toast('Creating your file. Please wait...', 'Processing', 3);  // Toast for 5 seconds
  
  // Step 1: Get the folder URL from Cell B4
  const taskFolderUrl = getFolderUrlFromB4();
  
  // Step 2: Prompt the user for the folder type (1 for Input, 2 for Process, 3 for Output)
  const folderType = promptForFolderType();
  
  // Step 3: Access the single folder and navigate two levels deep
  const targetFolder = navigateSingleFolderTwoLevelsDeep(taskFolderUrl, folderType);
  
  // Step 5: Move the new file to the target folder and add a hyperlink to it in the active cell
  const newFileUrl = newFile.getUrl();
  const fileInDrive = DriveApp.getFileById(newFile.getId());
  fileInDrive.moveTo(targetFolder);  // Move the newly created file to the correct folder (Input/Process/Output)
  
  const { sheet, cell } = getActiveCellInfo();
  addHyperlink(cell, newFileUrl, displayText);
  
  // Show a success toast message
  spreadsheet.toast('File created and linked successfully!', 'Success', 3);  // Toast for 5 seconds
}


/**********************************************************************************************
 * 
 * UTILITY Functions
 * 
 **********************************************************************************************/

function duplicateTemplate(fileId, displayText) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getActiveSheet();
  const taskTag = sheet.getName();  // Get the name of the current sheet (Task Tag)

  // Prefix the task tag to the display name
  const fileName = `${taskTag} - ${displayText}`;

  // Show a "Please wait" toast
  spreadsheet.toast('Please wait, your file is being created...', 'Processing', 3);  // 5 seconds display time

  try {
    // Step 1: Get the folder link from Cell B4
    const taskFolderUrl = getFolderUrlFromB4();

    // Step 2: Prompt the user for the folder type (1 for Input, 2 for Process, 3 for Output)
    const folderType = promptForFolderType();

    // Step 3: Access the single folder inside the task folder (the one linked in B4)
    const targetFolder = navigateSingleFolderTwoLevelsDeep(taskFolderUrl, folderType);

    // Step 4: Create the new file in the target subfolder with the Task Tag prefix
    const newFile = DriveApp.getFileById(fileId).makeCopy(fileName, targetFolder);  // Copy the template and place it in the target subfolder
    const newFileUrl = newFile.getUrl();  // Get the URL of the new file

    // Step 5: Get the current sheet and active cell info to place the hyperlink in the active cell
    const { sheet, cell } = getActiveCellInfo();
    
    // Step 6: Add a hyperlink to the newly created file in the active cell
    addHyperlink(cell, newFileUrl, fileName);

    // Show a success toast message
    spreadsheet.toast('File created and hyperlink added!', 'Success', 3);  // 3 seconds display time

  } catch (error) {
    // Show an error toast message
    spreadsheet.toast('Error: ' + error.message, 'Error', 5);  // 5 seconds display time
  }
}

/**
 * Get the active cell information
 */
function getActiveCellInfo() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const cell = sheet.getActiveCell();
  return { sheet, cell };
}

/**
 * Add a hyperlink in the active cell
 */
function addHyperlink(cell, url, displayText) {
  const richText = SpreadsheetApp.newRichTextValue()
    .setText(displayText)  // Set the display text
    .setLinkUrl(url)       // Set the hyperlink to the new file
    .build();
  cell.setRichTextValue(richText);  // Apply the rich text value to the cell
}

// Function to get the parent folder of the current Sheets file
function getCurrentSheetParentFolder() {
  const fileId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const currentFile = DriveApp.getFileById(fileId);
  const folders = currentFile.getParents();
  if (folders.hasNext()) {
    return folders.next(); // Get the first parent folder
  } else {
    throw new Error('The current file is not inside a folder.');
  }
}

/**
 * Prompt user to enter 1 (Input), 2 (Process), or 3 (Output).
 */
function promptForFolderType() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Select Folder Type', 'Please enter 1 for Input, 2 for Process, or 3 for Output:', ui.ButtonSet.OK_CANCEL);

  if (response.getSelectedButton() == ui.Button.OK) {
    const choice = response.getResponseText().trim();

    // Map 1, 2, 3 to Input, Process, Output
    const folderMap = {
      '1': 'input',
      '2': 'process',
      '3': 'output'
    };

    const folderType = folderMap[choice];
    
    if (folderType) {
      return folderType;  // Return the folder type (input, process, or output)
    } else {
      throw new Error('Invalid input. Please enter 1, 2, or 3.');
    }
  } else {
    throw new Error('Operation cancelled by user.');
  }
}



function navigateTwoLevelsDeep(folderUrl, folderType) {
  const folderId = extractFolderIdFromUrl(folderUrl);
  const rootFolder = DriveApp.getFolderById(folderId);

  const levelOneFolders = rootFolder.getFolders();  // First-level subfolders
  if (!levelOneFolders.hasNext()) {
    throw new Error('No subfolders found at the first level.');
  }

  let targetFolder = null;

  // Loop through the first-level folders
  while (levelOneFolders.hasNext()) {
    const levelOneFolder = levelOneFolders.next();
    
    // Check if the folder name contains Input, Process, or Output (ignore case)
    if (levelOneFolder.getName().toLowerCase().includes(folderType)) {
      const levelTwoFolders = levelOneFolder.getFolders();  // Second-level subfolders

      // Loop through second-level folders and return the first match
      while (levelTwoFolders.hasNext()) {
        const levelTwoFolder = levelTwoFolders.next();
        
        if (levelTwoFolder.getName().toLowerCase().includes(folderType)) {
          targetFolder = levelTwoFolder;
          break;
        }
      }

      // Stop if we found the folder
      if (targetFolder) {
        break;
      }
    }
  }

  if (!targetFolder) {
    throw new Error(`No folder containing "${folderType}" found within two levels.`);
  }

  return targetFolder;
}



/**
 * Get the folder URL from cell B4.
 * If it's a rich text hyperlink, extract the actual URL.
 */
function getFolderUrlFromB4() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const cell = sheet.getRange('B4');  // Get the range of Cell B4

  // Get the Rich Text Value from the cell
  const richTextValue = cell.getRichTextValue();
  
  if (!richTextValue) {
    throw new Error('No hyperlink found in cell B4.');
  }
  
  // Extract the link URL
  const linkUrl = richTextValue.getLinkUrl();

  if (!linkUrl) {
    throw new Error('No valid hyperlink found in cell B4.');
  }

  // Optional: Validate the URL
  if (!linkUrl.startsWith('https://drive.google.com/')) {
    throw new Error('The hyperlink in B4 is not a valid Google Drive URL.');
  }

  return linkUrl;
}

/**
 * Extract folder ID from the URL
 */
function extractFolderIdFromUrl(url) {
  const match = url.match(/[-\w]{25,}/);  // Regular expression to extract the folder ID
  
  if (match) {
    return match[0];  // Return the folder ID if found
  } else {
    throw new Error('Invalid folder URL. Unable to extract folder ID.');
  }
}

/**
 * This function enters the single folder inside the main folder linked in B4
 * and then looks for the Input, Process, or Output folder inside it based on user selection.
 */
function navigateSingleFolderTwoLevelsDeep(folderUrl, folderType) {
  const folderId = extractFolderIdFromUrl(folderUrl);
  const rootFolder = DriveApp.getFolderById(folderId);

  // Get the first (and only) folder inside the root folder
  const subfolders = rootFolder.getFolders();
  if (!subfolders.hasNext()) {
    throw new Error('No subfolders found inside the folder linked in B4.');
  }
  
  const singleFolder = subfolders.next();  // Enter the only folder in the root folder

  // Now search for "Input", "Process", or "Output" folder inside the singleFolder
  const levelTwoFolders = singleFolder.getFolders();

  let targetFolder = null;

  // Search for a folder that contains "Input", "Process", or "Output"
  while (levelTwoFolders.hasNext()) {
    const levelTwoFolder = levelTwoFolders.next();
    const folderName = levelTwoFolder.getName().toLowerCase();

    // Check if the folder name contains the selected folder type (input/process/output)
    if (folderType === 'input' && folderName.includes('input')) {
      targetFolder = levelTwoFolder;
      break;
    } else if (folderType === 'process' && folderName.includes('process')) {
      targetFolder = levelTwoFolder;
      break;
    } else if (folderType === 'output' && folderName.includes('output')) {
      targetFolder = levelTwoFolder;
      break;
    }
  }

  if (!targetFolder) {
    throw new Error(`No ${folderType} folder found inside the single folder.`);
  }

  return targetFolder;
}











