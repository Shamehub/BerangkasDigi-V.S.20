/**
 * BERANGKAS DIGITAL v3.5 - SERVER ENGINE FOR EXTERNAL/GITHUB HOSTING
 */

function doGet(e) {
  return ContentService.createTextOutput("Backend Berangkas Digital API Active");
}

function doPost(e) {
  var responseData;
  try {
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;
    var payload = postData.payload || {};

    responseData = apiRouter(action, payload);
  } catch (err) {
    responseData = { success: false, message: "Server Error: " + err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(responseData))
    .setMimeType(ContentService.MimeType.JSON);
}

function apiRouter(action, payload) {
  try {
    setupDatabaseAndFolders();
    
    switch (action) {
      case 'GET_INITIAL_DATA':
        return { success: true, vaults: getPublicVaultList(), userRole: 'PUBLIC' };
        
      case 'VERIFY_PIN':
        return verifyVaultPin(payload.vaultId, payload.pin);
        
      case 'ADMIN_LOGIN':
        return verifyAdminLogin(payload.username, payload.password);
        
      case 'UPDATE_VAULT':
      case 'USER_UPDATE_VAULT':
        return updateVaultConfiguration(payload.vaultId, payload.newName, payload.newPin);

      case 'UPDATE_VAULT_ORDER':
        return updateVaultOrder(payload.orderedIds);

      case 'CREATE_VAULT':
        return createNewVault(payload.vaultName, payload.pin);

      case 'DELETE_VAULT':
        return deleteVault(payload.vaultId);
        
      case 'GET_FILES_AND_FOLDERS':
        return getFolderItems(payload.folderId);

      case 'UPLOAD_SINGLE_FILE':
        return uploadSingleFile(payload.fileData, payload.folderId);

      case 'UPLOAD_FOLDER_STRUCTURE':
        return uploadFolderStructure(payload.parentFolderId, payload.files);
        
      case 'CREATE_FOLDER':
        return createSubFolderDrive(payload.parentFolderId, payload.folderName);

      case 'RENAME_ITEM':
        return renameDriveItem(payload.itemId, payload.newName, payload.isFolder);

      case 'DELETE_ITEM':
        return deleteDriveItem(payload.itemId, payload.isFolder);
        
      case 'GET_IMAGE_BASE64':
        return getImageBase64(payload.fileId);
        
      default:
        throw new Error('Aksi API tidak dikenali: ' + action);
    }
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function setupDatabaseAndFolders() {
  var props = PropertiesService.getScriptProperties();
  var dbId = props.getProperty('DB_SPREADSHEET_ID');
  
  if (!dbId || !isValidId(dbId)) {
    var ss = SpreadsheetApp.create('BERANGKAS DIGITAL DATABASE v3');
    var sheetVaults = ss.getActiveSheet();
    sheetVaults.setName('Vaults');
    sheetVaults.appendRow(['ID', 'Nama Berangkas', 'PIN', 'Folder ID', 'Icon']);
    
    var rootFolder = DriveApp.createFolder('BERANGKAS DIGITAL STORAGE');
    
    var defaultVaults = [
      ['V1', 'Berangkas 1', '', 'fa-folder-closed'],
      ['V2', 'Berangkas 2', '', 'fa-vault'],
      ['V3', 'Berangkas 3', '', 'fa-shield-halved'],
      ['V4', 'Berangkas 4', '', 'fa-box-archive']
    ];
    
    defaultVaults.forEach(function(v) {
      var subF = rootFolder.createFolder(v[1]);
      sheetVaults.appendRow([v[0], v[1], v[2] ? String(v[2]) : '', subF.getId(), v[3]]);
    });
    
    var sheetUsers = ss.insertSheet('Users');
    sheetUsers.appendRow(['Username', 'Password', 'Role']);
    sheetUsers.appendRow(['admin', 'admin123', 'SUPER_ADMIN']);
    
    props.setProperty('DB_SPREADSHEET_ID', ss.getId());
    props.setProperty('ROOT_FOLDER_ID', rootFolder.getId());
  }
}

function isValidId(id) {
  try {
    if (!id) return false;
    SpreadsheetApp.openById(id);
    return true;
  } catch(e) {
    return false; 
  }
}

function getVaultList() {
  var dbId = PropertiesService.getScriptProperties().getProperty('DB_SPREADSHEET_ID');
  var sheet = SpreadsheetApp.openById(dbId).getSheetByName('Vaults');
  var data = sheet.getDataRange().getValues();
  var list = [];
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) {
      list.push({
        id: String(data[i][0]),
        nama: String(data[i][1]),
        pin: data[i][2] !== undefined && data[i][2] !== null ? String(data[i][2]) : '',
        folderId: String(data[i][3]),
        icon: data[i][4] || 'fa-vault'
      });
    }
  }
  return list;
}

function getPublicVaultList() {
  return getVaultList().map(function(v) {
    return {
      id: v.id,
      nama: v.nama,
      hasPin: Boolean(v.pin && v.pin !== '000000'),
      folderId: v.pin ? null : v.folderId,
      icon: v.icon
    };
  });
}

function verifyVaultPin(vaultId, inputPin) {
  var vaults = getVaultList();
  for (var i = 0; i < vaults.length; i++) {
    if (String(vaults[i].id).toUpperCase() === String(vaultId).toUpperCase()) {
      if (!vaults[i].pin || vaults[i].pin === '' || vaults[i].pin === '000000' || String(vaults[i].pin) === String(inputPin)) {
        var safeVault = {
          id: vaults[i].id,
          nama: vaults[i].nama,
          folderId: vaults[i].folderId,
          icon: vaults[i].icon
        };
        return { success: true, vault: safeVault };
      } else {
        return { success: false, message: 'Kode PIN 6 Digit Salah!' };
      }
    }
  }
  return { success: false, message: 'Berangkas tidak ditemukan!' };
}

function verifyAdminLogin(user, pass) {
  var dbId = PropertiesService.getScriptProperties().getProperty('DB_SPREADSHEET_ID');
  var sheet = SpreadsheetApp.openById(dbId).getSheetByName('Users');
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === user && String(data[i][1]) === String(pass)) {
      return { success: true, user: user, vaults: getVaultList() };
    }
  }
  return { success: false, message: 'Username atau Password Admin Salah!' };
}

