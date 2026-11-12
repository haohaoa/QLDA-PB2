const DATA_SHEETS = Object.freeze({
  projects: 'Projects',
  dailyLogs: 'DailyLogs',
  bulletins: 'Bulletins',
  planTypes: 'PlanTypes',
});
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
  lock.waitLock(5000);
  let properties;
  let waitMilliseconds = 0;
  try {
    const cachedAfterLock = cache.get(cacheKey);
    if (cachedAfterLock) return JSON.parse(cachedAfterLock);

    properties = PropertiesService.getScriptProperties();
    const now = Date.now();
    const previousSlot = Number(properties.getProperty('PLACE_SEARCH_LAST_REQUEST_AT') || 0);
    const requestSlot = Math.max(now, previousSlot + 1000);
    waitMilliseconds = requestSlot - now;
    properties.setProperty('PLACE_SEARCH_LAST_REQUEST_AT', String(requestSlot));
  } finally {
    lock.releaseLock();
  }

  if (waitMilliseconds > 0) Utilities.sleep(waitMilliseconds);
  const url = 'https://nominatim.openstreetmap.org/search?' + [
    'format=jsonv2',
    'countrycodes=vn',
    'limit=5',
    'addressdetails=1',
    'q=' + encodeURIComponent(normalizedQuery),
  ].join('&');
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      'Accept-Language': 'vi',
      'User-Agent': 'QLDA-Google-Apps-Script/1.0 (Vietnam project route search)',
    },
    muteHttpExceptions: true,
  });
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
}

function authorizePlaceSearch() {
  return searchPlaces('Đà Nẵng');
}

function doGet(e) {
  const parameters = e && e.parameter ? e.parameter : {};
  const action = parameters.action || parameters.api;
  if (action === 'getDatabase') {
    return getDatabaseResponse_();
  }
  if (action === 'getAll' || action === 'getById') {
    return getTableResponse_(action, parameters);
  }
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
  if (action === 'getData' || action === 'getProjects') {
    return getPublicApiResponse_(action);
  }
  if (action === 'validateSession') {
    return createJsonResponse_({
      success: true,
      data: { canWrite: isEditSessionValid_(request.sessionToken) },
    });
  }
  if (action === 'migrateInlineImages') {
    try {
      assertEditSession_(request.sessionToken);
      return createJsonResponse_({
        success: true,
        data: migrateInlineImagesInDatabase_(request.sessionToken),
      });
    } catch (error) {
      return createJsonResponse_({
        success: false,
        error: error && error.message ? error.message : 'Không thể chuyển ảnh cũ lên Google Drive.',
      });
    }
  }
  if (action === 'verifyEditPassword') {
    try {
      return createJsonResponse_({ success: true, data: verifyEditPassword(request.password) });
    } catch (error) {
      return createJsonResponse_({
        success: false,
        error: error && error.message ? error.message : 'Không thể đăng nhập Admin.',
      });
    }
  }
  if (action === 'uploadViolationImage' || action === 'deleteViolationImage') {
    try {
      assertEditSession_(request.sessionToken);
      const result = action === 'uploadViolationImage'
        ? uploadViolationImage(request.base64Data, request.fileName, request.mimeType, request.sessionToken)
        : deleteViolationImage(request.fileId, request.sessionToken);
      return createJsonResponse_({ success: true, data: result });
    } catch (error) {
      return createJsonResponse_({
        success: false,
        error: error && error.message ? error.message : 'Không thể xử lý ảnh trên Google Drive.',
      });
    }
  }
  try {
    const data = handleDatabaseWrite_(request);
    if (request.table === DATA_SHEETS.dailyLogs && request.action !== 'syncDatabase') {
      cleanupPendingViolationImages_();
    }
    return createJsonResponse_({ success: true, data: data });
  } catch (error) {
    return createJsonResponse_({
      success: false,
      error: error && error.message ? error.message : 'Không thể cập nhật cơ sở dữ liệu.',
    });
  }
}

