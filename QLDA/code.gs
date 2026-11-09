const DATA_SHEETS = Object.freeze({
  projects: 'Projects',
  dailyLogs: 'DailyLogs',
  bulletins: 'Bulletins',
  planTypes: 'PlanTypes',
});
const DATA_HEADERS = ['record_id', 'data_json', 'updated_at'];
const MAX_CELL_LENGTH = 49000;
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const EDIT_SESSION_TTL_SECONDS = 21600;
const PLACE_SEARCH_CACHE_TTL_SECONDS = 21600;
const IMAGE_FOLDER_NAME = 'QLDA - Ảnh sai phạm';
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function searchPlaces(query) {
  if (typeof query !== 'string') {
    throw new Error('Từ khóa tìm địa điểm không hợp lệ.');
  }
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  if (!normalizedQuery || normalizedQuery.length > 200) {
    throw new Error('Nhập tên đường hoặc địa điểm (tối đa 200 ký tự).');
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'qlda_place_search_' + digest_(normalizedQuery.toLocaleLowerCase());
  const cachedResults = cache.get(cacheKey);
  if (cachedResults) return JSON.parse(cachedResults);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const cachedAfterLock = cache.get(cacheKey);
    if (cachedAfterLock) return JSON.parse(cachedAfterLock);

    const properties = PropertiesService.getScriptProperties();
    const lastRequestAt = Number(properties.getProperty('PLACE_SEARCH_LAST_REQUEST_AT') || 0);
    const waitMilliseconds = 1000 - (Date.now() - lastRequestAt);
    if (waitMilliseconds > 0) Utilities.sleep(waitMilliseconds);

    const url = 'https://nominatim.openstreetmap.org/search?' + [
      'format=jsonv2',
      'countrycodes=vn',
      'limit=5',
      'addressdetails=1',
      'q=' + encodeURIComponent(normalizedQuery),
    ].join('&');
    let response;
    try {
      response = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: {
          'Accept-Language': 'vi',
          'User-Agent': 'QLDA-Google-Apps-Script/1.0 (Vietnam project route search)',
        },
        muteHttpExceptions: true,
      });
    } finally {
      properties.setProperty('PLACE_SEARCH_LAST_REQUEST_AT', String(Date.now()));
    }

    const statusCode = response.getResponseCode();
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error('Dịch vụ tìm địa điểm đang lỗi (HTTP ' + statusCode + '). Hãy thử lại sau.');
    }

    let results;
    try {
      results = JSON.parse(response.getContentText());
    } catch (error) {
      throw new Error('Dịch vụ tìm địa điểm trả về dữ liệu không đọc được.');
    }
    if (!Array.isArray(results)) {
      throw new Error('Dịch vụ tìm địa điểm trả về dữ liệu không hợp lệ.');
    }

    const validResults = results.filter(function (result) {
      const latitude = Number(result && result.lat);
      const longitude = Number(result && result.lon);
      return result &&
        typeof result.place_id === 'number' &&
        typeof result.display_name === 'string' &&
        isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180;
    }).map(function (result) {
      return {
        place_id: result.place_id,
        display_name: result.display_name,
        lat: String(result.lat),
        lon: String(result.lon),
      };
    });

    cache.put(
      cacheKey,
      JSON.stringify(validResults),
      PLACE_SEARCH_CACHE_TTL_SECONDS
    );
    return validResults;
  } finally {
    lock.releaseLock();
  }
}

function authorizePlaceSearch() {
  return searchPlaces('Đà Nẵng');
}

function doGet(e) {
  const parameters = e && e.parameter ? e.parameter : {};
  const action = parameters.action || parameters.api;
  if (action === 'getData' || action === 'getProjects') {
    return getPublicApiResponse_(action);
  }
  if (action) return createJsonResponse_({ success: false, error: 'Action không được hỗ trợ.' });

  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Quản lý Dự án Ngầm hóa Cáp Viễn thông & Điện')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
}

function doPost(e) {
  const requestBody = e && e.postData && e.postData.contents;
  if (typeof requestBody !== 'string') {
    return createJsonResponse_({ success: false, error: 'Yêu cầu phải có JSON body.' });
  }

  let request;
  try {
    request = JSON.parse(requestBody);
  } catch (error) {
    return createJsonResponse_({ success: false, error: 'JSON body không hợp lệ.' });
  }

  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return createJsonResponse_({ success: false, error: 'JSON body không hợp lệ.' });
  }
  const action = request.action || 'getData';
  if (action !== 'getData' && action !== 'getProjects') {
    return createJsonResponse_({ success: false, error: 'Action không được hỗ trợ.' });
  }

  return getPublicApiResponse_(action);
}

