import type { Workbook } from 'exceljs';
import { DailyLogEntry, UndergroundProject } from '../types/undergrounding';
import { getDailyLogPhotoUrls } from './dailyLogPhotos';
import { getViolationPhotoUrls } from './violationPhotos';
import { getContractorKey } from './progressUtils';

export type ExportPeriod = 'week' | 'month' | 'year';

export interface ProjectPeriodExportResult {
  startDate: string;
  endDate: string;
  logCount: number;
  imageCount: number;
}

export type ImportedDailyLog = Pick<
  DailyLogEntry,
  | 'date'
  | 'projectId'
  | 'projectName'
  | 'contractorName'
  | 'resources'
  | 'excavationTodayM'
  | 'chambersPouredToday'
  | 'pipeLaidTodayM'
  | 'restoredTodayM'
  | 'stoppageReason'
  | 'supervisorName'
  | 'notes'
> &
  Partial<Pick<DailyLogEntry, 'contractTrenchM' | 'contractChambers'>>;

const HEADERS = [
  'Ngày báo cáo (YYYY-MM-DD)',
  'Mã dự án',
  'Dự án',
  'Nhà thầu',
  'Nguồn lực',
  'Đào phui hôm nay (m)',
  'Đổ hố ga hôm nay',
  'Lắp ống hôm nay (m)',
  'Hoàn trả hôm nay (m)',
  'Khối lượng HĐ mương cáp (m)',
  'Khối lượng HĐ bể cáp (hầm)',
  'Lý do ngưng',
  'Giám sát',
  'Ghi chú',
];

const EXPORT_HEADERS = [
  ...HEADERS.slice(0, 9),
  'Lũy kế mương cáp (m)',
  HEADERS[9],
  'Tỉ lệ hoàn thành mương cáp',
  'Lũy kế bể cáp (hầm)',
  HEADERS[10],
  ...HEADERS.slice(11),
];

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['ngaybaocaoyyyymmdd', 'ngaybaocao', 'ngay', 'date'],
  projectCode: ['maduan', 'maduaan', 'projectcode', 'code'],
  projectName: ['duan', 'tenduan', 'project', 'projectname'],
  contractorName: ['nhathau', 'tennhathau', 'contractor', 'contractorname'],
  resources: ['nguonluc', 'resources'],
  excavationTodayM: ['daophuihomnaym', 'kl daophui/ngaymet', 'excavationtodaym'],
  chambersPouredToday: ['dohogahomnay', 'khoiluongdohogahomnay', 'chamberspouredtoday'],
  pipeLaidTodayM: ['laponghomnaym', 'pipeLaidTodayM'],
  restoredTodayM: ['hoantrahomnaym', 'restoredTodayM'],
  contractTrenchM: ['khoiluonghdmuongcapm', 'contractTrenchM'],
  contractChambers: ['khoiluonghdbecapham', 'contractChambers'],
  stoppageReason: ['lydongung', 'stoppagereason'],
  supervisorName: ['giamsat', 'supervisor', 'supervisorname'],
  notes: ['ghichu', 'notes'],
};

function cellText(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    if ('result' in value) return cellText(value.result);
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => ('text' in part ? part.text : '')).join('').trim();
    }
  }
  return value === null || value === undefined ? '' : String(value).trim();
}