function runDatabaseApiAction(request) {
  try {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw new Error('Yêu cầu API không hợp lệ.');
    }
    const action = request.action;
    if (action === 'validateSession') {
      return {
        success: true,
        data: { canWrite: isEditSessionValid_(request.sessionToken) },
      };
    }
    if (action === 'migrateInlineImages') {
      return {
        success: true,
        data: migrateInlineImagesInDatabase_(request.sessionToken),
      };
    }
    if (action === 'getDatabase') {
      const spreadsheet = getSpreadsheet_();
      const data = {};
      Object.keys(DATA_SHEETS).forEach(function (table) {
        data[DATA_SHEETS[table]] = readCollection_(spreadsheet, DATA_SHEETS[table]);
      });
      data.isInitialized =
        PropertiesService.getScriptProperties().getProperty('DATA_INITIALIZED') === 'true';
      return { success: true, data: data };
    }
    if (action === 'getAll' || action === 'getById') {
      const sheetName = resolveTableName_(request.table);
      const rows = readCollection_(getSpreadsheet_(), sheetName);
      if (action === 'getAll') return { success: true, data: rows };
      const record = rows.find(function (item) {
        return item.id === String(request.id || '');
      });
      return { success: true, data: record || null };
    }
    const data = handleDatabaseWrite_(request);
    if (request.table === DATA_SHEETS.dailyLogs && action !== 'syncDatabase') {
      cleanupPendingViolationImages_();
    }
    return { success: true, data: data };
  } catch (error) {
    return {
      success: false,
      error: error && error.message ? error.message : 'Không thể xử lý yêu cầu API.',
    };
  }
}

function getDatabaseResponse_() {
  try {
    const spreadsheet = getSpreadsheet_();
    const data = {};
    Object.keys(DATA_SHEETS).forEach(function (table) {
      data[DATA_SHEETS[table]] = readCollection_(spreadsheet, DATA_SHEETS[table]);
    });
    const properties = PropertiesService.getScriptProperties();
    return createJsonResponse_({
      success: true,
      data: Object.assign({}, data, {
        isInitialized: properties.getProperty('DATA_INITIALIZED') === 'true',
      }),
    });
  } catch (error) {
    return createJsonResponse_({
      success: false,
      error: error && error.message ? error.message : 'Không thể đọc cơ sở dữ liệu.',
    });
  }
}

function getTableResponse_(action, parameters) {
  try {
    const sheetName = resolveTableName_(parameters.table);
    const spreadsheet = getSpreadsheet_();
    const records = readCollection_(spreadsheet, sheetName);
    if (action === 'getAll') {
      return createJsonResponse_({ success: true, data: records });
    }
    const record = records.find(function (item) {
      return item.id === String(parameters.id || '');
    });
    return createJsonResponse_({ success: true, data: record || null });
  } catch (error) {
    return createJsonResponse_({
      success: false,
      error: error && error.message ? error.message : 'Không thể đọc bảng dữ liệu.',
    });
  }
}

function migrateInlineImagesInDatabase_(sessionToken) {
  assertEditSession_(sessionToken);
  const spreadsheet = getSpreadsheet_();
  const originalLogs = readCollection_(spreadsheet, DATA_SHEETS.dailyLogs);
  const migratedLogs = migrateInlineDailyLogImages_(originalLogs);
  const pendingWrites = [];
  migratedLogs.forEach(function (record, index) {
    if (JSON.stringify(record) !== JSON.stringify(originalLogs[index])) {
      pendingWrites.push({
        record: record,
        original: originalLogs[index],
        rowNumber: index + 2,
      });
    }
  });
  if (!pendingWrites.length) return { migrated: 0 };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let migrated = 0;
  const skippedOriginals = [];
  const skippedMigrations = [];
  try {
    const currentLogs = readCollection_(spreadsheet, DATA_SHEETS.dailyLogs);
    const currentById = Object.create(null);
    currentLogs.forEach(function (record, index) {
      currentById[record.id] = { record: record, rowNumber: index + 2 };
    });
    pendingWrites.forEach(function (entry) {
      const current = currentById[entry.original.id];
      if (!current || JSON.stringify(current.record) !== JSON.stringify(entry.original)) {
        skippedOriginals.push(entry.original);
        skippedMigrations.push(entry.record);
        return;
      }
      writeRecord_(spreadsheet, DATA_SHEETS.dailyLogs, entry.record, current.rowNumber);
      migrated += 1;
    });
  } finally {
    lock.releaseLock();
  }
  if (skippedMigrations.length) {
    enqueueOrphanedImages_(skippedMigrations, skippedOriginals);
    cleanupPendingViolationImages_();
  }
  return { migrated: migrated };
}