function getPublicApiResponse_(action) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getSpreadsheet_();
    const projects = readCollection_(spreadsheet, DATA_SHEETS.projects);
    const dailyLogs = readCollection_(spreadsheet, DATA_SHEETS.dailyLogs);
    const bulletins = readCollection_(spreadsheet, DATA_SHEETS.bulletins);
    const planTypes = readCollection_(spreadsheet, DATA_SHEETS.planTypes);
    const dailyLogsWithImageLinks = dailyLogs.map(function (log) {
      const imageLinks = [];
      getDailyLogPhotoUrls_(log).forEach(function (photoUrl) {
        if (!isPublicImageUrl_(photoUrl)) return;
        imageLinks.push({
          type: 'daily_log',
          url: photoUrl,
          dailyLogId: log.id,
          date: log.date || '',
        });
      });

      const violationReport = log.violationReport;
      if (violationReport) {
        getViolationPhotoUrls_(violationReport).forEach(function (photoUrl) {
          if (!isPublicImageUrl_(photoUrl)) return;
          imageLinks.push({
            type: 'violation',
            url: photoUrl,
            dailyLogId: log.id,
            date: log.date || '',
            violationId: violationReport.id || '',
            violationCode: violationReport.code || '',
          });
        });
      }

      return Object.assign({}, log, { imageLinks: imageLinks });
    });

    const projectsWithImageLinks = projects.map(function (project) {
      const imageLinks = [];
      (project.photos || []).forEach(function (photo) {
        if (photo && isPublicImageUrl_(photo.url)) {
          imageLinks.push({
            type: 'project',
            url: photo.url,
            title: photo.title || '',
            date: photo.date || '',
          });
        }
      });

      dailyLogsWithImageLinks.forEach(function (log) {
        if (log.projectId !== project.id) return;
        imageLinks.push.apply(imageLinks, log.imageLinks);
      });

      return Object.assign({}, project, { imageLinks: imageLinks });
    });

    const response = {
      success: true,
      generatedAt: new Date().toISOString(),
      count: projects.length,
      projects: projectsWithImageLinks,
    };

    if (action === 'getData') {
      response.isInitialized =
        PropertiesService.getScriptProperties().getProperty('DATA_INITIALIZED') === 'true';
      response.counts = {
        projects: projects.length,
        dailyLogs: dailyLogs.length,
        bulletins: bulletins.length,
        planTypes: planTypes.length,
      };
      response.dailyLogs = dailyLogsWithImageLinks;
      response.bulletins = bulletins;
      response.planTypes = planTypes;
    }

    return createJsonResponse_(response);
  } finally {
    lock.releaseLock();
  }
}

function getViolationPhotoUrls_(violationReport) {
  const photoUrls = Array.isArray(violationReport.photoUrls)
    ? violationReport.photoUrls.slice()
    : [];
  if (
    typeof violationReport.photoUrl === 'string' &&
    photoUrls.indexOf(violationReport.photoUrl) === -1
  ) {
    photoUrls.unshift(violationReport.photoUrl);
  }
  return photoUrls;
}

function getDailyLogPhotoUrls_(log) {
  const photoUrls = Array.isArray(log.photoUrls) ? log.photoUrls.slice() : [];
  if (
    typeof log.photoUrl === 'string' &&
    photoUrls.indexOf(log.photoUrl) === -1
  ) {
    photoUrls.unshift(log.photoUrl);
  }
  return photoUrls;
}

function isPublicImageUrl_(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url) && !url.startsWith('data:');
}

function createJsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Cài đặt: chạy setupAll() một lần, sau đó deploy Web app thực thi bằng chủ sở hữu.
function setupSpreadsheet() {
  const properties = PropertiesService.getScriptProperties();
  const existingId = properties.getProperty('SPREADSHEET_ID');
  const spreadsheet = existingId
    ? SpreadsheetApp.openById(existingId)
    : SpreadsheetApp.create('QLDA - Quản lý dự án');

  properties.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  Object.keys(DATA_SHEETS).forEach(function (collection) {
    getOrCreateSheet_(spreadsheet, DATA_SHEETS[collection]);
  });
  return spreadsheet.getUrl();
}

