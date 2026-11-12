import { DailyLogEntry, PlanType, SiteBulletin, UndergroundProject } from '../types/undergrounding';
import { getGoogleDriveFileId } from './driveImageUtils';

export interface AppDataToSave {
  projects: UndergroundProject[];
  dailyLogs: DailyLogEntry[];
  bulletins: SiteBulletin[];
  planTypes: PlanType[];
}

export interface AppDataSnapshot extends AppDataToSave {
  isInitialized: boolean;
  canWrite: boolean;
}

interface GoogleAppsScriptRunner {
  withSuccessHandler(callback: (value: unknown) => void): GoogleAppsScriptRunner;
  withFailureHandler(callback: (error: unknown) => void): GoogleAppsScriptRunner;
  getApiUrl(): void;
  runDatabaseApiAction(request: unknown): void;
  uploadViolationImage(base64Data: string, fileName: string, mimeType: string, sessionToken: string): void;
  deleteViolationImage(fileId: string, sessionToken: string): void;
  verifyEditPassword(password: string): void;
  searchPlaces(query: string): void;
}

export interface PlaceSearchResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

declare global {
  interface Window {
    google?: {
      script?: {
        run: GoogleAppsScriptRunner;
      };
    };
  }
}

const getAppsScriptRunner = () => window.google?.script?.run;

export const isGoogleAppsScript = () => Boolean(getAppsScriptRunner());
export const isRemoteDatabaseConfigured = () => Boolean(import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL);

const TABLE_NAMES = {
  projects: 'Projects',
  dailyLogs: 'DailyLogs',
  bulletins: 'Bulletins',
  planTypes: 'PlanTypes',
} as const;

export type AppDataTable = keyof typeof TABLE_NAMES;

const resolveApiUrl = async (): Promise<string> => {
  const configuredUrl = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;
  if (configuredUrl) return configuredUrl;

  const runner = getAppsScriptRunner();
  if (!runner) {
    throw new Error('Hãy cấu hình VITE_GOOGLE_APPS_SCRIPT_URL để kết nối Google Apps Script.');
  }

  return new Promise((resolve, reject) => {
    runner
      .withSuccessHandler((value) => {
        if (typeof value !== 'string' || !value.trim()) {
          reject(new Error('Google Apps Script chưa có URL Web App hợp lệ.'));
          return;
        }
        resolve(value);
      })
      .withFailureHandler((error) => reject(normalizeAppsScriptError(error)))
      .getApiUrl();
  });
};