function parseDate(value: unknown): string | null {
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return parseDate(value.result);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
      value.getDate()
    ).padStart(2, '0')}`;
  }
  if (typeof value === 'number') {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
      date.getUTCDate()
    ).padStart(2, '0')}`;
  }

  const input = cellText(value);
  const isoDate = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const localDate = input.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const parts = isoDate
    ? [Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3])]
    : localDate
    ? [Number(localDate[3]), Number(localDate[2]), Number(localDate[1])]
    : null;
  if (!parts) return null;

  const [year, month, day] = parts;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let text = cellText(value).replace(/\s/g, '');
  if (!text) return 0;
  if (text.includes(',') && text.includes('.')) {
    text = text.lastIndexOf(',') > text.lastIndexOf('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function columnIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = new Set(aliases.map(normalize));
  return headers.findIndex((header) => normalizedAliases.has(normalize(header)));
}

function valueAt(row: unknown[], index: number): unknown {
  return index < 0 ? '' : row[index];
}

export function exportDailyLogsToExcel(
  logs: DailyLogEntry[],
  projects: UndergroundProject[],
  filename: string
): Promise<void> {
  return createDailyLogWorkbook(logs, projects, filename);
}

export async function exportProjectLogsByPeriod(
  dailyLogs: DailyLogEntry[],
  projects: UndergroundProject[],
  projectId: string,
  period: ExportPeriod,
  anchorDate: string
): Promise<ProjectPeriodExportResult> {
  const { startDate, endDate } = getExportPeriodBounds(anchorDate, period);
  return exportProjectLogsByRange(
    dailyLogs,
    projects,
    projectId,
    startDate,
    endDate
  );
}

export async function exportProjectLogsByRange(
  dailyLogs: DailyLogEntry[],
  projects: UndergroundProject[],
  projectId: string,
  startDate: string,
  endDate: string,
  contractorKey = 'all'
): Promise<ProjectPeriodExportResult> {
  const project = projects.find((item) => item.id === projectId);
  if (!project) throw new Error('Vui lòng chọn tuyến/dự án cần xuất dữ liệu.');
  if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) {
    throw new Error('Khoảng ngày xuất báo cáo không hợp lệ.');
  }
  if (startDate > endDate) {
    throw new Error('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
  }
  const logs = dailyLogs
    .filter(
      (log) =>
        log.projectId === projectId &&
        log.date >= startDate &&
        log.date <= endDate &&
        (contractorKey === 'all' || getContractorKey(log.contractorName) === contractorKey)
    )
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.contractorName.localeCompare(right.contractorName, 'vi')
    );
  if (logs.length === 0) {
    throw new Error(
      `Không có nhật ký của tuyến "${project.name}" trong khoảng ${startDate} đến ${endDate}.`
    );
  }

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QLDA';
  workbook.created = new Date();
  const summarySheet = workbook.addWorksheet('TongHopNgay');
  const detailSheet = workbook.addWorksheet('NhatKyChiTiet');
  const imageSheet = workbook.addWorksheet('HinhAnh');
  const projectCode = project.code || project.id;
  const contractorLabel =
    contractorKey === 'all'
      ? [...new Set(logs.map((log) => log.contractorName))].join(', ')
      : logs.find((log) => getContractorKey(log.contractorName) === contractorKey)?.contractorName ||
        contractorKey;

  summarySheet.addRows([
    ['BÁO CÁO KHỐI LƯỢNG THI CÔNG THEO KHOẢNG NGÀY'],
    ['Tuyến / dự án', project.name],
    ['Mã dự án', projectCode],
    ['Khoảng ngày', `${startDate} đến ${endDate}`],
    ['Nhà thầu', contractorLabel],
    ['Số nhật ký', logs.length],
    [],
    [
      'Ngày',
      'Số nhật ký',
      'Số biên bản sai phạm',
      'Đào phui hôm nay (m)',
      'Lắp ống hôm nay (m)',
      'Hoàn trả hôm nay (m)',
      'Đổ hố ga hôm nay',
      'Ảnh báo cáo và sai phạm',
    ],
  ]);
  const logsByDate = new Map<string, DailyLogEntry[]>();
  logs.forEach((log) => {
    const dateLogs = logsByDate.get(log.date) || [];
    dateLogs.push(log);
    logsByDate.set(log.date, dateLogs);
  });
  [...logsByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([date, dateLogs]) => {
      summarySheet.addRow([
        date,
        dateLogs.length,
        dateLogs.filter((log) => log.violationReport?.hasViolation).length,
        dateLogs.reduce((sum, log) => sum + (log.excavationTodayM || 0), 0),
        dateLogs.reduce((sum, log) => sum + (log.pipeLaidTodayM || 0), 0),
        dateLogs.reduce((sum, log) => sum + (log.restoredTodayM || 0), 0),
        dateLogs.reduce((sum, log) => sum + (log.chambersPouredToday || 0), 0),
        dateLogs.reduce(
          (sum, log) =>
            sum + getDailyLogPhotoUrls(log).length + getViolationPhotoUrls(log.violationReport).length,
          0
        ),
      ]);
    });

  const detailHeaders = [
    'Mã nhật ký',
    'Ngày',
    'STT',
    'Mã dự án',
    'Dự án',
    'Nhà thầu',
    'Nguồn lực',
    'Đào phui hôm nay (m)',
    'Đổ hố ga hôm nay',
    'Lắp ống hôm nay (m)',
    'Hoàn trả hôm nay (m)',
    'Lũy kế mương cáp (m)',
    'Hợp đồng mương cáp (m)',
    'Tỷ lệ mương cáp',
    'Lũy kế hố ga',
    'Hợp đồng hố ga',
    'Lý do ngưng',
    'Giám sát',
    'Ghi chú',
    'Có sai phạm',
    'ID biên bản',
    'Mã biên bản',
    'Loại sai phạm (mã)',
    'Loại sai phạm',
    'Mô tả sai phạm',
    'Biện pháp khắc phục',
    'Hạn khắc phục (giờ)',
    'Trạng thái sai phạm',
    'Người lập biên bản',
    'Link ảnh báo cáo',
    'Link ảnh sai phạm',
  ];
  detailSheet.addRow(detailHeaders);

  const imageHeaders = [
    'Ngày',
    'Mã nhật ký',
    'Dự án',
    'Nhà thầu',
    'Loại ảnh',
    'Mã biên bản sai phạm',
    'Liên kết mở ảnh',
    'URL ảnh',
  ];
  imageSheet.addRow(imageHeaders);
  let imageCount = 0;

  logs.forEach((log) => {
    const dailyPhotos = getDailyLogPhotoUrls(log);
    const violationPhotos = getViolationPhotoUrls(log.violationReport);
    const violation = log.violationReport;
    detailSheet.addRow([
      log.id,
      log.date,
      log.stt,
      projectCode,
      log.projectName,
      log.contractorName,
      log.resources,
      log.excavationTodayM,
      log.chambersPouredToday,
      log.pipeLaidTodayM ?? 0,
      log.restoredTodayM ?? 0,
      log.cumulativeTrenchM,
      log.contractTrenchM,
      log.contractTrenchM > 0
        ? `${((log.cumulativeTrenchM / log.contractTrenchM) * 100).toFixed(1)}%`
        : '0%',
      log.cumulativeChambers,
      log.contractChambers,
      log.stoppageReason || '',
      log.supervisorName || '',
      log.notes || '',
      violation?.hasViolation ? 'Có' : 'Không',
      violation?.id || '',
      violation?.code || '',
      violation?.violationType || '',
      violation?.violationTypeLabel || '',
      violation?.description || '',
      violation?.correctiveAction || '',
      violation?.deadlineHours ?? '',
      violation?.status || '',
      violation?.supervisorSign || '',
      dailyPhotos.join('\n'),
      violationPhotos.join('\n'),
    ]);

    dailyPhotos.forEach((url) => {
      imageSheet.addRow([
        log.date,
        log.id,
        log.projectName,
        log.contractorName,
        'Ảnh báo cáo thi công',
        '',
        { text: 'Mở ảnh', hyperlink: url },
        url,
      ]);
      imageCount += 1;
    });
    violationPhotos.forEach((url) => {
      imageSheet.addRow([
        log.date,
        log.id,
        log.projectName,
        log.contractorName,
        'Ảnh biên bản sai phạm',
        violation?.code || '',
        { text: 'Mở ảnh', hyperlink: url },
        url,
      ]);
      imageCount += 1;
    });
  });

  formatExportWorksheet(summarySheet, 8);
  formatExportWorksheet(detailSheet, 1);
  formatExportWorksheet(imageSheet, 1);
  summarySheet.getColumn(1).width = 28;
  summarySheet.getColumn(8).width = 28;
  detailSheet.columns = detailHeaders.map((header) => ({ width: Math.max(16, Math.min(42, header.length + 3)) }));
  detailSheet.getColumn(23).width = 48;
  detailSheet.getColumn(24).width = 48;
  detailSheet.getColumn(28).width = 48;
  detailSheet.getColumn(29).width = 48;
  detailSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
  imageSheet.columns = imageHeaders.map((header) => ({ width: Math.max(18, Math.min(42, header.length + 3)) }));
  imageSheet.getColumn(7).eachCell((cell, rowNumber) => {
    if (rowNumber > 1) {
      cell.font = { color: { argb: 'FF0563C1' }, underline: true };
    }
  });

  const safeProjectCode = projectCode.replace(/[^a-z0-9_-]/gi, '_');
  await downloadWorkbook(
    workbook,
    `Bao_Cao_${safeProjectCode}_${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}.xlsx`
  );
  return { startDate, endDate, logCount: logs.length, imageCount };
}

