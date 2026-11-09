import { DailyLogEntry } from '../types/undergrounding';
import { formatNumber } from './numberFormat';

export function exportDailyLogsToCsv(
  logs: DailyLogEntry[],
  date: string,
  projectName: string,
  investor: string,
  progressLogs: DailyLogEntry[] = logs
) {
  // Unicode BOM for Excel compatibility with Vietnamese diacritics
  const BOM = '\uFEFF';

  const headers = [
    'STT',
    'Nhà Thầu',
    'Dự Án Ngầm',
    'Nguồn Lực',
    'KL Đào Phui/Ngày (Mét)',
    'Khối Lượng Đổ Hố Ga/Ngày',
    'KL Mương Cáp - Lũy Kế (m)',
    'KL Mương Cáp - KLHĐ (m)',
    'Tỉ lệ Hoàn Thành Mương Cáp',
    'KL Bể Cáp - Lũy Kế (hầm)',
    'KL Bể Cáp - KLHĐ (hầm)',
    'Ghi Chú / Lý Do Ngưng',
  ];

  const totalExcavation = logs.reduce((sum, r) => sum + (r.excavationTodayM || 0), 0);
  const totalChambersToday = logs.reduce((sum, r) => sum + (r.chambersPouredToday || 0), 0);
  const totalCumTrench = progressLogs.reduce((sum, r) => sum + (r.cumulativeTrenchM || 0), 0);
  const totalContractTrench = progressLogs.reduce((sum, r) => sum + (r.contractTrenchM || 0), 0);
  const trenchRate =
    totalContractTrench > 0 ? Math.round((totalCumTrench / totalContractTrench) * 100) : 0;
  const totalCumChambers = progressLogs.reduce((sum, r) => sum + (r.cumulativeChambers || 0), 0);
  const totalContractChambers = progressLogs.reduce((sum, r) => sum + (r.contractChambers || 0), 0);

  const rows = logs.map((log) => [
    log.stt,
    `"${log.contractorName}"`,
    `"${log.projectName}"`,
    `"${log.resources}"`,
    log.excavationTodayM,
    log.chambersPouredToday,
    log.cumulativeTrenchM,
    log.contractTrenchM,
    `${Math.round((log.cumulativeTrenchM / log.contractTrenchM) * 100)}%`,
    log.cumulativeChambers,
    log.contractChambers,
    `"${log.stoppageReason || log.notes || ''}"`,
  ]);

  // Total summary row
  rows.push([
    '',
    '"TỔNG CỘNG"',
    '""',
    '""',
    totalExcavation,
    totalChambersToday,
    totalCumTrench,
    totalContractTrench,
    `${trenchRate}%`,
    totalCumChambers,
    totalContractChambers,
    '""',
  ]);

  const titleRows = [
    `"${projectName}"`,
    `"BÁO CÁO KHỐI LƯỢNG THI CÔNG NGẦM HÓA - NGÀY ${date}"`,
    `"Chủ đầu tư: ${investor}"`,
    '',
  ];

  const csvContent =
    BOM +
    titleRows.join('\n') +
    '\n' +
    headers.join(',') +
    '\n' +
    rows.map((e) => e.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Bao_Cao_Ngam_Hoa_${date.replace(/-/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function generateZaloReportText(
  logs: DailyLogEntry[],
  date: string,
  projectName: string,
  investor: string,
  progressLogs: DailyLogEntry[] = logs
): string {
  const totalExcavation = logs.reduce((sum, r) => sum + (r.excavationTodayM || 0), 0);
  const totalChambersToday = logs.reduce((sum, r) => sum + (r.chambersPouredToday || 0), 0);
  const totalCumTrench = progressLogs.reduce((sum, r) => sum + (r.cumulativeTrenchM || 0), 0);
  const totalContractTrench = progressLogs.reduce((sum, r) => sum + (r.contractTrenchM || 0), 0);
  const trenchRate =
    totalContractTrench > 0 ? Math.round((totalCumTrench / totalContractTrench) * 100) : 0;
  const totalCumChambers = progressLogs.reduce((sum, r) => sum + (r.cumulativeChambers || 0), 0);
  const totalContractChambers = progressLogs.reduce((sum, r) => sum + (r.contractChambers || 0), 0);

  let text = `📢 BÁO CÁO TIẾN ĐỘ THI CÔNG HẰNG NGÀY GỬI LÃNH ĐẠO\n`;
  text += `📅 Ngày: ${date}\n`;
  text += `🏗️ Dự án: ${projectName}\n`;
  text += `🏛️ Chủ đầu tư: ${investor}\n`;
  text += `------------------------------------\n`;

  logs.forEach((log, index) => {
    const rate = Math.round((log.cumulativeTrenchM / log.contractTrenchM) * 100);
    text += `${index + 1}. [${log.contractorName} - ${log.projectName}]\n`;
    text += `   - Nguồn lực: ${log.resources}\n`;
    text += `   - Đào phui ngày: ${formatNumber(log.excavationTodayM)}m | Đổ hầm ngày: ${formatNumber(log.chambersPouredToday)} bể\n`;
    text += `   - Lũy kế mương cáp: ${formatNumber(log.cumulativeTrenchM)}/${formatNumber(log.contractTrenchM)}m (${rate}%)\n`;
    text += `   - Bể cáp lũy kế: ${formatNumber(log.cumulativeChambers)}/${formatNumber(log.contractChambers)} hầm\n`;
    if (log.stoppageReason) {
      text += `   ⚠️ Lý do: ${log.stoppageReason}\n`;
    }
  });

  text += `------------------------------------\n`;
  text += `🎯 TỔNG HỢP NGÀY ${date}:\n`;
  text += `• Đào phui ngày: ${formatNumber(totalExcavation)} m\n`;
  text += `• Đổ hố ga ngày: ${formatNumber(totalChambersToday)} bể\n`;
  text += `• Lũy kế Mương cáp: ${formatNumber(totalCumTrench)} / ${formatNumber(totalContractTrench)} m (${trenchRate}%)\n`;
  text += `• Lũy kế Bể cáp: ${formatNumber(totalCumChambers)} / ${formatNumber(totalContractChambers)} hầm ${
    totalContractChambers > 0 ? Math.round((totalCumChambers / totalContractChambers) * 100) : 0
  }%)\n`;

  return text;
}
