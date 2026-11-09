import type { AppDataToSave } from './appDataStorage';
import type {
  DailyLogEntry,
  PlanType,
  SiteBulletin,
  UndergroundProject,
} from '../types/undergrounding';

const BACKUP_VERSION = '1';
const CHUNK_SIZE = 30000;
const COLLECTION_SHEETS = [
  { key: 'projects', sheetName: 'DuAn', label: 'Dự án' },
  { key: 'dailyLogs', sheetName: 'NhatKyNgay', label: 'Nhật ký ngày' },
  { key: 'bulletins', sheetName: 'ThongBao', label: 'Thông báo' },
  { key: 'planTypes', sheetName: 'LoaiKeHoach', label: 'Loại kế hoạch' },
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasStringFields = (value: Record<string, unknown>, fields: string[]) =>
  fields.every((field) => typeof value[field] === 'string');

const hasNumberFields = (value: Record<string, unknown>, fields: string[]) =>
  fields.every((field) => typeof value[field] === 'number' && Number.isFinite(value[field]));

const isRoutePoint = (value: unknown) =>
  isRecord(value) &&
  hasStringFields(value, ['id', 'name']) &&
  ['start', 'turn', 'end'].includes(String(value.type)) &&
  hasNumberFields(value, ['lat', 'lng']);

const isProject = (value: unknown): value is UndergroundProject =>
  isRecord(value) &&
  hasStringFields(value, [
    'id',
    'name',
    'code',
    'investor',
    'contractor',
    'startDate',
    'finishDate',
    'startPointName',
    'endPointName',
    'currentWorkLocation',
  ]) &&
  (value.status === undefined ||
    ['in_progress', 'paused', 'completed'].includes(String(value.status))) &&
  (value.contractors === undefined ||
    (Array.isArray(value.contractors) &&
      value.contractors.every(
        (contractor) =>
          isRecord(contractor) &&
          hasStringFields(contractor, ['id', 'name', 'color', 'startPointId', 'endPointId']) &&
          /^#[\da-f]{6}$/i.test(String(contractor.color)) &&
          hasNumberFields(contractor, ['totalLengthM', 'totalChambers', 'contractValueVND']) &&
          Array.isArray(contractor.routePoints) &&
          contractor.routePoints.length >= 2 &&
          contractor.routePoints.every(isRoutePoint)
      ))) &&
  (value.planTypeId === undefined || typeof value.planTypeId === 'string') &&
  hasNumberFields(value, [
    'contractValueVND',
    'totalLengthM',
    'totalChambers',
    'completedLengthM',
    'completedChambers',
  ]) &&
  Array.isArray(value.points) &&
  value.points.every(isRoutePoint) &&
  Array.isArray(value.chambers) &&
  Array.isArray(value.photos);

const isDailyLog = (value: unknown): value is DailyLogEntry =>
  isRecord(value) &&
  hasStringFields(value, [
    'id',
    'date',
    'contractorName',
    'projectId',
    'projectName',
    'resources',
  ]) &&
  hasNumberFields(value, [
    'stt',
    'excavationTodayM',
    'chambersPouredToday',
    'cumulativeTrenchM',
    'contractTrenchM',
    'cumulativeChambers',
    'contractChambers',
  ]);

const isBulletin = (value: unknown): value is SiteBulletin =>
  isRecord(value) &&
  hasStringFields(value, ['id', 'title', 'projectId', 'projectName', 'author', 'date', 'content']) &&
  typeof value.isActive === 'boolean' &&
  ['critical', 'warning', 'info'].includes(String(value.severity));

const isPlanType = (value: unknown): value is PlanType =>
  isRecord(value) && hasStringFields(value, ['id', 'name']);

const hasUniqueIds = (records: Array<{ id: string }>) =>
  new Set(records.map((record) => record.id)).size === records.length;

const cellText = (value: unknown): string => {
  if (typeof value === 'object' && value !== null) {
    if ('result' in value) return cellText(value.result);
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => ('text' in part ? part.text : '')).join('').trim();
    }
  }
  return value === null || value === undefined ? '' : String(value).trim();
};

const cellRawText = (value: unknown): string => {
  if (typeof value === 'object' && value !== null) {
    if ('result' in value) return cellRawText(value.result);
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => ('text' in part ? part.text : '')).join('');
    }
  }
  return value === null || value === undefined ? '' : String(value);
};

const validateBackupData = (value: unknown): AppDataToSave => {
  if (!isRecord(value)) throw new Error('Dữ liệu sao lưu không đúng định dạng.');
  const projects = Array.isArray(value.projects) ? value.projects.filter(isProject) : [];
  const dailyLogs = Array.isArray(value.dailyLogs) ? value.dailyLogs.filter(isDailyLog) : [];
  const bulletins = Array.isArray(value.bulletins) ? value.bulletins.filter(isBulletin) : [];
  const planTypes = Array.isArray(value.planTypes) ? value.planTypes.filter(isPlanType) : [];
  if (!Array.isArray(value.projects) || projects.length !== value.projects.length || !hasUniqueIds(projects)) {
    throw new Error('Danh sách dự án không hợp lệ hoặc có mã bản ghi trùng.');
  }
  if (!Array.isArray(value.dailyLogs) || dailyLogs.length !== value.dailyLogs.length || !hasUniqueIds(dailyLogs)) {
    throw new Error('Danh sách nhật ký không hợp lệ hoặc có mã bản ghi trùng.');
  }
  if (!Array.isArray(value.bulletins) || bulletins.length !== value.bulletins.length || !hasUniqueIds(bulletins)) {
    throw new Error('Danh sách thông báo không hợp lệ hoặc có mã bản ghi trùng.');
  }
  if (!Array.isArray(value.planTypes) || planTypes.length !== value.planTypes.length || !hasUniqueIds(planTypes)) {
    throw new Error('Danh sách loại kế hoạch không hợp lệ hoặc có mã bản ghi trùng.');
  }

  return {
    projects,
    dailyLogs,
    bulletins,
    planTypes,
  };
};