function getExportPeriodBounds(
  anchorDate: string,
  period: ExportPeriod
): { startDate: string; endDate: string } {
  if (!isValidDateKey(anchorDate)) throw new Error('Ngày chọn để xuất báo cáo không hợp lệ.');
  const [yearText, monthText, dayText] = anchorDate.split('-');
  const anchor = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));

  let start: Date;
  let end: Date;
  if (period === 'week') {
    start = new Date(anchor);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
  } else if (period === 'month') {
    start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  } else {
    start = new Date(Date.UTC(anchor.getUTCFullYear(), 0, 1));
    end = new Date(Date.UTC(anchor.getUTCFullYear(), 11, 31));
  }

  const toDateKey = (date: Date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
      date.getUTCDate()
    ).padStart(2, '0')}`;
  return { startDate: toDateKey(start), endDate: toDateKey(end) };
}

function isValidDateKey(dateKey: string): boolean {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

function formatExportWorksheet(
  worksheet: import('exceljs').Worksheet,
  headerRowNumber: number
): void {
  worksheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];
  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' },
  };
  headerRow.alignment = { vertical: 'middle', wrapText: true };
  headerRow.height = 32;
  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: headerRow.cellCount },
  };
}

async function createDailyLogWorkbook(
  logs: DailyLogEntry[],
  projects: UndergroundProject[],
  filename: string
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('BaoCaoNgay');
  worksheet.addRow(EXPORT_HEADERS);
  logs.forEach((log) => {
    worksheet.addRow([
      log.date,
      projectById.get(log.projectId)?.code || '',
      log.projectName,
      log.contractorName,
      log.resources,
      log.excavationTodayM,
      log.chambersPouredToday,
      log.pipeLaidTodayM ?? 0,
      log.restoredTodayM ?? 0,
      log.cumulativeTrenchM,
      log.contractTrenchM,
      `${log.contractTrenchM > 0 ? Math.round((log.cumulativeTrenchM / log.contractTrenchM) * 100) : 0}%`,
      log.cumulativeChambers,
      log.contractChambers,
      log.stoppageReason || '',
      log.supervisorName || '',
      log.notes || '',
    ]);
  });
  worksheet.columns = EXPORT_HEADERS.map((header) => ({
    width: Math.max(16, header.length + 2),
  }));
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' },
  };
  return downloadWorkbook(workbook, filename);
}

export async function downloadDailyLogExcelTemplate(): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('MauBaoCao');
  worksheet.addRow(HEADERS);
  worksheet.columns = HEADERS.map((header) => ({
    width: Math.max(16, header.length + 2),
  }));
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' },
  };
  return downloadWorkbook(workbook, 'Mau_Nhap_Bao_Cao_Ngay.xlsx');
}

export async function downloadProjectHistoryTemplate(
  project: UndergroundProject,
  dailyLogs: DailyLogEntry[],
  throughDate: string
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('NhatKyDuAn');
  worksheet.addRow(HEADERS);
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: HEADERS.length },
  };

  const logsByDate = new Map<string, DailyLogEntry[]>();
  dailyLogs
    .filter((log) => log.projectId === project.id && log.date < throughDate)
    .forEach((log) => {
      const dateLogs = logsByDate.get(log.date) || [];
      dateLogs.push(log);
      logsByDate.set(log.date, dateLogs);
    });

  const [startYear, startMonth, startDay] = project.startDate.split('-').map(Number);
  const cursor = new Date(startYear, startMonth - 1, startDay);
  const [endYear, endMonth, endDay] = throughDate.split('-').map(Number);
  const end = new Date(endYear, endMonth - 1, endDay);

  while (cursor < end) {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
      cursor.getDate()
    ).padStart(2, '0')}`;
    if (date > project.finishDate) break;
    const dateLogs = logsByDate.get(date);
    const templateRows = dateLogs?.length
      ? dateLogs.map((log) => [
          date,
          project.code,
          project.name,
          log.contractorName,
          log.resources,
          log.excavationTodayM,
          log.chambersPouredToday,
          log.pipeLaidTodayM ?? '',
          log.restoredTodayM ?? '',
          '',
          '',
          log.stoppageReason || '',
          log.supervisorName || '',
          log.notes || '',
        ])
      : [[date, project.code, project.name, project.contractor, '', '', '', '', '', '', '', '', '', '']];
    templateRows.forEach((row) => worksheet.addRow(row));
    cursor.setDate(cursor.getDate() + 1);
  }

  worksheet.columns = HEADERS.map((header, index) => ({
    width: index < 4 ? Math.max(18, header.length + 2) : Math.max(16, header.length + 2),
  }));
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' },
  };
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.getCell(1).numFmt = '@';
    if (row.getCell(5).value === null || row.getCell(5).value === '') {
      row.getCell(5).note = 'Nhập nguồn lực hoặc lý do nghỉ. Dòng để trống sẽ không được nhập.';
    }
  });

  const instructions = workbook.addWorksheet('HuongDan');
  instructions.addRows([
    ['MẪU CẬP NHẬT NHẬT KÝ THI CÔNG', ''],
    ['Dự án', `${project.code} - ${project.name}`],
    ['Phạm vi ngày', `Từ ${project.startDate} đến trước ${throughDate}`],
    ['Cách nhập', 'Mỗi dòng tương ứng một ngày và một nhà thầu. Có thể cập nhật các dòng đã điền sẵn hoặc nhập thêm dữ liệu vào ngày để trống.'],
    ['Sản lượng', 'Nhập số mét đào, số hố ga đổ, mét ống lắp và mét hoàn trả trong ngày. Không nhập lũy kế; hệ thống tự tính lũy kế.'],
    ['Ngày nghỉ', 'Nhập lý do vào cột Nguồn lực hoặc Lý do ngưng, ví dụ: Nghỉ do mưa lớn.'],
    ['Ngày không có thi công', 'Để trống các cột dữ liệu của ngày đó; dòng trống sẽ được bỏ qua khi tải lên.'],
    ['Cập nhật', 'Dòng trùng ngày, dự án và nhà thầu sẽ cập nhật nhật ký cũ; dòng mới sẽ tạo nhật ký mới.'],
    ['Lưu ý', 'Không sửa ngày, mã dự án hoặc tên dự án. Để nhập nhiều nhà thầu trong cùng ngày, thêm dòng mới và dùng đúng ngày/mã dự án.'],
  ]);
  instructions.getColumn(1).width = 24;
  instructions.getColumn(2).width = 110;
  instructions.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  instructions.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' },
  };
  instructions.eachRow((row) => {
    row.height = 30;
    row.alignment = { vertical: 'middle', wrapText: true };
  });

  const safeProjectCode = project.code.replace(/[^a-z0-9_-]/gi, '_');
  return downloadWorkbook(workbook, `Nhat_Ky_${safeProjectCode}.xlsx`);
}

