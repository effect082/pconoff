function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Create Users sheet
  let usersSheet = ss.getSheetByName("Users");
  if (!usersSheet) {
    usersSheet = ss.insertSheet("Users");
    usersSheet.appendRow(["Department", "Name", "Rank", "PasswordHash", "Status", "CreatedAt"]);
    usersSheet.getRange("A1:F1").setFontWeight("bold");
  }

  // Create Logs sheet
  let logsSheet = ss.getSheetByName("Logs");
  if (!logsSheet) {
    logsSheet = ss.insertSheet("Logs");
    logsSheet.appendRow(["Date", "Department", "Name", "BootTime", "OffTime", "LastHeartbeat"]);
    logsSheet.getRange("A1:F1").setFontWeight("bold");
  }

  // Create AdminSettings sheet
  let settingsSheet = ss.getSheetByName("AdminSettings");
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet("AdminSettings");
    settingsSheet.appendRow(["SettingKey", "SettingValue"]);
    settingsSheet.appendRow(["AlertTime", "18:00"]);
    settingsSheet.appendRow(["AlertMessage", "정규 업무 시간이 종료되었습니다. 시간외근무 미신청자는 신속히 퇴근하시기 바랍니다."]);
    // Hash of "1234" is 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4
    settingsSheet.appendRow(["AdminPasswordHash", "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"]);
    settingsSheet.getRange("A1:B1").setFontWeight("bold");
  }
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function doGet(e) {
  return handleRequest(e, 'GET');
}

function handleRequest(e, method) {
  // CORS Headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    let params = e.parameter || {};
    
    // For POST requests with JSON payload
    if (e.postData && e.postData.contents) {
      try {
        const jsonParams = JSON.parse(e.postData.contents);
        params = { ...params, ...jsonParams };
      } catch (parseError) {
        // Fallback if not JSON
      }
    }

    const action = params.action;
    let result = { success: false, message: "Invalid action" };

    switch (action) {
      case 'init':
        initSheets();
        result = { success: true, message: "Sheets initialized." };
        break;
      case 'register':
        result = handleRegister(params);
        break;
      case 'login':
        result = handleLogin(params);
        break;
      case 'recordBoot':
        result = handleRecordBoot(params);
        break;
      case 'recordOff':
      case 'heartbeat':
        result = handleHeartbeatOrOff(params, action);
        break;
      case 'getLogs':
        result = handleGetLogs(params);
        break;
      case 'getUsers':
        result = handleGetUsers(params);
        break;
      case 'updateUserStatus':
        result = handleUpdateUserStatus(params);
        break;
      case 'resetPassword':
        result = handleResetPassword(params);
        break;
      case 'getSettings':
        result = handleGetSettings();
        break;
      case 'updateSettings':
        result = handleUpdateSettings(params);
        break;
      case 'updateAdminPassword':
        result = handleUpdateAdminPassword(params);
        break;
      default:
        result = { success: false, message: `Unknown action: ${action}` };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "Server Error: " + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleRegister(params) {
  const { dept, name, rank, passwordHash } = params;
  if (!dept || !name || !passwordHash) return { success: false, message: "Missing required fields" };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  
  // Check if exists
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === dept && data[i][1] === name) {
      return { success: false, message: "User already exists in this department." };
    }
  }

  const createdAt = new Date().toISOString();
  sheet.appendRow([dept, name, rank || "사원", passwordHash, "Active", createdAt]);
  return { success: true, message: "Registration successful" };
}

function handleLogin(params) {
  const { dept, name, passwordHash, isAdmin } = params;
  if (isAdmin === 'true' || isAdmin === true) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("AdminSettings");
    const data = sheet.getDataRange().getValues();
    let currentAdminHash = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"; // Default 1234
    
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === "AdminPasswordHash") {
            currentAdminHash = data[i][1];
            break;
        }
    }

    if (passwordHash === currentAdminHash) {
      return { success: true, message: "Admin Login successful", role: "admin" };
    }
    return { success: false, message: "Invalid Admin Credentials" };
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === dept && data[i][1] === name) {
      if (data[i][3] === passwordHash) {
        if (data[i][4] !== "Active") {
          return { success: false, message: "User is not active." };
        }
        return { success: true, message: "Login successful", user: { dept, name, rank: data[i][2] } };
      } else {
        return { success: false, message: "Invalid password." };
      }
    }
  }
  return { success: false, message: "User not found." };
}