function setupAll() {
  const spreadsheetUrl = setupSpreadsheet();
  const driveFolder = getOrCreateImageFolder_();
  return {
    spreadsheetUrl: spreadsheetUrl,
    driveFolderUrl: driveFolder.getUrl(),
    message: 'Đã khởi tạo Google Sheets và thư mục ảnh trên Google Drive. Hãy đặt EDIT_PASSWORD trong Script Properties để bật quyền chỉnh sửa.',
  };
}

function verifyEditPassword(password) {
  const configuredPassword = PropertiesService.getScriptProperties().getProperty('EDIT_PASSWORD');
  if (!configuredPassword) {
    throw new Error('Chủ sở hữu chưa đặt EDIT_PASSWORD trong Apps Script Script Properties.');
  }
  if (typeof password !== 'string' || password !== configuredPassword) {
    throw new Error('Mật khẩu không chính xác.');
  }

  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(
    'qlda_edit_session_' + digest_(token),
    digest_(configuredPassword),
    EDIT_SESSION_TTL_SECONDS
  );
  return { token: token };
}

function getAppData(sessionToken) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getSpreadsheet_();
    const properties = PropertiesService.getScriptProperties();
    const canWrite = isEditSessionValid_(sessionToken);
    let dailyLogs = readCollection_(spreadsheet, DATA_SHEETS.dailyLogs);
    if (canWrite) {
      dailyLogs = migrateInlineDailyLogImages_(dailyLogs);
    }

    return {
      projects: readCollection_(spreadsheet, DATA_SHEETS.projects),
      dailyLogs: dailyLogs,
      bulletins: readCollection_(spreadsheet, DATA_SHEETS.bulletins),
      planTypes: readCollection_(spreadsheet, DATA_SHEETS.planTypes),
      isInitialized: properties.getProperty('DATA_INITIALIZED') === 'true',
      canWrite: canWrite,
      revision: getDataRevision_(properties),
    };
  } finally {
    lock.releaseLock();
  }
}

function uploadViolationImage(base64Data, fileName, mimeType, sessionToken) {
  assertEditSession_(sessionToken);
  if (typeof mimeType !== 'string' || IMAGE_MIME_TYPES.indexOf(mimeType) === -1) {
    throw new Error('Định dạng ảnh không được hỗ trợ. Hãy dùng JPEG, PNG, WebP hoặc GIF.');
  }
  if (typeof base64Data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)) {
    throw new Error('Dữ liệu ảnh không hợp lệ.');
  }
  if (base64Data.length > Math.ceil(MAX_IMAGE_SIZE_BYTES * 4 / 3) + 4) {
    throw new Error('Ảnh vượt quá giới hạn 8 MB.');
  }

  const bytes = Utilities.base64Decode(base64Data);
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Ảnh rỗng hoặc vượt quá giới hạn 8 MB.');
  }
  return saveImageToDrive_(bytes, fileName, mimeType);
}

function deleteViolationImage(fileId, sessionToken) {
  assertEditSession_(sessionToken);
  if (typeof fileId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    throw new Error('Mã ảnh Google Drive không hợp lệ.');
  }

  return deleteManagedViolationImage_(fileId);
}

function saveAppData(data, sessionToken, expectedRevision) {
  assertEditSession_(sessionToken);
  validateSnapshot_(data);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error('Phiên bản dữ liệu gửi lên không hợp lệ. Hãy tải lại trang.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const currentRevision = getDataRevision_(properties);
    if (expectedRevision !== currentRevision) {
      throw new Error(
        'DATA_REVISION_CONFLICT: Dữ liệu đã được người khác cập nhật. Hãy đồng bộ dữ liệu mới nhất trước khi lưu.'
      );
    }

    const spreadsheet = getSpreadsheet_();
    const previousDailyLogs = readCollection_(spreadsheet, DATA_SHEETS.dailyLogs);
    writeCollection_(spreadsheet, DATA_SHEETS.projects, data.projects);
    writeCollection_(spreadsheet, DATA_SHEETS.dailyLogs, data.dailyLogs);
    writeCollection_(spreadsheet, DATA_SHEETS.bulletins, data.bulletins);
    writeCollection_(spreadsheet, DATA_SHEETS.planTypes, data.planTypes);
    const nextRevision = currentRevision + 1;
    properties.setProperties({
      DATA_INITIALIZED: 'true',
      DATA_REVISION: String(nextRevision),
    });
    enqueueOrphanedImages_(previousDailyLogs, data.dailyLogs);
    cleanupPendingViolationImages_();
    return { revision: nextRevision };
  } finally {
    lock.releaseLock();
  }
}

