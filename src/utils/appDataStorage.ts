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
  revision: number;
}

interface GoogleAppsScriptRunner {
  withSuccessHandler(callback: (value: unknown) => void): GoogleAppsScriptRunner;
  withFailureHandler(callback: (error: unknown) => void): GoogleAppsScriptRunner;
  getAppData(sessionToken?: string): void;
  saveAppData(data: AppDataToSave, sessionToken: string, expectedRevision: number): void;
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

const isRecordWithId = (value: unknown): value is { id: string } =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string';

const isAppDataSnapshot = (
  value: unknown
): value is Omit<AppDataSnapshot, 'planTypes'> & { planTypes?: PlanType[] } => {
  if (typeof value !== 'object' || value === null) return false;

  const snapshot = value as Record<string, unknown>;
  return (
    Array.isArray(snapshot.projects) &&
    snapshot.projects.every(isRecordWithId) &&
    Array.isArray(snapshot.dailyLogs) &&
    snapshot.dailyLogs.every(isRecordWithId) &&
    Array.isArray(snapshot.bulletins) &&
    snapshot.bulletins.every(isRecordWithId) &&
    (snapshot.planTypes === undefined ||
      (Array.isArray(snapshot.planTypes) &&
        snapshot.planTypes.every(
          (planType) =>
            isRecordWithId(planType) &&
            'name' in planType &&
            typeof planType.name === 'string'
        ))) &&
    typeof snapshot.isInitialized === 'boolean' &&
    typeof snapshot.canWrite === 'boolean' &&
    typeof snapshot.revision === 'number' &&
    Number.isInteger(snapshot.revision) &&
    snapshot.revision >= 0
  );
};

export const loadAppData = (sessionToken?: string): Promise<AppDataSnapshot> =>
  new Promise((resolve, reject) => {
    const runner = getAppsScriptRunner();
    if (!runner) {
      reject(new Error('Không tìm thấy kết nối Google Apps Script.'));
      return;
    }

    runner
      .withSuccessHandler((value) => {
        if (!isAppDataSnapshot(value)) {
          reject(new Error('Google Sheets trả về dữ liệu không đúng định dạng.'));
          return;
        }
        resolve({ ...value, planTypes: value.planTypes || [] });
      })
      .withFailureHandler((error) => reject(normalizeAppsScriptError(error)))
      .getAppData(sessionToken);
  });

export const saveAppData = (
  data: AppDataToSave,
  sessionToken: string,
  expectedRevision: number
): Promise<number> =>
  new Promise((resolve, reject) => {
    const runner = getAppsScriptRunner();
    if (!runner) {
      reject(new Error('Không tìm thấy kết nối Google Apps Script.'));
      return;
    }

    runner
      .withSuccessHandler((value) => {
        if (
          typeof value !== 'object' ||
          value === null ||
          !('revision' in value) ||
          typeof value.revision !== 'number' ||
          !Number.isInteger(value.revision) ||
          value.revision < 0
        ) {
          reject(new Error('Apps Script trả về phiên bản dữ liệu không hợp lệ.'));
          return;
        }
        resolve(value.revision);
      })
      .withFailureHandler((error) => reject(normalizeAppsScriptError(error)))
      .saveAppData(data, sessionToken, expectedRevision);
  });

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
  if (!runner) return dataUrl;
  if (!sessionToken) {
    throw new Error('Hãy đăng nhập quyền chỉnh sửa trước khi tải ảnh lên Google Drive.');
  }

  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (!match) throw new Error('Không thể xử lý dữ liệu ảnh đã chọn.');

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
  if (!fileId || !runner) return Promise.resolve();
  if (!sessionToken) {
    return Promise.reject(new Error('Hãy đăng nhập quyền chỉnh sửa để xóa ảnh trên Google Drive.'));
  }

  return new Promise((resolve, reject) => {
    runner
      .withSuccessHandler(() => resolve())
      .withFailureHandler((error) => reject(normalizeAppsScriptError(error)))
      .deleteViolationImage(fileId, sessionToken);
  });
};

export const verifyEditPassword = (password: string): Promise<{ token: string }> =>
  new Promise((resolve, reject) => {
    const runner = getAppsScriptRunner();
    if (!runner) {
      reject(new Error('Không tìm thấy kết nối Google Apps Script.'));
      return;
    }

    runner
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
  });