const apiRequest = async <T>(
  action: string,
  options: {
    table?: AppDataTable;
    id?: string;
    data?: unknown;
    sessionToken?: string;
    password?: string;
    fileName?: string;
    mimeType?: string;
    fileId?: string;
  } = {}
): Promise<T> => {
  const payload = {
    action,
    ...(options.table ? { table: TABLE_NAMES[options.table] } : {}),
    ...(options.id ? { id: options.id } : {}),
    ...(options.data !== undefined ? { data: options.data } : {}),
    ...(options.sessionToken ? { sessionToken: options.sessionToken } : {}),
    ...(options.password ? { password: options.password } : {}),
    ...(options.fileName ? { fileName: options.fileName } : {}),
    ...(options.mimeType ? { mimeType: options.mimeType } : {}),
    ...(options.fileId ? { fileId: options.fileId } : {}),
  };

  const runner = getAppsScriptRunner();
  if (runner && !import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL) {
    return new Promise((resolve, reject) => {
      runner
        .withSuccessHandler((value) => {
          try {
            resolve(parseApiResponse<T>(value));
          } catch (error) {
            reject(error);
          }
        })
        .withFailureHandler((error) => reject(normalizeAppsScriptError(error)))
        .runDatabaseApiAction(payload);
    });
  }

  const url = new URL(await resolveApiUrl());
  url.searchParams.set('action', action);
  if (action === 'getDatabase' || action === 'getAll' || action === 'getById') {
    Object.entries(payload).forEach(([key, value]) => {
      if (key !== 'action' && key !== 'sessionToken' && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google Apps Script trả về lỗi HTTP ${response.status}.`);
    return parseApiResponse<T>(await parseFetchResponse(response));
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Google Apps Script trả về lỗi HTTP ${response.status}.`);
  return parseApiResponse<T>(await parseFetchResponse(response));
};

const parseFetchResponse = async (response: Response): Promise<unknown> => {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    if (/^\s*<!doctype html|^\s*<html/i.test(body)) {
      throw new Error(
        'API trả về trang HTML thay vì JSON. Hãy kiểm tra URL Web App (/exec), quyền truy cập và phiên bản triển khai Apps Script.'
      );
    }
    throw new Error('API trả về dữ liệu không phải JSON hợp lệ.');
  }
};

const parseApiResponse = <T>(value: unknown): T => {
  if (typeof value !== 'object' || value === null || !('success' in value)) {
    throw new Error('Google Apps Script trả về phản hồi không hợp lệ.');
  }
  const response = value as { success: boolean; data?: T; error?: string };
  if (!response.success) {
    throw new Error(response.error || 'Google Apps Script không thể xử lý yêu cầu.');
  }
  return response.data as T;
};

const isRecordWithId = (value: unknown): value is { id: string } =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string';

const readTable = <T extends { id: string }>(
  data: Record<string, unknown>,
  table: AppDataTable
): T[] => {
  const rows = data[TABLE_NAMES[table]];
  if (!Array.isArray(rows) || !rows.every(isRecordWithId)) {
    throw new Error(`Google Sheets trả về bảng ${TABLE_NAMES[table]} không hợp lệ.`);
  }
  return rows as T[];
};

export const fetchDatabase = async (sessionToken?: string): Promise<AppDataSnapshot> => {
  const [response, session] = await Promise.all([
    apiRequest<{
      Projects: unknown;
      DailyLogs: unknown;
      Bulletins: unknown;
      PlanTypes: unknown;
      canWrite?: boolean;
      isInitialized?: boolean;
    }>('getDatabase'),
    sessionToken
      ? apiRequest<{ canWrite: boolean }>('validateSession', { sessionToken })
      : Promise.resolve({ canWrite: false }),
  ]);
  if (typeof response !== 'object' || response === null) {
    throw new Error('Google Sheets trả về cơ sở dữ liệu không hợp lệ.');
  }
  const tables = response as unknown as Record<string, unknown>;
  return {
    projects: readTable<UndergroundProject>(tables, 'projects'),
    dailyLogs: readTable<DailyLogEntry>(tables, 'dailyLogs'),
    bulletins: readTable<SiteBulletin>(tables, 'bulletins'),
    planTypes: readTable<PlanType>(tables, 'planTypes'),
    canWrite: session.canWrite === true,
    isInitialized: response.isInitialized === true,
  };
};

export const fetchTable = <T extends { id: string }>(
  tableName: AppDataTable
): Promise<T[]> => apiRequest<T[]>('getAll', { table: tableName });

export const fetchRowById = <T extends { id: string }>(
  tableName: AppDataTable,
  id: string
): Promise<T | null> => apiRequest<T | null>('getById', { table: tableName, id });

export const saveRow = <T extends { id: string }>(
  tableName: AppDataTable,
  rowData: T,
  sessionToken?: string
): Promise<T> => apiRequest<T>('upsert', { table: tableName, id: rowData.id, data: rowData, sessionToken });

export const deleteRow = (
  tableName: AppDataTable,
  id: string,
  sessionToken?: string
): Promise<void> => apiRequest<void>('delete', { table: tableName, id, sessionToken });

export const saveBatch = <T extends { id: string }>(
  tableName: AppDataTable,
  rowsArray: T[],
  sessionToken?: string
): Promise<T[]> =>
  apiRequest<T[]>('batchUpsert', { table: tableName, data: rowsArray, sessionToken });

export const migrateOldJsonToSql = (
  fullDbObject: AppDataToSave,
  sessionToken?: string
): Promise<void> =>
  apiRequest<void>('syncDatabase', { data: fullDbObject, sessionToken });

export const migrateInlineDailyLogImages = (sessionToken: string): Promise<{ migrated: number }> =>
  apiRequest<{ migrated: number }>('migrateInlineImages', { sessionToken });

export const findLegacyAppData = (): AppDataToSave | null => {
  const knownKeys = ['qlda-app-data', 'qlda-database', 'qlda-data', 'qlda_data', 'qldaData', 'appData', 'database'];
  const legacyKeys = [
    ...knownKeys,
    ...Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => key !== null && !knownKeys.includes(key)),
  ];
  for (const key of legacyKeys) {
    const serialized = localStorage.getItem(key);
    if (!serialized) continue;

    try {
      const value: unknown = JSON.parse(serialized);
      if (
        typeof value === 'object' &&
        value !== null &&
        'projects' in value &&
        Array.isArray(value.projects) &&
        'dailyLogs' in value &&
        Array.isArray(value.dailyLogs) &&
        'bulletins' in value &&
        Array.isArray(value.bulletins)
      ) {
        return {
          projects: value.projects as UndergroundProject[],
          dailyLogs: value.dailyLogs as DailyLogEntry[],
          bulletins: value.bulletins as SiteBulletin[],
          planTypes:
            'planTypes' in value && Array.isArray(value.planTypes)
              ? (value.planTypes as PlanType[])
              : [],
        };
      }
    } catch {
      continue;
    }
  }
  return null;
};

const getApiResult = async <T,>(action: string, data?: unknown): Promise<T> => {
  const url = new URL(await resolveApiUrl());
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...((data as object) || {}) }),
  });
  if (!response.ok) throw new Error(`Google Apps Script trả về lỗi HTTP ${response.status}.`);
  return parseApiResponse<T>(await response.json());
};