function getDataRevision_(properties) {
  const revision = Number(properties.getProperty('DATA_REVISION') || 0);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error('Phiên bản dữ liệu trên máy chủ không hợp lệ.');
  }
  return revision;
}

function assertEditSession_(sessionToken) {
  if (!isEditSessionValid_(sessionToken)) {
    throw new Error('Phiên chỉnh sửa đã hết hạn. Hãy nhập lại mật khẩu.');
  }
}

function isEditSessionValid_(sessionToken) {
  if (typeof sessionToken !== 'string' || sessionToken.length < 60) return false;
  const configuredPassword = PropertiesService.getScriptProperties().getProperty('EDIT_PASSWORD');
  if (!configuredPassword) return false;
  return CacheService.getScriptCache().get('qlda_edit_session_' + digest_(sessionToken)) ===
    digest_(configuredPassword);
}

function digest_(value) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value))
  );
}

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('Hãy chạy hàm setupSpreadsheet() trong Apps Script trước khi mở ứng dụng.');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function getOrCreateImageFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const folderId = properties.getProperty('IMAGE_FOLDER_ID');
  if (folderId) return DriveApp.getFolderById(folderId);

  const folder = DriveApp.createFolder(IMAGE_FOLDER_NAME);
  properties.setProperty('IMAGE_FOLDER_ID', folder.getId());
  return folder;
}

function saveImageToDrive_(bytes, fileName, mimeType) {
  const safeName = String(fileName || 'anh-sai-pham')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-100) || 'anh-sai-pham';
  const file = getOrCreateImageFolder_().createFile(
    Utilities.newBlob(bytes, mimeType, Utilities.getUuid() + '-' + safeName)
  );
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600',
    fileId: file.getId(),
  };
}

function deleteManagedViolationImage_(fileId, requireManagedFolder) {
  const folderId = PropertiesService.getScriptProperties().getProperty('IMAGE_FOLDER_ID');
  if (!folderId) throw new Error('Chưa khởi tạo thư mục ảnh trên Google Drive.');

  const file = DriveApp.getFileById(fileId);
  const parents = file.getParents();
  let belongsToImageFolder = false;
  while (parents.hasNext()) {
    if (parents.next().getId() === folderId) {
      belongsToImageFolder = true;
      break;
    }
  }
  if (!belongsToImageFolder) {
    if (requireManagedFolder) {
      throw new Error('Chỉ có thể xóa ảnh trong thư mục ảnh sai phạm của ứng dụng.');
    }
    return false;
  }

  file.setTrashed(true);
  return true;
}

function getManagedImageIds_(dailyLogs) {
  const ids = {};
  dailyLogs.forEach(function (log) {
    getDailyLogPhotoUrls_(log).forEach(function (photoUrl) {
      if (typeof photoUrl !== 'string') return;
      const match = photoUrl.match(/[?&]id=([A-Za-z0-9_-]+)/) ||
        photoUrl.match(/\/d\/([A-Za-z0-9_-]+)/);
      if (match) ids[match[1]] = true;
    });

    const report = log.violationReport;
    if (!report) return;
    const photoUrls = Array.isArray(report.photoUrls) ? report.photoUrls.slice() : [];
    if (typeof report.photoUrl === 'string' && photoUrls.indexOf(report.photoUrl) === -1) {
      photoUrls.push(report.photoUrl);
    }
    photoUrls.forEach(function (photoUrl) {
      if (typeof photoUrl !== 'string') return;
      const match = photoUrl.match(/[?&]id=([A-Za-z0-9_-]+)/) ||
        photoUrl.match(/\/d\/([A-Za-z0-9_-]+)/);
      if (match) ids[match[1]] = true;
    });
  });
  return ids;
}

function enqueueOrphanedImages_(previousDailyLogs, nextDailyLogs) {
  const previousIds = getManagedImageIds_(previousDailyLogs);
  const nextIds = getManagedImageIds_(nextDailyLogs);
  const properties = PropertiesService.getScriptProperties();
  let pendingIds = JSON.parse(properties.getProperty('PENDING_IMAGE_DELETIONS') || '[]');

  Object.keys(previousIds).forEach(function (fileId) {
    if (!nextIds[fileId] && pendingIds.indexOf(fileId) === -1) {
      pendingIds.push(fileId);
    }
  });
  properties.setProperty('PENDING_IMAGE_DELETIONS', JSON.stringify(pendingIds));
}