function getFormattedDate(dateObj = new Date()) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function handleRecordBoot(params) {
  const { dept, name, time } = params;
  if (!dept || !name || !time) return { success: false, message: "Missing fields" };

  const dateStr = getFormattedDate();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Logs");
  const data = sheet.getDataRange().getValues();

  // Check if today's log already exists for this user
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === dateStr && data[i][1] === dept && data[i][2] === name) {
      // Boot time already recorded, don't overwrite if it exists
      if (!data[i][3]) {
        sheet.getRange(i + 1, 4).setValue("'" + time); // use ' to force string
      }
      return { success: true, message: "Boot time noted" };
    }
  }

  // New row for today
  sheet.appendRow([dateStr, dept, name, "'" + time, "", ""]);
  return { success: true, message: "Boot time recorded" };
}

function handleHeartbeatOrOff(params, action) {
  const { dept, name, time } = params;
  if (!dept || !name || !time) return { success: false, message: "Missing fields" };

  const dateStr = getFormattedDate();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Logs");
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === dateStr && data[i][1] === dept && data[i][2] === name) {
      if (action === 'recordOff') {
        sheet.getRange(i + 1, 5).setValue("'" + time); // OffTime column
      } else {
        sheet.getRange(i + 1, 6).setValue("'" + time); // Heartbeat column
        // Additionally update OffTime if heartbeat is sent
        sheet.getRange(i + 1, 5).setValue("'" + time); 
      }
      return { success: true, message: `${action} updated` };
    }
  }

  // If boot was never recorded, create row
  sheet.appendRow([dateStr, dept, name, "", "'" + time, "'" + time]);
  return { success: true, message: `${action} recorded (boot missing)` };
}

function handleGetLogs(params) {
  let { date } = params;
  if (!date) date = getFormattedDate();

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Logs");
  if(!sheet) return { success: false, message: "Sheet not found" };
  const data = sheet.getDataRange().getValues();
  
  const headers = data[0];
  const logs = [];

  for (let i = 1; i < data.length; i++) {
    // If exact date match
    const rowDate = data[i][0] instanceof Date ? getFormattedDate(data[i][0]) : data[i][0];
    if (rowDate === date) {
      let rowObj = {};
      for (let j = 0; j < headers.length; j++) {
        rowObj[headers[j]] = data[i][j];
      }
      logs.push(rowObj);
    }
  }
  return { success: true, data: logs };
}

function handleGetUsers() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if(!sheet) return { success: false, message: "Sheet not found" };
  const data = sheet.getDataRange().getValues();
  
  const headers = data[0];
  const users = [];

  for (let i = 1; i < data.length; i++) {
    let rowObj = {};
    for (let j = 0; j < headers.length; j++) {
        if(headers[j] !== 'PasswordHash') {
            rowObj[headers[j]] = data[i][j];
        }
    }
    users.push(rowObj);
  }
  return { success: true, data: users };
}

function handleUpdateUserStatus(params) {
    const { dept, name, status } = params;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === dept && data[i][1] === name) {
            sheet.getRange(i + 1, 5).setValue(status);
            return { success: true, message: "Status updated" };
        }
    }
    return { success: false, message: "User not found" };
}

function handleResetPassword(params) {
    const { dept, name, newPasswordHash } = params;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === dept && data[i][1] === name) {
            sheet.getRange(i + 1, 4).setValue(newPasswordHash);
            return { success: true, message: "Password reset" };
        }
    }
    return { success: false, message: "User not found" };
}

function handleGetSettings() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("AdminSettings");
    if(!sheet) return { success: false, message: "Sheet not found" };
    const data = sheet.getDataRange().getValues();
    let settings = {};
    for (let i = 1; i < data.length; i++) {
        settings[data[i][0]] = data[i][1];
    }
    return { success: true, data: settings };
}

function handleUpdateSettings(params) {
    const { key, value } = params;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("AdminSettings");
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === key) {
            sheet.getRange(i + 1, 2).setValue(value);
            return { success: true, message: "Setting updated" };
        }
    }
    sheet.appendRow([key, value]);
    return { success: true, message: "Setting added" };
}

function handleUpdateAdminPassword(params) {
    const { newPasswordHash } = params;
    if(!newPasswordHash) return { success: false, message: "Missing hash" };
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("AdminSettings");
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === "AdminPasswordHash") {
            sheet.getRange(i + 1, 2).setValue(newPasswordHash);
            return { success: true, message: "Admin password updated" };
        }
    }
    // If not exists
    sheet.appendRow(["AdminPasswordHash", newPasswordHash]);
    return { success: true, message: "Admin password created" };
}