function handleDatabaseWrite_(request) {
  assertEditSession_(request.sessionToken);
  const action = request.action;
  if (action === 'syncDatabase') return syncDatabase_(request.data);
  if (action !== 'insert' && action !== 'update' && action !== 'upsert' &&
      action !== 'delete' && action !== 'batchUpsert') {
    throw new Error('Action không được hỗ trợ.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getSpreadsheet_();
    const sheetName = resolveTableName_(request.table);
    if (action === 'delete') {
      const id = requireRecordId_(request.id);
      const deleted = deleteRecord_(spreadsheet, sheetName, id);
      markDatabaseInitialized_();
      return { id: id, deleted: deleted };
    }
    if (action === 'batchUpsert') {
      if (!Array.isArray(request.data)) throw new Error('Dữ liệu batchUpsert phải là một mảng.');
      const batchIds = {};
      request.data.forEach(function (record) {
        validateRecord_(record);
        if (batchIds[record.id]) throw new Error('ID bản ghi bị trùng trong batchUpsert: ' + record.id);
        batchIds[record.id] = true;
      });
      const results = batchUpsertRecords_(spreadsheet, sheetName, request.data);
      markDatabaseInitialized_();
      return results;
    }

    const record = request.data;
    validateRecord_(record);
    if (request.id && String(request.id) !== record.id) {
      throw new Error('ID yêu cầu không khớp với ID trong dữ liệu.');
    }
    const result = upsertRecord_(spreadsheet, sheetName, record, action);
    markDatabaseInitialized_();
    return result;
  } finally {
    lock.releaseLock();
  }
}

function syncDatabase_(data) {
  if (!data || !Array.isArray(data.dailyLogs)) {
    throw new Error('Dữ liệu JSON cũ không có danh sách nhật ký hợp lệ.');
  }
  const spreadsheet = getSpreadsheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    assertDatabaseIsEmpty_(spreadsheet);
  } finally {
    lock.releaseLock();
  }

  const migratedData = Object.assign({}, data, {
    dailyLogs: migrateInlineDailyLogImages_(data.dailyLogs),
  });
  validateSnapshot_(migratedData);

  lock.waitLock(30000);
  try {
    assertDatabaseIsEmpty_(spreadsheet);
    Object.keys(DATA_SHEETS).forEach(function (table) {
      writeCollection_(spreadsheet, DATA_SHEETS[table], migratedData[table]);
    });
    PropertiesService.getScriptProperties().setProperty('DATA_INITIALIZED', 'true');
    return { migrated: true };
  } finally {
    lock.releaseLock();
  }
}

function assertDatabaseIsEmpty_(spreadsheet) {
  Object.keys(DATA_SHEETS).forEach(function (table) {
    if (readCollection_(spreadsheet, DATA_SHEETS[table]).length) {
      throw new Error('Chỉ được đồng bộ dữ liệu cũ khi tất cả bảng trên Sheet đang trống.');
    }
  });
}

function markDatabaseInitialized_() {
  PropertiesService.getScriptProperties().setProperty('DATA_INITIALIZED', 'true');
}

function resolveTableName_(table) {
  const allowed = Object.keys(DATA_SHEETS).map(function (key) {
    return DATA_SHEETS[key];
  });
  if (allowed.indexOf(table) === -1) throw new Error('Tên bảng không hợp lệ.');
  return table;
}

function requireRecordId_(id) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('ID bản ghi không hợp lệ.');
  return id;
}