function cleanupPendingViolationImages_() {
  const properties = PropertiesService.getScriptProperties();
  let pendingIds = JSON.parse(properties.getProperty('PENDING_IMAGE_DELETIONS') || '[]');
  while (pendingIds.length > 0) {
    deleteManagedViolationImage_(pendingIds[0]);
    pendingIds = pendingIds.slice(1);
    properties.setProperty('PENDING_IMAGE_DELETIONS', JSON.stringify(pendingIds));
  }
}

function migrateInlineDailyLogImages_(dailyLogs) {
  return dailyLogs.map(function (log) {
    let updatedLog = log;
    const dailyPhotoUrls = getDailyLogPhotoUrls_(log);
    let hasInlineDailyPhoto = false;
    const migratedDailyPhotoUrls = dailyPhotoUrls.map(function (photoUrl, index) {
      if (typeof photoUrl !== 'string' || !photoUrl.startsWith('data:')) return photoUrl;
      const match = photoUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) {
        throw new Error('Ảnh báo cáo của nhật ký "' + log.id + '" không hợp lệ. Hãy tải lại ảnh.');
      }
      const bytes = Utilities.base64Decode(match[2]);
      if (bytes.length === 0 || bytes.length > MAX_IMAGE_SIZE_BYTES) {
        throw new Error('Ảnh báo cáo của nhật ký "' + log.id + '" vượt quá giới hạn 8 MB. Hãy tải lại ảnh.');
      }
      hasInlineDailyPhoto = true;
      return saveImageToDrive_(bytes, 'bao-cao-' + log.id + '-' + (index + 1), match[1]).url;
    });
    if (hasInlineDailyPhoto) {
      updatedLog = Object.assign({}, updatedLog, {
        photoUrls: migratedDailyPhotoUrls,
        photoUrl: migratedDailyPhotoUrls[0],
      });
    }

    const report = updatedLog.violationReport;
    if (!report) return updatedLog;
    const violationPhotoUrls = getViolationPhotoUrls_(report);
    let hasInlineViolationPhoto = false;
    const migratedViolationPhotoUrls = violationPhotoUrls.map(function (photoUrl, index) {
      if (typeof photoUrl !== 'string' || !photoUrl.startsWith('data:')) return photoUrl;
      const match = photoUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) {
        throw new Error('Ảnh sai phạm cũ của nhật ký "' + log.id + '" không hợp lệ. Hãy tải lại ảnh.');
      }
      const bytes = Utilities.base64Decode(match[2]);
      if (bytes.length === 0 || bytes.length > MAX_IMAGE_SIZE_BYTES) {
        throw new Error('Ảnh sai phạm cũ của nhật ký "' + log.id + '" vượt quá giới hạn 8 MB. Hãy tải lại ảnh.');
      }
      hasInlineViolationPhoto = true;
      return saveImageToDrive_(bytes, 'sai-pham-' + log.id + '-' + (index + 1), match[1]).url;
    });
    if (!hasInlineViolationPhoto) return updatedLog;

    return Object.assign({}, updatedLog, {
      violationReport: Object.assign({}, report, {
        photoUrls: migratedViolationPhotoUrls,
        photoUrl: migratedViolationPhotoUrls[0],
      }),
    });
  });
}

function getOrCreateSheet_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, DATA_HEADERS.length).setValues([DATA_HEADERS]);
  }
  return sheet;
}