function createNewVault(vaultName, pin) {
  var props = PropertiesService.getScriptProperties();
  var dbId = props.getProperty('DB_SPREADSHEET_ID');
  var rootFolderId = props.getProperty('ROOT_FOLDER_ID');
  
  var sheet = SpreadsheetApp.openById(dbId).getSheetByName('Vaults');
  var data = sheet.getDataRange().getValues();
  
  var maxNum = 0;
  for (var i = 1; i < data.length; i++) {
    var currentId = String(data[i][0]);
    var match = currentId.match(/^V(\d+)$/i);
    if (match) {
      var num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }
  
  var newId = 'V' + (maxNum + 1);
  
  var rootFolder;
  try {
    rootFolder = DriveApp.getFolderById(rootFolderId);
  } catch(e) {
    rootFolder = DriveApp.createFolder('BERANGKAS DIGITAL STORAGE');
    props.setProperty('ROOT_FOLDER_ID', rootFolder.getId());
  }
  
  var newFolder = rootFolder.createFolder(vaultName);
  var iconName = 'fa-folder';
  var pinStr = pin ? String(pin) : '';
  var folderIdStr = newFolder.getId();

  sheet.appendRow([newId, vaultName, pinStr, folderIdStr, iconName]);
  
  return { 
    success: true, 
    message: 'Menu Berangkas Baru Berhasil Ditambahkan dengan ID ' + newId + '!',
    vault: {
      id: newId,
      nama: vaultName,
      pin: pinStr,
      folderId: folderIdStr,
      icon: iconName
    }
  };
}

function updateVaultConfiguration(vaultId, newName, newPin) {
  var dbId = PropertiesService.getScriptProperties().getProperty('DB_SPREADSHEET_ID');
  var sheet = SpreadsheetApp.openById(dbId).getSheetByName('Vaults');
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toUpperCase() === String(vaultId).toUpperCase()) {
      sheet.getRange(i + 1, 2).setValue(newName);
      sheet.getRange(i + 1, 3).setValue(newPin ? String(newPin) : '');
      try {
        if (data[i][3]) {
          DriveApp.getFolderById(data[i][3]).setName(newName);
        }
      } catch(e) {}
      return { success: true, message: 'Konfigurasi Berangkas Berhasil Diperbarui!' };
    }
  }
  return { success: false, message: 'Gagal memperbarui berangkas. ID ' + vaultId + ' tidak ditemukan.' };
}

function updateVaultOrder(orderedIds) {
  if (!orderedIds || !Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { success: false, message: 'Daftar urutan tidak valid!' };
  }

  var dbId = PropertiesService.getScriptProperties().getProperty('DB_SPREADSHEET_ID');
  var sheet = SpreadsheetApp.openById(dbId).getSheetByName('Vaults');
  var data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return { success: false, message: 'Tidak ada data berangkas untuk diurutkan.' };
  }

  var header = data[0];
  var rows = data.slice(1);
  
  var rowMap = {};
  rows.forEach(function(r) {
    if (r[0] !== undefined && r[0] !== null) {
      rowMap[String(r[0]).trim().toUpperCase()] = r;
    }
  });
  
  var newRows = [];
  orderedIds.forEach(function(id) {
    var key = String(id).trim().toUpperCase();
    if (rowMap[key]) {
      newRows.push(rowMap[key]);
      delete rowMap[key];
    }
  });
  
  for (var k in rowMap) {
    newRows.push(rowMap[k]);
  }
  
  if (newRows.length === 0) {
    return { success: false, message: 'Gagal mengurutkan: ID tidak cocok dengan database.' };
  }

  sheet.clearContents();
  sheet.appendRow(header);
  sheet.getRange(2, 1, newRows.length, header.length).setValues(newRows);

  return { success: true, message: 'Urutan berangkas berhasil disimpan!' };
}