function validateRecord_(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Dữ liệu bản ghi không hợp lệ.');
  }
  requireRecordId_(record.id);
  if (JSON.stringify(record).length > MAX_CELL_LENGTH * 10) {
    throw new Error('Bản ghi vượt giới hạn kích thước cho phép.');
  }
  if (
    record.photoUrls !== undefined &&
    !Array.isArray(record.photoUrls)
  ) {
    throw new Error('Danh sách ảnh của bản ghi không hợp lệ.');
  }
  if (
    (typeof record.photoUrl === 'string' && record.photoUrl.startsWith('data:')) ||
    (Array.isArray(record.photoUrls) && record.photoUrls.some(function (url) {
      return typeof url === 'string' && url.startsWith('data:');
    })) ||
    (record.violationReport && (
      (typeof record.violationReport.photoUrl === 'string' &&
        record.violationReport.photoUrl.startsWith('data:')) ||
      (Array.isArray(record.violationReport.photoUrls) &&
        record.violationReport.photoUrls.some(function (url) {
          return typeof url === 'string' && url.startsWith('data:');
        }))
    ))
  ) {
    throw new Error('Ảnh chưa được tải lên Google Drive. Hãy tải ảnh lên Drive trước khi lưu.');
  }
}

function upsertRecord_(spreadsheet, sheetName, record, action) {
  const existing = findRecordRow_(spreadsheet, sheetName, record.id);
  if (action === 'insert' && existing) throw new Error('ID bản ghi đã tồn tại: ' + record.id);
  if (action === 'update' && !existing) throw new Error('Không tìm thấy bản ghi cần cập nhật: ' + record.id);
  const nextRecord = existing && (action === 'update' || action === 'upsert')
    ? Object.assign({}, existing.record, record)
    : record;
  writeRecord_(spreadsheet, sheetName, nextRecord, existing ? existing.row : null);
  if (sheetName === DATA_SHEETS.dailyLogs && existing) {
    enqueueOrphanedImages_([existing.record], [nextRecord]);
  }
  return nextRecord;
}

function deleteRecord_(spreadsheet, sheetName, id) {
  const existing = findRecordRow_(spreadsheet, sheetName, id);
  if (!existing) return false;
  spreadsheet.getSheetByName(sheetName).deleteRow(existing.row);
  if (sheetName === DATA_SHEETS.dailyLogs) {
    enqueueOrphanedImages_([existing.record], []);
  }
  return true;
}