export async function exportDataBackupToExcel(data: AppDataToSave): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QLDA';
  workbook.created = new Date();

  const guide = workbook.addWorksheet('HuongDan');
  guide.addRows([
    ['Sao lưu dữ liệu QLDA', ''],
    ['Phiên bản', BACKUP_VERSION],
    ['Ngày sao lưu', new Date().toLocaleString('vi-VN')],
    ['Nội dung', 'Tệp này gồm toàn bộ dự án, nhật ký ngày, thông báo và loại kế hoạch.'],
    ['Khôi phục', 'Dùng chức năng Nhập dữ liệu sao lưu trong trang Quản lý dự án. Thao tác nhập sẽ thay thế dữ liệu hiện tại.'],
  ]);
  guide.getColumn(1).width = 22;
  guide.getColumn(2).width = 100;
  guide.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF1D4ED8' } };
  guide.eachRow((row) => {
    row.alignment = { vertical: 'middle', wrapText: true };
  });

  COLLECTION_SHEETS.forEach(({ key, sheetName, label }) => {
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.addRow(['record_id', 'display_label', 'part_index', 'part_count', 'json_chunk']);
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };
    const records = data[key];
    records.forEach((record) => {
      const serialized = JSON.stringify(record);
      const chunks = serialized.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, 'g')) || [''];
      const labelValue = 'name' in record
        ? record.name
        : 'title' in record
        ? record.title
        : 'date' in record
        ? record.date
        : '';
      chunks.forEach((chunk, index) => {
        worksheet.addRow([record.id, labelValue, index + 1, chunks.length, chunk]);
      });
    });
    worksheet.columns = [
      { width: 30 },
      { width: 42 },
      { width: 12 },
      { width: 14 },
      { width: 60 },
    ];
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1D4ED8' },
    };
    worksheet.getCell('G1').value = `${label}: ${records.length} bản ghi`;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `Sao_Luu_QLDA_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function importDataBackupFromExcel(file: File): Promise<AppDataToSave> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const guide = workbook.getWorksheet('HuongDan');
  if (!guide || cellText(guide.getCell('B2').value) !== BACKUP_VERSION) {
    throw new Error('Đây không phải tệp sao lưu QLDA hợp lệ hoặc phiên bản không được hỗ trợ.');
  }

  const result: Record<string, unknown[]> = {};
  COLLECTION_SHEETS.forEach(({ key, sheetName }) => {
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) throw new Error(`Tệp sao lưu thiếu trang tính "${sheetName}".`);
    const headers = Array.from({ length: 5 }, (_, index) =>
      cellText(worksheet.getCell(1, index + 1).value)
    );
    if (headers.join('|') !== 'record_id|display_label|part_index|part_count|json_chunk') {
      throw new Error(`Cấu trúc trang tính "${sheetName}" không hợp lệ.`);
    }

    const grouped = new Map<string, { total: number; chunks: Map<number, string> }>();
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const id = cellText(row.getCell(1).value);
      if (!id) continue;
      const part = Number(row.getCell(3).value);
      const total = Number(row.getCell(4).value);
      const chunk = cellRawText(row.getCell(5).value);
      if (!Number.isInteger(part) || !Number.isInteger(total) || part < 1 || part > total || !chunk) {
        throw new Error(`Dữ liệu bị thiếu hoặc sai tại ${sheetName}, dòng ${rowNumber}.`);
      }
      const entry = grouped.get(id) || { total, chunks: new Map<number, string>() };
      if (entry.total !== total || entry.chunks.has(part)) {
        throw new Error(`Dữ liệu phần bị trùng hoặc không thống nhất tại ${sheetName}, dòng ${rowNumber}.`);
      }
      entry.chunks.set(part, chunk);
      grouped.set(id, entry);
    }

    result[key] = Array.from(grouped.entries()).map(([id, entry]) => {
      if (entry.chunks.size !== entry.total) {
        throw new Error(`Bản ghi "${id}" trong "${sheetName}" bị thiếu dữ liệu.`);
      }
      const serialized = Array.from({ length: entry.total }, (_, index) => entry.chunks.get(index + 1) || '').join('');
      let record: unknown;
      try {
        record = JSON.parse(serialized);
      } catch {
        throw new Error(`Không thể đọc bản ghi "${id}" trong "${sheetName}".`);
      }
      if (!isRecord(record) || record.id !== id) {
        throw new Error(`Mã bản ghi không khớp trong "${sheetName}".`);
      }
      return record;
    });
  });

  return validateBackupData(result);
}