async function downloadWorkbook(workbook: Workbook, filename: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function importDailyLogsFromExcel(
  file: File,
  projects: UndergroundProject[],
  expectedProjectId?: string,
  throughDate?: string
): Promise<ImportedDailyLog[]> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('Tệp Excel không có trang tính dữ liệu.');

  const headers = Array.from({ length: worksheet.columnCount }, (_, index) =>
    cellText(worksheet.getCell(1, index + 1).value)
  );
  if (worksheet.rowCount < 2) throw new Error('Tệp Excel chưa có dòng dữ liệu để nhập.');
  const columns = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([field, aliases]) => [field, columnIndex(headers, aliases)])
  );
  if (columns.date < 0 || columns.contractorName < 0 || (columns.projectCode < 0 && columns.projectName < 0)) {
    throw new Error('Thiếu cột bắt buộc: Ngày báo cáo, Nhà thầu và Mã dự án hoặc Dự án.');
  }

  const projectByCode = new Map(projects.map((project) => [normalize(project.code), project]));
  const projectByName = new Map(projects.map((project) => [normalize(project.name), project]));
  const parsedRows: ImportedDailyLog[] = [];
  const seenKeys = new Set<string>();
  const errors: string[] = [];

  for (let lineNumber = 2; lineNumber <= worksheet.rowCount; lineNumber += 1) {
    const row = Array.from({ length: worksheet.columnCount }, (_, index) =>
      worksheet.getCell(lineNumber, index + 1).value
    );
    if (row.every((cell) => cellText(cell) === '')) continue;
    const hasLogData = [
      'resources',
      'excavationTodayM',
      'chambersPouredToday',
      'pipeLaidTodayM',
      'restoredTodayM',
      'stoppageReason',
      'supervisorName',
      'notes',
    ].some((field) => {
      const column = columns[field];
      return column >= 0 && cellText(valueAt(row, column)) !== '';
    });
    if (!hasLogData) continue;

    const date = parseDate(valueAt(row, columns.date));
    const code = cellText(valueAt(row, columns.projectCode));
    const name = cellText(valueAt(row, columns.projectName));
    const project =
      (code && projectByCode.get(normalize(code))) ||
      (name && projectByName.get(normalize(name)));
    const contractorName = cellText(valueAt(row, columns.contractorName));

    if (!date) {
      errors.push(`Dòng ${lineNumber}: ngày báo cáo không hợp lệ.`);
      continue;
    }
    if (!project) {
      errors.push(`Dòng ${lineNumber}: không tìm thấy dự án theo mã hoặc tên đã nhập.`);
      continue;
    }
    if (expectedProjectId && project.id !== expectedProjectId) {
      errors.push(`Dòng ${lineNumber}: mẫu chỉ nhận dữ liệu của dự án đã chọn.`);
      continue;
    }
    if (
      throughDate &&
      (date >= throughDate || date < project.startDate || date > project.finishDate)
    ) {
      errors.push(`Dòng ${lineNumber}: ngày phải nằm trong thời gian thi công và trước ${throughDate}.`);
      continue;
    }
    if (!contractorName) {
      errors.push(`Dòng ${lineNumber}: chưa nhập nhà thầu.`);
      continue;
    }

    const numberFields = [
      'excavationTodayM',
      'chambersPouredToday',
      'pipeLaidTodayM',
      'restoredTodayM',
      'contractTrenchM',
      'contractChambers',
    ] as const;
    const numbers: Partial<Record<(typeof numberFields)[number], number>> = {};
    let hasInvalidNumber = false;
    for (const field of numberFields) {
      const rawValue = valueAt(row, columns[field]);
      const rawText = cellText(rawValue);
      if (!rawText) {
        if (field === 'excavationTodayM' || field === 'chambersPouredToday') {
          numbers[field] = 0;
        }
        continue;
      }
      const value = parseNumber(rawValue);
      if (value === null || value < 0) {
        errors.push(`Dòng ${lineNumber}: giá trị "${HEADERS[columns[field]] || field}" phải là số không âm.`);
        hasInvalidNumber = true;
        break;
      }
      numbers[field] = value;
    }
    if (hasInvalidNumber) continue;

    const key = `${date}:${project.id}:${normalize(contractorName)}`;
    if (seenKeys.has(key)) {
      errors.push(`Dòng ${lineNumber}: trùng dự án, ngày và nhà thầu trong cùng tệp.`);
      continue;
    }
    seenKeys.add(key);
    parsedRows.push({
      date,
      projectId: project.id,
      projectName: project.name,
      contractorName,
      resources: cellText(valueAt(row, columns.resources)),
      excavationTodayM: numbers.excavationTodayM ?? 0,
      chambersPouredToday: numbers.chambersPouredToday ?? 0,
      pipeLaidTodayM: numbers.pipeLaidTodayM,
      restoredTodayM: numbers.restoredTodayM,
      contractTrenchM: columns.contractTrenchM >= 0 ? numbers.contractTrenchM : undefined,
      contractChambers: columns.contractChambers >= 0 ? numbers.contractChambers : undefined,
      stoppageReason: cellText(valueAt(row, columns.stoppageReason)),
      supervisorName: cellText(valueAt(row, columns.supervisorName)),
      notes: cellText(valueAt(row, columns.notes)),
    });
  }

  if (errors.length) {
    throw new Error(`Không nhập dữ liệu vì có lỗi:\n${errors.slice(0, 20).join('\n')}`);
  }
  if (!parsedRows.length) throw new Error('Tệp Excel chưa có dòng dữ liệu hợp lệ để nhập.');
  return parsedRows;
}
