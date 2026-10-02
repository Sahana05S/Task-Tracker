function renameTaskFolder() {
  const taskFolder = getTaskFolder();  // Access the task folder from the hyperlink in cell B4
  const taskTag = getTaskTag();  // Get the task tag (sheet name)
  
  const ui = SpreadsheetApp.getUi();
  
  // Prompt the user for the new task title
  const response = ui.prompt('Enter the new Task Title to replace [Task Title]', ui.ButtonSet.OK_CANCEL);
  
  if (response.getSelectedButton() == ui.Button.OK) {
    const newTaskTitle = response.getResponseText();
    
    // Validate input
    if (!newTaskTitle || newTaskTitle.trim() === '') {
      ui.alert('Invalid input. Please enter a valid Task Title.');
      return;
    }
    
    // Get all the subfolders at one level deep
    const subFolders = taskFolder.getFolders();
    let folderFound = false;
    
    while (subFolders.hasNext()) {
      const subFolder = subFolders.next();
      const folderName = subFolder.getName();
      
      // Check if the folder name contains [Task Title]
      if (folderName.includes('[Task Title]')) {
        const newFolderName = folderName.replace('[Task Title]', newTaskTitle);
        subFolder.setName(newFolderName);  // Rename the folder with the new task title
        folderFound = true;
        break;  // Exit after renaming the folder
      }
    }
    
    if (folderFound) {
      ui.alert('Folder name has been successfully updated.');
    } else {
      ui.alert('No folder containing "[Task Title]" was found.');
    }
  } else {
    ui.alert('Operation canceled.');
  }
}

// Function to get the task folder from the hyperlink in B4
function getTaskFolder() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const cell = sheet.getRange('B4');
  const richTextValue = cell.getRichTextValue();

  if (richTextValue && richTextValue.getLinkUrl()) {
    const folderUrl = richTextValue.getLinkUrl();
    const folderId = folderUrl.match(/[-\w]{25,}/)[0]; // Extract the folder ID from the URL
    return DriveApp.getFolderById(folderId);
  } else {
    throw new Error('Cell B4 does not contain a valid hyperlink to a folder.');
  }
}

// Function to get the Task Tag (sheet name)
function getTaskTag() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  return sheet.getName();
}