export const searchPlaces = (
  query: string,
  signal?: AbortSignal
): Promise<PlaceSearchResult[]> => {
  const runner = getAppsScriptRunner();
  if (runner) {
    return new Promise((resolve, reject) => {
      runner
        .withSuccessHandler((value) => {
          if (
            !Array.isArray(value) ||
            !value.every(
              (result) =>
                typeof result === 'object' &&
                result !== null &&
                'place_id' in result &&
                typeof result.place_id === 'number' &&
                'display_name' in result &&
                typeof result.display_name === 'string' &&
                'lat' in result &&
                typeof result.lat === 'string' &&
                'lon' in result &&
                typeof result.lon === 'string'
            )
          ) {
            reject(new Error('Apps Script trả về kết quả tìm địa điểm không hợp lệ.'));
            return;
          }
          resolve(value as PlaceSearchResult[]);
        })
        .withFailureHandler((error) => reject(normalizeAppsScriptError(error)))
        .searchPlaces(query);
    });
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', query);
  url.searchParams.set('countrycodes', 'vn');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');
  return fetch(url, {
    signal,
    headers: { 'Accept-Language': 'vi' },
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Dịch vụ tìm địa điểm trả về lỗi (${response.status}).`);
    }
    const results: unknown = await response.json();
    if (
      !Array.isArray(results) ||
      !results.every(
        (result) =>
          typeof result === 'object' &&
          result !== null &&
          'place_id' in result &&
          typeof result.place_id === 'number' &&
          'display_name' in result &&
          typeof result.display_name === 'string' &&
          'lat' in result &&
          typeof result.lat === 'string' &&
          'lon' in result &&
          typeof result.lon === 'string'
      )
    ) {
      throw new Error('Dữ liệu tìm địa điểm không hợp lệ.');
    }
    return results as PlaceSearchResult[];
  });
};

const normalizeAppsScriptError = (error: unknown): Error => {
  if (error instanceof Error) return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = error.message;
    if (typeof message === 'string' && message.trim()) {
      return new Error(message.replace(/^Error:\s*/, ''));
    }
  }
  return new Error('Lỗi không xác định từ Google Apps Script.');
};

const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Không thể đọc tệp ảnh đã chọn.'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error || new Error('Không thể đọc tệp ảnh đã chọn.'));
    reader.readAsDataURL(file);
  });

export const uploadViolationImage = async (
  file: File,
  sessionToken?: string
): Promise<string> => {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Ảnh phải có định dạng JPEG, PNG, WebP hoặc GIF.');
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Ảnh vượt quá 8 MB. Hãy chọn ảnh có dung lượng nhỏ hơn.');
  }

  const dataUrl = await readFileAsDataUrl(file);
  const runner = getAppsScriptRunner();
  if (!runner && !isRemoteDatabaseConfigured()) return dataUrl;
  if (!sessionToken) {
    throw new Error('Hãy đăng nhập quyền chỉnh sửa trước khi tải ảnh lên Google Drive.');
  }

  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (!match) throw new Error('Không thể xử lý dữ liệu ảnh đã chọn.');

  if (!runner) {
    const result = await getApiResult<{ url: string }>('uploadViolationImage', {
      base64Data: match[2],
      fileName: file.name,
      mimeType: match[1],
      sessionToken,
    });
    if (typeof result.url !== 'string') throw new Error('Apps Script trả về liên kết ảnh không hợp lệ.');
    return result.url;
  }

  return new Promise((resolve, reject) => {
    runner
      .withSuccessHandler((value) => {
        if (
          typeof value !== 'object' ||
          value === null ||
          !('url' in value) ||
          typeof value.url !== 'string'
        ) {
          reject(new Error('Apps Script trả về liên kết ảnh không hợp lệ.'));
          return;
        }
        resolve(value.url);
      })
      .withFailureHandler((error) => reject(normalizeAppsScriptError(error)))
      .uploadViolationImage(match[2], file.name, match[1], sessionToken);
  });
};

export const deleteViolationImage = (
  photoUrl: string,
  sessionToken?: string
): Promise<void> => {
  const fileId = getGoogleDriveFileId(photoUrl);
  const runner = getAppsScriptRunner();
  if (!fileId || (!runner && !isRemoteDatabaseConfigured())) return Promise.resolve();
  if (!sessionToken) {
    return Promise.reject(new Error('Hãy đăng nhập quyền chỉnh sửa để xóa ảnh trên Google Drive.'));
  }

  if (!runner) {
    return getApiResult('deleteViolationImage', { fileId, sessionToken }).then(() => undefined);
  }

  return new Promise((resolve, reject) => {
    runner
      .withSuccessHandler(() => resolve())
      .withFailureHandler((error) => reject(normalizeAppsScriptError(error)))
      .deleteViolationImage(fileId, sessionToken);
  });
};

export const verifyEditPassword = (password: string): Promise<{ token: string }> =>
  getAppsScriptRunner()
    ? new Promise((resolve, reject) => {
        getAppsScriptRunner()!
          .withSuccessHandler((value) => {
            if (
              typeof value !== 'object' ||
              value === null ||
              !('token' in value) ||
              typeof value.token !== 'string'
            ) {
              reject(new Error('Apps Script trả về phiên đăng nhập không hợp lệ.'));
              return;
            }
            resolve({ token: value.token });
          })
          .withFailureHandler((error) => reject(normalizeAppsScriptError(error)))
          .verifyEditPassword(password);
      })
    : isRemoteDatabaseConfigured()
      ? getApiResult<{ token: string }>('verifyEditPassword', { password }).then((result) => {
          if (typeof result.token !== 'string') {
            throw new Error('Apps Script trả về phiên đăng nhập không hợp lệ.');
          }
          return result;
        })
      : Promise.reject(new Error('Không tìm thấy kết nối Google Apps Script.'));