function deleteVault(vaultId) {
  var dbId = PropertiesService.getScriptProperties().getProperty('DB_SPREADSHEET_ID');
  var sheet = SpreadsheetApp.openById(dbId).getSheetByName('Vaults');
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toUpperCase() === String(vaultId).toUpperCase()) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'Menu Berangkas Berhasil Dihapus!' };
    }
  }
  return { success: false, message: 'Gagal menghapus berangkas.' };
}

function getFolderItems(folderId) {
  var parentFolder = DriveApp.getFolderById(folderId);
  var items = [];
  
  var subfolders = parentFolder.getFolders();
  while (subfolders.hasNext()) {
    var f = subfolders.next();
    items.push({
      id: f.getId(),
      name: f.getName(),
      size: '-',
      type: 'folder',
      updated: f.getLastUpdated().toLocaleDateString()
    });
  }
  
  var files = parentFolder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    items.push({
      id: file.getId(),
      name: file.getName(),
      size: (file.getSize() / 1024).toFixed(2) + ' KB',
      type: 'file',
      downloadUrl: "https://drive.google.com/uc?export=download&id=" + file.getId(),
      url: file.getUrl(),
      updated: file.getLastUpdated().toLocaleDateString()
    });
  }
  
  return { success: true, folderName: parentFolder.getName(), items: items };
}

function uploadSingleFile(fileData, folderId) {
  try {
    var folder = DriveApp.getFolderById(folderId);
    var blob = Utilities.newBlob(Utilities.base64Decode(fileData.base64), fileData.mimeType, fileData.name);
    var createdFile = folder.createFile(blob);
    
    return {
      success: true,
      file: {
        id: createdFile.getId(),
        name: createdFile.getName(),
        url: createdFile.getUrl()
      }
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

function uploadFolderStructure(parentFolderId, files) {
  try {
    var rootFolder = DriveApp.getFolderById(parentFolderId);
    var folderCache = {};
    var uploadedCount = 0;

    files.forEach(function(fileObj) {
      var pathParts = fileObj.relativePath.split('/');
      var fileName = pathParts.pop();
      var currentTargetFolder = rootFolder;

      var currentPath = "";
      for (var i = 0; i < pathParts.length; i++) {
        var partName = pathParts[i];
        currentPath += (currentPath ? "/" : "") + partName;

        if (!folderCache[currentPath]) {
          var existingFolders = currentTargetFolder.getFoldersByName(partName);
          if (existingFolders.hasNext()) {
            folderCache[currentPath] = existingFolders.next();
          } else {
            folderCache[currentPath] = currentTargetFolder.createFolder(partName);
          }
        }
        currentTargetFolder = folderCache[currentPath];
      }

      var blob = Utilities.newBlob(Utilities.base64Decode(fileObj.base64), fileObj.mimeType, fileName);
      currentTargetFolder.createFile(blob);
      uploadedCount++;
    });

    return { success: true, uploadedCount: uploadedCount };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function createSubFolderDrive(parentFolderId, folderName) {
  var parent = DriveApp.getFolderById(parentFolderId);
  var newFolder = parent.createFolder(folderName);
  return { success: true, folderId: newFolder.getId() };
}

function renameDriveItem(itemId, newName, isFolder) {
  if (isFolder) {
    DriveApp.getFolderById(itemId).setName(newName);
  } else {
    DriveApp.getFileById(itemId).setName(newName);
  }
  return { success: true, message: 'Nama berhasil diubah!' };
}

function deleteDriveItem(itemId, isFolder) {
  if (isFolder) {
    DriveApp.getFolderById(itemId).setTrashed(true);
  } else {
    DriveApp.getFileById(itemId).setTrashed(true);
  }
  return { success: true, message: 'Item berhasil dihapus!' };
}

function getImageBase64(fileId) {
  try {
    if (!fileId) return { success: false, message: 'ID File kosong.' };
    
    var cache = CacheService.getScriptCache();
    var cachedData = cache.get('img_' + fileId);
    if (cachedData) {
      return { success: true, base64Data: cachedData };
    }

    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var bytes = blob.getBytes();
    var contentType = blob.getContentType();
    var base64 = Utilities.base64Encode(bytes);
    var resultData = 'data:' + contentType + ';base64,' + base64;

    try {
      if (resultData.length < 100000) {
        cache.put('img_' + fileId, resultData, 21600);
      }
    } catch (cErr) {}

    return { success: true, base64Data: resultData };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}