function readCollection_(spreadsheet, sheetName) {
  const sheet = getOrCreateSheet_(spreadsheet, sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet.getRange(2, 1, lastRow - 1, DATA_HEADERS.length).getValues().map(function (row, index) {
    const recordId = String(row[0] || '');
    const serialized = String(row[1] || '');
    if (!recordId || !serialized) {
      throw new Error('Dòng ' + (index + 2) + ' trong sheet ' + sheetName + ' bị thiếu dữ liệu.');
    }

    let record;
    try {
      record = JSON.parse(serialized);
    } catch (error) {
      throw new Error('JSON không hợp lệ tại sheet ' + sheetName + ', dòng ' + (index + 2) + '.');
    }
    if (!record || record.id !== recordId) {
      throw new Error('Mã bản ghi không khớp tại sheet ' + sheetName + ', dòng ' + (index + 2) + '.');
    }
    return record;
  });
}

function writeCollection_(spreadsheet, sheetName, records) {
  const sheet = getOrCreateSheet_(spreadsheet, sheetName);
  const seenIds = {};
  const rows = records.map(function (record) {
    if (!record || typeof record.id !== 'string' || !record.id.trim()) {
      throw new Error('Mỗi bản ghi trong ' + sheetName + ' phải có id hợp lệ.');
    }
    if (sheetName === DATA_SHEETS.dailyLogs) {
      if (record.photoUrls !== undefined && !Array.isArray(record.photoUrls)) {
        throw new Error('Danh sách ảnh báo cáo của bản ghi "' + record.id + '" không hợp lệ.');
      }
      if (
        (typeof record.photoUrl === 'string' && record.photoUrl.startsWith('data:')) ||
        (Array.isArray(record.photoUrls) &&
          record.photoUrls.some(function (photoUrl) {
            return typeof photoUrl === 'string' && photoUrl.startsWith('data:');
          }))
      ) {
        throw new Error(
          'Ảnh báo cáo của bản ghi "' + record.id + '" chưa được tải lên Google Drive. Hãy đăng nhập lại và tải ảnh lên Drive.'
        );
      }
    }
    if (seenIds[record.id]) {
      throw new Error('Mã bản ghi bị trùng trong ' + sheetName + ': ' + record.id);
    }
    seenIds[record.id] = true;
    const serialized = JSON.stringify(record);
    if (serialized.length > MAX_CELL_LENGTH) {
      throw new Error(
        'Bản ghi "' + record.id + '" vượt giới hạn ký tự của Google Sheets. ' +
        'Hãy giảm kích thước thông tin của bản ghi.'
      );
    }
    return [record.id, serialized, new Date()];
  });

  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, DATA_HEADERS.length).clearContent();
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, DATA_HEADERS.length).setValues(rows);
  }
  sheet.setFrozenRows(1);
}

function validateSnapshot_(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Dữ liệu gửi lên không hợp lệ.');
  }
  ['projects', 'dailyLogs', 'bulletins', 'planTypes'].forEach(function (collection) {
    if (!Array.isArray(data[collection])) {
      throw new Error('Danh sách "' + collection + '" không hợp lệ.');
    }

    const seenIds = {};
    data[collection].forEach(function (record) {
      if (!record || typeof record.id !== 'string' || !record.id.trim()) {
        throw new Error('Mỗi bản ghi trong "' + collection + '" phải có id hợp lệ.');
      }
      if (seenIds[record.id]) {
        throw new Error('Mã bản ghi bị trùng trong "' + collection + '": ' + record.id);
      }
      seenIds[record.id] = true;
      if (collection === 'dailyLogs') {
        if (record.photoUrls !== undefined && !Array.isArray(record.photoUrls)) {
          throw new Error('Danh sách ảnh báo cáo của bản ghi "' + record.id + '" không hợp lệ.');
        }
        if (
          (typeof record.photoUrl === 'string' && record.photoUrl.startsWith('data:')) ||
          (Array.isArray(record.photoUrls) &&
            record.photoUrls.some(function (photoUrl) {
              return typeof photoUrl === 'string' && photoUrl.startsWith('data:');
            }))
        ) {
          throw new Error(
            'Ảnh báo cáo của bản ghi "' + record.id + '" chưa được tải lên Google Drive. Hãy đăng nhập lại và tải ảnh lên Drive.'
          );
        }
      }
      if (
        record.violationReport &&
        record.violationReport.photoUrls !== undefined &&
        !Array.isArray(record.violationReport.photoUrls)
      ) {
        throw new Error('Danh sách ảnh sai phạm của bản ghi "' + record.id + '" không hợp lệ.');
      }
      if (
        record.violationReport &&
        typeof record.violationReport.photoUrl === 'string' &&
        record.violationReport.photoUrl.startsWith('data:')
      ) {
        throw new Error(
          'Ảnh sai phạm của bản ghi "' + record.id + '" chưa được tải lên Google Drive. Hãy đăng nhập lại và tải ảnh lên Drive.'
        );
      }
      if (
        record.violationReport &&
        Array.isArray(record.violationReport.photoUrls) &&
        record.violationReport.photoUrls.some(function (photoUrl) {
          return typeof photoUrl === 'string' && photoUrl.startsWith('data:');
        })
      ) {
        throw new Error(
          'Ảnh sai phạm của bản ghi "' + record.id + '" chưa được tải lên Google Drive. Hãy đăng nhập lại và tải ảnh lên Drive.'
        );
      }
      if (JSON.stringify(record).length > MAX_CELL_LENGTH) {
        throw new Error(
          'Bản ghi "' + record.id + '" vượt giới hạn ký tự của Google Sheets. ' +
          'Hãy giảm kích thước thông tin của bản ghi.'
        );
      }
    });
  });
}