function batchUpsertRecords_(spreadsheet, sheetName, records) {
  const sheet = getOrCreateSheet_(spreadsheet, sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const missingHeaders = [];
  records.forEach(function (record) {
    Object.keys(record).forEach(function (key) {
      if (headers.indexOf(key) === -1 && missingHeaders.indexOf(key) === -1) {
        missingHeaders.push(key);
      }
    });
  });
  if (missingHeaders.length) {
    sheet.getRange(1, headers.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
    headers.push.apply(headers, missingHeaders);
  }

  const lastRow = sheet.getLastRow();
  const existingRows = lastRow < 2
    ? []
    : sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const existingById = Object.create(null);
  existingRows.forEach(function (row, index) {
    const existing = rowToRecord_(headers, row);
    if (!existing.id) {
      throw new Error('Dòng ' + (index + 2) + ' trong sheet ' + sheetName + ' bị thiếu ID.');
    }
    if (existingById[existing.id]) {
      throw new Error('Mã bản ghi bị trùng trong ' + sheetName + ': ' + existing.id);
    }
    existingById[existing.id] = { rowNumber: index + 2, record: existing };
  });

  const results = [];
  const updates = [];
  const inserts = [];
  const previousDailyLogs = [];
  const nextDailyLogs = [];
  records.forEach(function (record) {
    const existing = existingById[record.id];
    const nextRecord = existing
      ? Object.assign({}, existing.record, record)
      : record;
    const row = recordToSheetRow_(headers, nextRecord);
    results.push(nextRecord);
    if (existing) {
      updates.push({ rowNumber: existing.rowNumber, row: row });
      if (sheetName === DATA_SHEETS.dailyLogs) {
        previousDailyLogs.push(existing.record);
        nextDailyLogs.push(nextRecord);
      }
    } else {
      inserts.push(row);
    }
  });

  updates.sort(function (left, right) {
    return left.rowNumber - right.rowNumber;
  });
  let updateIndex = 0;
  while (updateIndex < updates.length) {
    let endIndex = updateIndex + 1;
    while (
      endIndex < updates.length &&
      updates[endIndex].rowNumber === updates[endIndex - 1].rowNumber + 1
    ) {
      endIndex += 1;
    }
    const group = updates.slice(updateIndex, endIndex);
    sheet.getRange(group[0].rowNumber, 1, group.length, headers.length).setValues(
      group.map(function (entry) {
        return entry.row;
      })
    );
    updateIndex = endIndex;
  }
  if (inserts.length) {
    sheet.getRange(lastRow + 1, 1, inserts.length, headers.length).setValues(inserts);
  }
  if (previousDailyLogs.length) {
    enqueueOrphanedImages_(previousDailyLogs, nextDailyLogs);
  }
  sheet.setFrozenRows(1);
  return results;
}

function findRecordRow_(spreadsheet, sheetName, id) {
  const sheet = getOrCreateSheet_(spreadsheet, sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idColumn = headers.indexOf('id');
  if (idColumn === -1 || sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  for (let index = 0; index < values.length; index += 1) {
    if (String(values[index][idColumn] || '') === id) {
      return { row: index + 2, record: rowToRecord_(headers, values[index]) };
    }
  }
  return null;
}

function writeRecord_(spreadsheet, sheetName, record, rowNumber) {
  const sheet = getOrCreateSheet_(spreadsheet, sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const missingHeaders = Object.keys(record).filter(function (key) {
    return headers.indexOf(key) === -1;
  });
  if (missingHeaders.length) {
    sheet.getRange(1, headers.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
    headers.push.apply(headers, missingHeaders);
  }
  const row = recordToSheetRow_(headers, record);
  if (rowNumber) {
    sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  sheet.setFrozenRows(1);
}

function recordToSheetRow_(headers, record) {
  return headers.map(function (header) {
    if (!(header in record) || record[header] === undefined) return '';
    const value = header === 'id' ? record[header] : JSON.stringify(record[header]);
    if (String(value).length > MAX_CELL_LENGTH) {
      throw new Error('Trường "' + header + '" của bản ghi "' + record.id + '" vượt giới hạn ký tự của Google Sheets.');
    }
    return value;
  });
}

function rowToRecord_(headers, row) {
  const record = {};
  headers.forEach(function (header, index) {
    if (!header || row[index] === '') return;
    if (header === 'id') {
      record.id = String(row[index]);
      return;
    }
    const value = row[index];
    if (typeof value !== 'string') {
      record[header] = value;
      return;
    }
    try {
      record[header] = JSON.parse(value);
    } catch (error) {
      record[header] = value;
    }
  });
  return record;
}

function getPublicApiResponse_(action) {
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
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const spreadsheet = activeSpreadsheet || (
    existingId
      ? SpreadsheetApp.openById(existingId)
      : SpreadsheetApp.create('QLDA - Quản lý dự án')
  );

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

function getApiUrl() {
  const url = ScriptApp.getService().getUrl();
  if (!url) throw new Error('Hãy triển khai ứng dụng dưới dạng Web app trước khi kết nối API.');
  return url;
}

function getAppData(sessionToken) {
  const spreadsheet = getSpreadsheet_();
  const properties = PropertiesService.getScriptProperties();
  const canWrite = isEditSessionValid_(sessionToken);
  let dailyLogs = readCollection_(spreadsheet, DATA_SHEETS.dailyLogs);
  if (canWrite) dailyLogs = migrateInlineDailyLogImages_(dailyLogs);

  return {
    projects: readCollection_(spreadsheet, DATA_SHEETS.projects),
    dailyLogs: dailyLogs,
    bulletins: readCollection_(spreadsheet, DATA_SHEETS.bulletins),
    planTypes: readCollection_(spreadsheet, DATA_SHEETS.planTypes),
    isInitialized: properties.getProperty('DATA_INITIALIZED') === 'true',
    canWrite: canWrite,
    revision: getDataRevision_(properties),
  };
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
  let result;
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
    result = { revision: nextRevision };
  } finally {
    lock.releaseLock();
  }
  cleanupPendingViolationImages_();
  return result;
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
    sheet.getRange(1, 1).setValue('id');
    sheet.setFrozenRows(1);
    return sheet;
  }
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    if (sheet.getLastRow() > 1) {
      throw new Error('Sheet ' + sheetName + ' có dữ liệu nhưng không có hàng tiêu đề.');
    }
    sheet.getRange(1, 1).setValue('id');
    sheet.setFrozenRows(1);
    return sheet;
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) {
    return String(value || '').trim();
  });
  const recordIdColumn = headers.indexOf('record_id');
  const dataJsonColumn = headers.indexOf('data_json');
  if (dataJsonColumn !== -1 && recordIdColumn !== -1) {
    migrateLegacyCollectionSheet_(sheet, sheetName, headers);
  } else if (headers.indexOf('id') === -1 && recordIdColumn !== -1) {
    sheet.getRange(1, recordIdColumn + 1).setValue('id');
  } else if (headers.indexOf('id') === -1) {
    throw new Error('Sheet ' + sheetName + ' không có cột id hợp lệ.');
  }
  return sheet;
}

function migrateLegacyCollectionSheet_(sheet, sheetName, legacyHeaders) {
  const lastRow = sheet.getLastRow();
  const recordIdColumn = legacyHeaders.indexOf('record_id');
  const dataJsonColumn = legacyHeaders.indexOf('data_json');
  const legacyRows = lastRow < 2
    ? []
    : sheet.getRange(2, 1, lastRow - 1, legacyHeaders.length).getValues();
  const records = legacyRows.filter(function (row) {
    return row[recordIdColumn] || row[dataJsonColumn];
  }).map(function (row, index) {
    let record;
    try {
      record = JSON.parse(String(row[dataJsonColumn] || ''));
    } catch (error) {
      throw new Error('JSON không hợp lệ tại sheet ' + sheetName + ', dòng ' + (index + 2) + '.');
    }
    if (!record || record.id !== String(row[recordIdColumn] || '')) {
      throw new Error('Mã bản ghi không khớp tại sheet ' + sheetName + ', dòng ' + (index + 2) + '.');
    }
    return record;
  });
  const headers = ['id'];
  records.forEach(function (record) {
    Object.keys(record).forEach(function (key) {
      if (headers.indexOf(key) === -1) headers.push(key);
    });
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const rows = records.map(function (record) {
    return headers.map(function (header) {
      if (!(header in record)) return '';
      const value = header === 'id' ? record[header] : JSON.stringify(record[header]);
      if (String(value).length > MAX_CELL_LENGTH) {
        throw new Error('Trường "' + header + '" của bản ghi "' + record.id + '" vượt giới hạn ký tự của Google Sheets.');
      }
      return value;
    });
  });
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
}

function readCollection_(spreadsheet, sheetName) {
  const sheet = getOrCreateSheet_(spreadsheet, sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const records = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    .map(function (row, index) {
    const record = rowToRecord_(headers, row);
    if (!record.id) {
      throw new Error('Dòng ' + (index + 2) + ' trong sheet ' + sheetName + ' bị thiếu dữ liệu.');
    }
    return record;
  });
  const ids = {};
  records.forEach(function (record) {
    if (ids[record.id]) throw new Error('Mã bản ghi bị trùng trong ' + sheetName + ': ' + record.id);
    ids[record.id] = true;
  });
  return records;
}

function writeCollection_(spreadsheet, sheetName, records) {
  const sheet = getOrCreateSheet_(spreadsheet, sheetName);
  const seenIds = {};
  const headers = ['id'];
  records.forEach(function (record) {
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
    if (JSON.stringify(record).length > MAX_CELL_LENGTH * 10) {
      throw new Error(
        'Bản ghi "' + record.id + '" vượt giới hạn ký tự của Google Sheets. ' +
        'Hãy giảm kích thước thông tin của bản ghi.'
      );
    }
    Object.keys(record).forEach(function (key) {
      if (headers.indexOf(key) === -1) headers.push(key);
    });
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const rows = records.map(function (record) {
    return headers.map(function (header) {
      if (!(header in record)) return '';
      return header === 'id' ? record[header] : JSON.stringify(record[header]);
    });
  });
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
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
