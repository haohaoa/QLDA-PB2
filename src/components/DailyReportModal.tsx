import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toBlob } from 'html-to-image';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  Check,
  Copy,
  Download,
  FileText,
  HardHat,
  Image as ImageIcon,
  Layers,
  LoaderCircle,
  SlidersHorizontal,
  UsersRound,
  X,
} from 'lucide-react';
import { DailyLogEntry, PlanType, UndergroundProject } from '../types/undergrounding';
import { formatNumber } from '../utils/numberFormat';
import {
  getContractorKey,
  getDailyTrenchOutput,
  getLatestProgressLogs,
} from '../utils/progressUtils';
import {
  getProjectPausePeriodForDate,
  isProjectActiveOnDate,
} from '../utils/scheduleUtils';
import {
  ContractorAssessment,
  getContractorAssessment,
} from '../utils/contractorAssessment';
import { generateZaloReportText } from '../utils/exportUtils';
import { exportDailyLogsToExcel } from '../utils/dailyLogExcel';

interface DailyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: UndergroundProject[];
  planTypes: PlanType[];
  dailyLogs: DailyLogEntry[];
  initialProjectId: string;
  initialDate: string;
}

const isStopped = (log: Pick<DailyLogEntry, 'resources' | 'stoppageReason'>): boolean =>
  !!log.stoppageReason?.trim() ||
  /nghỉ|tạm nghỉ|dừng|ngưng|không thi công/i.test(log.resources || '');

const countTeamsInLog = (log: Pick<DailyLogEntry, 'resources' | 'stoppageReason'>): number => {
  if (isStopped(log)) return 0;
  const matches = [...(log.resources || '').matchAll(/(?:(\d+)\s*)?đội\b/gi)];
  return matches.reduce((sum, match) => sum + (Number(match[1]) || 1), 0);
};

const shiftDateKey = (dateKey: string, deltaDays: number): string => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`;
};

const formatDateShort = (dateKey: string): string => {
  const [, m, d] = dateKey.split('-');
  return `${d}/${m}`;
};

const formatDateFull = (dateKey: string): string =>
  dateKey.split('-').reverse().join('/');

interface DonutProgressChartProps {
  title: string;
  percentage: number;
  achievedText: string;
  totalText: string;
  strokeColor: string;
  trackColor: string;
  textColorClass: string;
}

const DonutProgressChart: React.FC<DonutProgressChartProps> = ({
  title,
  percentage,
  achievedText,
  totalText,
  strokeColor,
  trackColor,
  textColorClass,
}) => {
  const clamped = Math.max(0, Math.min(100, percentage));
  const size = 92;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 text-center">
      <span className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
        {title}
      </span>
      <div className="relative my-2 flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
        <span
          className={`absolute font-mono text-base font-black ${textColorClass}`}
        >
          {percentage}%
        </span>
      </div>
      <p className="font-mono text-xs font-semibold text-slate-700">
        Đã đạt <strong className="font-extrabold text-slate-900">{achievedText}</strong> / Tổng{' '}
        <strong className="font-extrabold text-slate-900">{totalText}</strong>
      </p>
    </div>
  );
};

const formatAssessmentZaloText = (
  assessment: ContractorAssessment,
  finishDate: string
): string => {
  const finishStr = finishDate ? formatDateFull(finishDate) : '';
  if (assessment.overallStatus === 'complete') {
    return '✅ Hoàn tất KLHĐ';
  }
  if (assessment.overallStatus === 'overdue') {
    const parts: string[] = [];
    if (assessment.remainingM > 0) parts.push(`${formatNumber(assessment.remainingM)}m`);
    if (assessment.remainingChambers > 0)
      parts.push(`${formatNumber(assessment.remainingChambers)} hầm`);
    return `🚨 Quá hạn (${finishStr}) - Còn ${parts.join(', ')}`;
  }
  if (assessment.overallStatus === 'behind_schedule') {
    const details: string[] = [];
    if (assessment.status === 'behind_schedule') {
      details.push(
        `Mương +${formatNumber(assessment.additionalPerDayM || 0)} m/ngày (TB ${formatNumber(
          assessment.averagePerCalendarDayM || 0
        )} / Cần ${formatNumber(assessment.requiredPerDayM || 0)})`
      );
    }
    if (assessment.chamberStatus === 'behind_schedule') {
      details.push(
        `Hầm +${formatNumber(assessment.chamberAdditionalPerWeek || 0)} hầm/tuần (TB ${formatNumber(
          assessment.chamberAvgPerWeek || 0
        )} / Cần ${formatNumber(assessment.chamberRequiredPerWeek || 0)})`
      );
    }
    return `⚠️ Nguy cơ trễ (Hạn ${finishStr}) -> Cần tăng ${details.join(' | ')}`;
  }
  if (assessment.overallStatus === 'on_schedule') {
    const chamberInfo =
      assessment.chamberStatus === 'on_schedule'
        ? `, Hầm TB ${formatNumber(assessment.chamberAvgPerWeek || 0)}/Cần ${formatNumber(
            assessment.chamberRequiredPerWeek || 0
          )} h/tuần`
        : '';
    return `✅ Đúng tiến độ (Hạn ${finishStr}, Mương TB ${formatNumber(
      assessment.averagePerCalendarDayM || 0
    )}/Cần ${formatNumber(assessment.requiredPerDayM || 0)} m/ngày${chamberInfo})`;
  }
  return assessment.requiredPerDayM !== null
    ? `⏳ Thiếu dữ liệu (Cần đạt: ${formatNumber(assessment.requiredPerDayM)} m/ngày)`
    : '⏳ Thiếu dữ liệu';
};

export const DailyReportModal: React.FC<DailyReportModalProps> = ({
  isOpen,
  onClose,
  projects,
  planTypes,
  dailyLogs,
  initialProjectId,
  initialDate,
}) => {
  const activeProjects = useMemo(
    () => projects.filter((p) => (p.status || 'in_progress') === 'in_progress'),
    [projects]
  );

  const [scopeMode, setScopeMode] = useState<'all' | 'single'>(
    initialProjectId !== 'all' ? 'single' : 'all'
  );
  const [focusedProjectId, setFocusedProjectId] = useState<string>(
    initialProjectId !== 'all'
      ? initialProjectId
      : activeProjects[0]?.id || projects[0]?.id || ''
  );
  const [reportDate, setReportDate] = useState<string>(initialDate);
  const [scheduleDays, setScheduleDays] = useState<number>(7);
  const [copiedZalo, setCopiedZalo] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const reportCaptureRef = useRef<HTMLDivElement | null>(null);

  const effectiveProject = useMemo(
    () =>
      projects.find((p) => p.id === focusedProjectId) ||
      activeProjects[0] ||
      projects[0] ||
      null,
    [projects, activeProjects, focusedProjectId]
  );

  const scopedProjects = useMemo(() => {
    if (scopeMode === 'single') {
      return effectiveProject ? [effectiveProject] : [];
    }
    return activeProjects.length > 0 ? activeProjects : projects;
  }, [scopeMode, effectiveProject, activeProjects, projects]);

  const scopedProjectIds = useMemo(
    () => new Set(scopedProjects.map((p) => p.id)),
    [scopedProjects]
  );

  // Date sequence ending at reportDate, pulling back `scheduleDays` days
  const dateColumns = useMemo(() => {
    const safeDays = Math.max(1, Math.min(60, Number(scheduleDays) || 7));
    const list: string[] = [];
    for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
      list.push(shiftDateKey(reportDate, -offset));
    }
    return list;
  }, [reportDate, scheduleDays]);

  // Latest cumulative logs up to reportDate
  const latestProgressThroughDate = useMemo(
    () =>
      getLatestProgressLogs(dailyLogs, reportDate).filter((log) =>
        scopedProjectIds.has(log.projectId)
      ),
    [dailyLogs, reportDate, scopedProjectIds]
  );

  // Logs specifically on reportDate
  const logsOnReportDate = useMemo(
    () =>
      dailyLogs.filter(
        (log) => log.date === reportDate && scopedProjectIds.has(log.projectId)
      ),
    [dailyLogs, reportDate, scopedProjectIds]
  );

  // Build project + contractor summary rows (improved "Báo Cáo Khối Lượng Thi Công")
  const projectSummaries = useMemo(() => {
    return scopedProjects.map((project) => {
      const planTypeName =
        planTypes.find((pt) => pt.id === project.planTypeId)?.name || 'Chưa phân loại';
      const projectLatestLogs = latestProgressThroughDate.filter(
        (l) => l.projectId === project.id
      );
      const projectTodayLogs = logsOnReportDate.filter(
        (l) => l.projectId === project.id
      );

      // Determine all contractors on this route (assigned + logged)
      const contractorMap = new Map<
        string,
        {
          key: string;
          name: string;
          color: string;
          contractLengthM: number;
          contractChambers: number;
          cumulativeTrenchM: number;
          cumulativeChambers: number;
          todayLog?: DailyLogEntry;
        }
      >();

      (project.contractors || []).forEach((c) => {
        const key = getContractorKey(c.name);
        contractorMap.set(key, {
          key,
          name: c.name,
          color: c.color,
          contractLengthM: c.totalLengthM,
          contractChambers: c.totalChambers,
          cumulativeTrenchM: 0,
          cumulativeChambers: 0,
        });
      });

      projectLatestLogs.forEach((log) => {
        const key = getContractorKey(log.contractorName);
        const existing = contractorMap.get(key);
        if (existing) {
          existing.cumulativeTrenchM = log.cumulativeTrenchM || 0;
          existing.cumulativeChambers = log.cumulativeChambers || 0;
          if (!existing.contractLengthM) existing.contractLengthM = log.contractTrenchM || 0;
          if (!existing.contractChambers) existing.contractChambers = log.contractChambers || 0;
        } else {
          contractorMap.set(key, {
            key,
            name: log.contractorName,
            color: '#2563eb',
            contractLengthM: log.contractTrenchM || project.totalLengthM || 0,
            contractChambers: log.contractChambers || project.totalChambers || 0,
            cumulativeTrenchM: log.cumulativeTrenchM || 0,
            cumulativeChambers: log.cumulativeChambers || 0,
          });
        }
      });

      projectTodayLogs.forEach((log) => {
        const key = getContractorKey(log.contractorName);
        const existing = contractorMap.get(key);
        if (existing) {
          existing.todayLog = log;
        } else {
          contractorMap.set(key, {
            key,
            name: log.contractorName,
            color: '#2563eb',
            contractLengthM: log.contractTrenchM || project.totalLengthM || 0,
            contractChambers: log.contractChambers || project.totalChambers || 0,
            cumulativeTrenchM: log.cumulativeTrenchM || 0,
            cumulativeChambers: log.cumulativeChambers || 0,
            todayLog: log,
          });
        }
      });

      if (contractorMap.size === 0) {
        const fallbackName = project.contractor || 'Chưa phân công';
        contractorMap.set(getContractorKey(fallbackName), {
          key: getContractorKey(fallbackName),
          name: fallbackName,
          color: '#64748b',
          contractLengthM: project.totalLengthM || 0,
          contractChambers: project.totalChambers || 0,
          cumulativeTrenchM: 0,
          cumulativeChambers: 0,
        });
      }

      const contractorRows = [...contractorMap.values()].map((row) => ({
        ...row,
        assessment: getContractorAssessment(
          project,
          {
            name: row.name,
            totalLengthM: row.contractLengthM,
            totalChambers: row.contractChambers,
          },
          dailyLogs,
          reportDate
        ),
      }));
      const cumTrenchM = contractorRows.reduce((s, r) => s + r.cumulativeTrenchM, 0);
      const cumChambers = contractorRows.reduce((s, r) => s + r.cumulativeChambers, 0);
      const targetTrenchM =
        project.totalLengthM > 0
          ? project.totalLengthM
          : contractorRows.reduce((s, r) => s + r.contractLengthM, 0);
      const targetChambers =
        project.totalChambers > 0
          ? project.totalChambers
          : contractorRows.reduce((s, r) => s + r.contractChambers, 0);
      const todayExcavationM = projectTodayLogs.reduce(
        (s, l) => s + (l.excavationTodayM || 0),
        0
      );
      const todayPipeM = projectTodayLogs.reduce((s, l) => s + (l.pipeLaidTodayM || 0), 0);
      const todayChambers = projectTodayLogs.reduce(
        (s, l) => s + (l.chambersPouredToday || 0),
        0
      );
      const todayRestoredM = projectTodayLogs.reduce(
        (s, l) => s + (l.restoredTodayM || 0),
        0
      );
      const todayTeams = projectTodayLogs.reduce((s, l) => s + countTeamsInLog(l), 0);
      const pct =
        targetTrenchM > 0
          ? Math.min(100, Math.round((cumTrenchM / targetTrenchM) * 1000) / 10)
          : 0;
      const chamberPct =
        targetChambers > 0
          ? Math.min(100, Math.round((cumChambers / targetChambers) * 1000) / 10)
          : 0;

      return {
        project,
        planTypeName,
        contractorRows,
        cumTrenchM,
        targetTrenchM,
        cumChambers,
        targetChambers,
        todayExcavationM,
        todayPipeM,
        todayChambers,
        todayRestoredM,
        todayTeams,
        pct,
        chamberPct,
      };
    });
  }, [scopedProjects, planTypes, latestProgressThroughDate, logsOnReportDate, dailyLogs, reportDate]);

  // Overall aggregates
  const totals = useMemo(() => {
    const targetTrenchM = projectSummaries.reduce((s, p) => s + p.targetTrenchM, 0);
    const cumTrenchM = projectSummaries.reduce((s, p) => s + p.cumTrenchM, 0);
    const targetChambers = projectSummaries.reduce((s, p) => s + p.targetChambers, 0);
    const cumChambers = projectSummaries.reduce((s, p) => s + p.cumChambers, 0);
    const todayExcavationM = projectSummaries.reduce((s, p) => s + p.todayExcavationM, 0);
    const todayChambers = projectSummaries.reduce((s, p) => s + p.todayChambers, 0);
    const todayRestoredM = projectSummaries.reduce((s, p) => s + p.todayRestoredM, 0);
    const todayTeams = projectSummaries.reduce((s, p) => s + p.todayTeams, 0);
    const totalContractValue = projectSummaries.reduce(
      (s, p) => s + (p.project.contractValueVND || 0),
      0
    );
    const allAssessments = projectSummaries.flatMap((p) =>
      p.contractorRows.map((c) => c.assessment)
    );
    const behindCount = allAssessments.filter(
      (a) => a.overallStatus === 'behind_schedule'
    ).length;
    const overdueCount = allAssessments.filter(
      (a) => a.overallStatus === 'overdue'
    ).length;
    const onScheduleCount = allAssessments.filter(
      (a) => a.overallStatus === 'on_schedule'
    ).length;
    const completeCount = allAssessments.filter(
      (a) => a.overallStatus === 'complete'
    ).length;

    return {
      targetTrenchM,
      cumTrenchM,
      trenchPct:
        targetTrenchM > 0 ? Math.round((cumTrenchM / targetTrenchM) * 1000) / 10 : 0,
      targetChambers,
      cumChambers,
      chamberPct:
        targetChambers > 0 ? Math.round((cumChambers / targetChambers) * 1000) / 10 : 0,
      todayExcavationM,
      todayChambers,
      todayRestoredM,
      todayTeams,
      totalContractValue,
      behindCount,
      overdueCount,
      onScheduleCount,
      completeCount,
      totalContractors: allAssessments.length,
    };
  }, [projectSummaries]);

  // Fast lookup map for Schedule Matrix: `${projectId}:${contractorKey}:${date}` -> DailyLogEntry
  const logLookup = useMemo(() => {
    const map = new Map<string, DailyLogEntry>();
    dailyLogs.forEach((log) => {
      if (!scopedProjectIds.has(log.projectId)) return;
      map.set(`${log.projectId}:${getContractorKey(log.contractorName)}:${log.date}`, log);
    });
    return map;
  }, [dailyLogs, scopedProjectIds]);

  const handleCopyZalo = () => {
    const dateDisplay = formatDateFull(reportDate);
    let text = '';

    if (scopeMode === 'single' && effectiveProject && projectSummaries[0]) {
      const summary = projectSummaries[0];
      text += `📢 BÁO CÁO TIẾN ĐỘ THI CÔNG NGÀY ${dateDisplay}\n`;
      text += `🏗️ Tuyến dự án: ${effectiveProject.name} (${effectiveProject.code})\n`;
      text += `🏛️ Chủ đầu tư: ${effectiveProject.investor}\n`;
      text += `------------------------------------\n`;

      summary.contractorRows.forEach((cRow, idx) => {
        const pct =
          cRow.contractLengthM > 0
            ? Math.round((cRow.cumulativeTrenchM / cRow.contractLengthM) * 1000) / 10
            : 0;
        const todayLog = cRow.todayLog;
        const stopped = todayLog ? isStopped(todayLog) : false;

        text += `${idx + 1}. Nhà thầu: ${cRow.name}\n`;
        if (!todayLog) {
          text += `   - Trạng thái ngày ${dateDisplay}: ⚠️ Chưa báo cáo\n`;
        } else if (stopped) {
          text += `   - Trạng thái: ⏸️ Nghỉ (${todayLog.stoppageReason || todayLog.resources})\n`;
        } else {
          const restored = todayLog.restoredTodayM || 0;
          text += `   - Nguồn lực: ${todayLog.resources}\n`;
          text += `   - Trong ngày: Đào ${formatNumber(todayLog.excavationTodayM)}m | Hố ga ${formatNumber(
            todayLog.chambersPouredToday
          )} hầm${restored > 0 ? ` | Hoàn trả thảm ${formatNumber(restored)}m` : ''}\n`;
        }
        text += `   - Lũy kế mương cáp: ${formatNumber(cRow.cumulativeTrenchM)}/${formatNumber(
          cRow.contractLengthM
        )}m (${pct}%)\n`;
        text += `   - Lũy kế bể cáp: ${formatNumber(cRow.cumulativeChambers)}/${formatNumber(
          cRow.contractChambers
        )} hầm\n`;
        text += `   - Đánh giá tiến độ: ${formatAssessmentZaloText(
          cRow.assessment,
          effectiveProject.finishDate
        )}\n`;
        if (todayLog?.notes?.trim()) {
          text += `   📝 Ghi chú: ${todayLog.notes.trim()}\n`;
        }
      });

      text += `------------------------------------\n`;
      text += `🎯 TỔNG HỢP TUYẾN NGÀY ${dateDisplay}:\n`;
      text += `• Đào phui ngày: ${formatNumber(summary.todayExcavationM)} m\n`;
      text += `• Đổ hố ga ngày: ${formatNumber(summary.todayChambers)} hầm\n`;
      if (summary.todayRestoredM > 0) {
        text += `• Hoàn trả thảm ngày: ${formatNumber(summary.todayRestoredM)} m\n`;
      }
      text += `• Lũy kế Mương cáp: ${formatNumber(summary.cumTrenchM)} / ${formatNumber(
        summary.targetTrenchM
      )} m (${summary.pct}%)\n`;
      text += `• Lũy kế Bể cáp: ${formatNumber(summary.cumChambers)} / ${formatNumber(
        summary.targetChambers
      )} hầm (${summary.chamberPct}%)\n`;
    } else {
      text += `📢 BÁO CÁO TỔNG HỢP TOÀN BỘ CÁC TUYẾN NGÀY ${dateDisplay}\n`;
      text += `📋 Phạm vi: Toàn bộ ${projectSummaries.length} tuyến dự án\n`;
      text += `------------------------------------\n`;

      projectSummaries.forEach((summary, pIdx) => {
        text += `${pIdx + 1}. ${summary.project.name} (${summary.pct}%)\n`;
        summary.contractorRows.forEach((cRow) => {
          const pct =
            cRow.contractLengthM > 0
              ? Math.round((cRow.cumulativeTrenchM / cRow.contractLengthM) * 1000) / 10
              : 0;
          const todayLog = cRow.todayLog;
          const stopped = todayLog ? isStopped(todayLog) : false;
          const prefix = summary.contractorRows.length > 1 ? `   • [${cRow.name}] ` : `   • ${cRow.name}: `;

          if (!todayLog) {
            text += `${prefix}⚠️ Chưa báo cáo`;
          } else if (stopped) {
            text += `${prefix}⏸️ Nghỉ (${todayLog.stoppageReason || todayLog.resources})`;
          } else {
            const restored = todayLog.restoredTodayM || 0;
            text += `${prefix}${todayLog.resources} | Đào ${formatNumber(
              todayLog.excavationTodayM
            )}m, Hầm ${formatNumber(todayLog.chambersPouredToday)}${
              restored > 0 ? `, Thảm ${formatNumber(restored)}m` : ''
            }`;
          }
          text += ` | LK: ${formatNumber(cRow.cumulativeTrenchM)}/${formatNumber(
            cRow.contractLengthM
          )}m (${pct}%), Bể: ${formatNumber(cRow.cumulativeChambers)}/${formatNumber(
            cRow.contractChambers
          )}\n`;
          text += `     📊 ${formatAssessmentZaloText(
            cRow.assessment,
            summary.project.finishDate
          )}\n`;
          if (todayLog?.notes?.trim()) {
            text += `     📝 ${todayLog.notes.trim()}\n`;
          }
        });
      });

      text += `------------------------------------\n`;
      text += `🎯 TỔNG HỢP TOÀN HỆ THỐNG NGÀY ${dateDisplay}:\n`;
      text += `• Nhân lực huy động: ${totals.todayTeams} đội\n`;
      text += `• Đào phui ngày: ${formatNumber(totals.todayExcavationM)} m\n`;
      text += `• Đổ hố ga ngày: ${formatNumber(totals.todayChambers)} hầm\n`;
      if (totals.todayRestoredM > 0) {
        text += `• Hoàn trả thảm ngày: ${formatNumber(totals.todayRestoredM)} m\n`;
      }
      text += `• Lũy kế Mương cáp: ${formatNumber(totals.cumTrenchM)} / ${formatNumber(
        totals.targetTrenchM
      )} m (${totals.trenchPct}%)\n`;
      text += `• Lũy kế Bể cáp: ${formatNumber(totals.cumChambers)} / ${formatNumber(
        totals.targetChambers
      )} hầm (${totals.chamberPct}%)\n`;
    }

    navigator.clipboard.writeText(text);
    setCopiedZalo(true);
    setTimeout(() => setCopiedZalo(false), 2000);
  };

  const handleExportExcel = async () => {
    const filePrefix =
      scopeMode === 'single' && effectiveProject
        ? effectiveProject.code || 'Tuyen'
        : 'Tong_The_Cac_Tuyen';
    await exportDailyLogsToExcel(
      logsOnReportDate.length > 0 ? logsOnReportDate : latestProgressThroughDate,
      projects,
      `Bao_Cao_Ngay_${filePrefix}_${reportDate.replace(/-/g, '_')}.xlsx`
    );
  };

  const handleCopyReportImage = async () => {
    const node = reportCaptureRef.current;
    if (!node || isCapturing) return;
    setCaptureError(null);
    setIsCapturing(true);
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      const blob = await toBlob(node, {
        pixelRatio: 3,
        backgroundColor: '#f8fafc',
        cacheBust: true,
        skipFonts: true,
        width: node.scrollWidth,
        height: node.scrollHeight,
        style: {
          margin: '0',
        },
      });
      if (!blob) {
        throw new Error('Không tạo được dữ liệu ảnh.');
      }

      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          setCopiedImage(true);
          setTimeout(() => setCopiedImage(false), 2500);
          return;
        } catch {
          // Fallback to download if clipboard image write is blocked by browser/iframe
        }
      }

      const filePrefix =
        scopeMode === 'single' && effectiveProject
          ? effectiveProject.code || 'Tuyen'
          : 'Tong_The';
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `Bao_Cao_Ngay_${filePrefix}_${reportDate.replace(/-/g, '_')}.png`;
      link.href = objectUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2500);
    } catch (error) {
      setCaptureError(
        error instanceof Error
          ? `Không thể sao chép ảnh báo cáo: ${error.message}`
          : 'Không thể sao chép ảnh báo cáo lúc này.'
      );
    } finally {
      setIsCapturing(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[105] flex flex-col bg-slate-950/75 backdrop-blur-xs sm:p-3 print:static print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-label="Cửa sổ Báo Cáo Ngày Hoàn Chỉnh"
    >
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-slate-50 sm:h-[calc(100dvh-1.5rem)] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl print:h-auto print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
        {/* Top Control Header */}
        <header className="flex flex-col gap-2 border-b border-slate-200 bg-slate-900 px-3 py-2.5 text-white sm:px-5 sm:py-3 print:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-extrabold sm:text-base">
                  Báo Cáo Thi Công & Lũy Kế Hằng Ngày
                </h2>
                <p className="truncate text-[11px] text-slate-300">
                  {scopeMode === 'single' && effectiveProject
                    ? `${effectiveProject.name} · Ngày ${formatDateFull(reportDate)}`
                    : `Tổng hợp toàn bộ ${scopedProjects.length} tuyến · Ngày ${formatDateFull(reportDate)}`}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyZalo}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-slate-800 px-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700"
                title="Sao chép báo cáo gửi Zalo"
              >
                {copiedZalo ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">{copiedZalo ? 'Đã chép' : 'Zalo'}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleExportExcel()}
                className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                title="Xuất file Excel"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Excel</span>
              </button>

              <button
                type="button"
                onClick={() => void handleCopyReportImage()}
                disabled={isCapturing}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                title="Sao chép hình ảnh bản báo cáo để dán gửi Zalo / Messenger"
              >
                {isCapturing ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : copiedImage ? (
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5" />
                )}
                <span>
                  {isCapturing
                    ? 'Đang tạo ảnh...'
                    : copiedImage
                    ? 'Đã chép ảnh'
                    : 'Sao chép ảnh'}
                </span>
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng báo cáo"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Scope Switcher + Date + Schedule Days Customizer */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-800/80 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="inline-flex rounded-lg bg-slate-900 p-0.5 text-xs"
                role="group"
                aria-label="Phạm vi báo cáo"
              >
                <button
                  type="button"
                  onClick={() => setScopeMode('all')}
                  aria-pressed={scopeMode === 'all'}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-bold transition ${
                    scopeMode === 'all'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Tổng thể các tuyến ({activeProjects.length || projects.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScopeMode('single')}
                  aria-pressed={scopeMode === 'single'}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-bold transition ${
                    scopeMode === 'single'
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Riêng lẻ 1 tuyến</span>
                </button>
              </div>

              {scopeMode === 'single' && (
                <select
                  value={effectiveProject?.id || ''}
                  onChange={(e) => setFocusedProjectId(e.target.value)}
                  aria-label="Chọn dự án xem báo cáo"
                  className="max-w-xs sm:max-w-md rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white outline-none focus:border-teal-400"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1">
                <Calendar className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-[11px] text-slate-300">Ngày BC:</span>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => e.target.value && setReportDate(e.target.value)}
                  className="bg-transparent font-mono text-xs font-bold text-white outline-none"
                />
              </label>

              <div className="flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1">
                <SlidersHorizontal className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[11px] text-slate-300">Lịch:</span>
                {[7, 15, 30].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setScheduleDays(preset)}
                    className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-bold transition ${
                      scheduleDays === preset
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {preset}N
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={scheduleDays}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val)) setScheduleDays(Math.max(1, Math.min(60, val)));
                  }}
                  aria-label="Tùy chỉnh số ngày hiển thị lịch thi công"
                  className="w-11 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-center font-mono text-[11px] font-bold text-white outline-none focus:border-amber-400"
                />
                <span className="text-[10px] text-slate-400">ngày</span>
              </div>
            </div>
          </div>
        </header>

        {captureError && (
          <div
            role="alert"
            className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700"
          >
            {captureError}
          </div>
        )}

        {/* Scrollable Report Body */}
        <div
          className={`flex-1 ${
            isCapturing ? 'overflow-visible' : 'overflow-y-auto'
          }`}
        >
          <div
            ref={reportCaptureRef}
            className={`mx-auto space-y-3 bg-slate-50 p-2 sm:p-3.5 ${
              isCapturing
                ? dateColumns.length <= 7
                  ? 'w-[960px] max-w-[960px]'
                  : 'w-max min-w-[960px]'
                : 'max-w-[960px]'
            }`}
          >
            {/* Official Report Header Banner (always visible in captured image) */}
            <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-center shadow-2xs">
              <h1 className="text-base sm:text-lg font-black uppercase tracking-wide text-slate-900">
                BÁO CÁO TIẾN ĐỘ & KHỐI LƯỢNG THI CÔNG NGÀY {formatDateFull(reportDate)}
              </h1>
              <p className="mt-0.5 text-xs font-semibold text-slate-700">
                {scopeMode === 'single' && effectiveProject
                  ? `Dự án: ${effectiveProject.name} (${effectiveProject.code}) · Chủ đầu tư: ${effectiveProject.investor}`
                  : `Tổng hợp toàn bộ ${scopedProjects.length} tuyến dự án ngầm hóa`}
              </p>
            </div>

          {/* SECTION 1: TỔNG THỂ THÔNG TIN DỰ ÁN & LŨY KẾ HIỆN TẠI */}
          {scopeMode === 'single' && effectiveProject && projectSummaries[0] ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-2xs space-y-3.5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="rounded bg-blue-50 border border-blue-200 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-700">
                      {effectiveProject.code}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700">
                      {projectSummaries[0].planTypeName}
                    </span>
                    <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      {formatDateFull(effectiveProject.startDate)} →{' '}
                      {formatDateFull(effectiveProject.finishDate)}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                    {effectiveProject.name}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Chủ đầu tư: <strong className="text-slate-800">{effectiveProject.investor}</strong>
                    {' · '}
                    Giá trị HĐ:{' '}
                    <strong className="font-mono text-blue-700">
                      {formatNumber(effectiveProject.contractValueVND)} VNĐ
                    </strong>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                  <UsersRound className="h-4 w-4 text-indigo-600" />
                  <div>
                    <span className="block text-[10px] text-slate-500">Nhà thầu tham gia</span>
                    <strong className="text-slate-900">
                      {projectSummaries[0].contractorRows.length} đơn vị
                    </strong>
                  </div>
                </div>
              </div>

              {/* Single Project 3-Block Summary: Donut 1 + Donut 2 + Daily Output Card */}
              <div
                className={`grid gap-3 ${
                  isCapturing ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'
                }`}
              >
                <DonutProgressChart
                  title="Tiến độ Lũy Kế Tuyến (m)"
                  percentage={projectSummaries[0].pct}
                  achievedText={`${formatNumber(projectSummaries[0].cumTrenchM)}m`}
                  totalText={`${formatNumber(projectSummaries[0].targetTrenchM)}m`}
                  strokeColor="#2563eb"
                  trackColor="#dbeafe"
                  textColorClass="text-blue-800"
                />

                <DonutProgressChart
                  title="Tiến độ Hố Ga / Bể Cáp"
                  percentage={projectSummaries[0].chamberPct}
                  achievedText={formatNumber(projectSummaries[0].cumChambers)}
                  totalText={formatNumber(projectSummaries[0].targetChambers)}
                  strokeColor="#059669"
                  trackColor="#d1fae5"
                  textColorClass="text-emerald-800"
                />

                <div className="flex flex-col justify-between rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50/40 to-amber-50/50 p-3.5 shadow-2xs">
                  <div className="border-b border-blue-200/70 pb-1.5">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-blue-900">
                      Sản Lượng Ngày {formatDateShort(reportDate)}
                    </span>
                  </div>
                  <div className="my-2 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Đào:</span>
                      <strong className="font-mono text-base font-black text-blue-900">
                        +{formatNumber(projectSummaries[0].todayExcavationM)} m
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Hầm:</span>
                      <strong className="font-mono text-base font-black text-emerald-800">
                        +{formatNumber(projectSummaries[0].todayChambers)}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Thảm:</span>
                      <strong className="font-mono text-base font-black text-teal-800">
                        +{formatNumber(projectSummaries[0].todayRestoredM)} m
                      </strong>
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-slate-600">
                    {logsOnReportDate.length} nhật ký đã nộp
                  </div>
                </div>
              </div>
            </section>
          ) : (
            /* ALL PROJECTS OVERVIEW: 2 Donut Charts + 1 Daily Output Card */
            <section className="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                      Tổng Hợp Toàn Hệ Thống ({projectSummaries.length} Tuyến Dự Án)
                    </h3>
                    <p className="text-xs text-slate-600">
                      Lũy kế đến hết ngày {formatDateFull(reportDate)} · Tổng giá trị HĐ:{' '}
                      <strong className="font-mono text-blue-700">
                        {formatNumber(totals.totalContractValue)} VNĐ
                      </strong>
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`grid gap-3 ${
                  isCapturing ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'
                }`}
              >
                <DonutProgressChart
                  title="Tiến độ Lũy Kế Tuyến (m)"
                  percentage={totals.trenchPct}
                  achievedText={`${formatNumber(totals.cumTrenchM)}m`}
                  totalText={`${formatNumber(totals.targetTrenchM)}m`}
                  strokeColor="#2563eb"
                  trackColor="#dbeafe"
                  textColorClass="text-blue-800"
                />

                <DonutProgressChart
                  title="Tiến độ Hố Ga / Bể Cáp"
                  percentage={totals.chamberPct}
                  achievedText={formatNumber(totals.cumChambers)}
                  totalText={formatNumber(totals.targetChambers)}
                  strokeColor="#059669"
                  trackColor="#d1fae5"
                  textColorClass="text-emerald-800"
                />

                <div className="flex flex-col justify-between rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50/40 to-amber-50/50 p-3.5 shadow-2xs">
                  <div className="border-b border-blue-200/70 pb-1.5">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-blue-900">
                      Sản Lượng Ngày {formatDateShort(reportDate)}
                    </span>
                  </div>
                  <div className="my-2 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Đào:</span>
                      <strong className="font-mono text-base font-black text-blue-900">
                        +{formatNumber(totals.todayExcavationM)} m
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Hầm:</span>
                      <strong className="font-mono text-base font-black text-emerald-800">
                        +{formatNumber(totals.todayChambers)}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">Thảm:</span>
                      <strong className="font-mono text-base font-black text-teal-800">
                        +{formatNumber(totals.todayRestoredM)} m
                      </strong>
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-slate-600">
                    {logsOnReportDate.length} nhật ký đã nộp trong ngày
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* SECTION 2: BÁO CÁO KHỐI LƯỢNG THI CÔNG CẢI TIẾN */}
          <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-2xs">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold uppercase tracking-wide text-slate-900">
                  Báo Cáo Khối Lượng Thi Công — Ngày {formatDateFull(reportDate)}
                </h3>
                <p className="text-xs text-slate-600">
                  Chi tiết sản lượng trong ngày, lũy kế và đánh giá tốc độ hoàn thành tính đến hết ngày {formatDateFull(reportDate)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                {totals.overdueCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1 text-red-800">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                    Quá hạn: {totals.overdueCount}
                  </span>
                )}
                {totals.behindCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    Cảnh báo trễ: {totals.behindCount}
                  </span>
                )}
                {(totals.onScheduleCount > 0 || totals.completeCount > 0) && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
                    Đạt tiến độ: {totals.onScheduleCount + totals.completeCount}/{totals.totalContractors}
                  </span>
                )}
              </div>
            </div>

            {/* Mobile Card List (hidden on desktop and hidden during Desktop PNG Capture) */}
            {!isCapturing && (
              <div className="space-y-2.5 md:hidden">
                {projectSummaries.flatMap((summary) =>
                  summary.contractorRows.map((cRow) => {
                    const pct =
                      cRow.contractLengthM > 0
                        ? Math.min(
                            100,
                            Math.round((cRow.cumulativeTrenchM / cRow.contractLengthM) * 1000) /
                              10
                          )
                        : 0;
                    const todayLog = cRow.todayLog;
                    const stopped = todayLog ? isStopped(todayLog) : false;
                    const stopReason = todayLog?.stoppageReason?.trim() || '';
                    const isUnexplainedStop =
                      stopped &&
                      (!stopReason || /^nghỉ$/i.test(stopReason)) &&
                      /^nghỉ$/i.test((todayLog?.resources || '').trim());
                    const isChamberOverContract =
                      cRow.contractChambers > 0 &&
                      cRow.cumulativeChambers > cRow.contractChambers;
                    const noteOrObstacle = todayLog
                      ? stopped
                        ? stopReason || todayLog.notes?.trim() || 'Nghỉ (chưa nêu lý do)'
                        : todayLog.notes?.trim() ||
                          (todayLog.violationReport?.hasViolation
                            ? `Vi phạm: ${todayLog.violationReport.violationTypeLabel}`
                            : '')
                      : '';

                    return (
                      <article
                        key={`mob-${summary.project.id}-${cRow.key}`}
                        className={`rounded-xl border p-2.5 space-y-2 ${
                          !todayLog
                            ? 'border-red-200 bg-rose-50/30'
                            : stopped
                            ? 'border-amber-200 bg-amber-50/40'
                            : 'border-slate-200 bg-slate-50/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="text-xs font-extrabold text-slate-900 leading-snug">
                              {summary.project.name}
                            </h4>
                            <p className="mt-0.5 text-[10px] text-slate-600">
                              <span className="font-semibold">{summary.planTypeName}</span> ·{' '}
                              {cRow.name}
                            </p>
                          </div>
                          {!todayLog ? (
                            <span className="shrink-0 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-600">
                              Chưa BC
                            </span>
                          ) : isUnexplainedStop ? (
                            <span className="shrink-0 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-600">
                              Nghỉ không lý do
                            </span>
                          ) : stopped ? (
                            <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                              Nghỉ
                            </span>
                          ) : (
                            <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
                              {todayLog.resources}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-white p-2 border border-slate-100 text-[10px]">
                          <div>
                            <span className="block text-[9px] text-slate-400">Trong ngày</span>
                            <strong className="font-mono text-slate-900">
                              {todayLog && !stopped
                                ? (() => {
                                    const trench = getDailyTrenchOutput(todayLog);
                                    const chambers = todayLog.chambersPouredToday || 0;
                                    const restored = todayLog.restoredTodayM || 0;
                                    const parts: string[] = [];
                                    if (trench > 0) parts.push(`Đào ${formatNumber(trench)}m`);
                                    if (chambers > 0) parts.push(`${formatNumber(chambers)} hầm`);
                                    if (restored > 0) parts.push(`Thảm ${formatNumber(restored)}m`);
                                    return parts.length > 0 ? parts.join(' · ') : 'Thi công';
                                  })()
                                : '-'}
                            </strong>
                          </div>
                          <div>
                            <span className="block text-[9px] text-slate-400">Lũy kế ({pct}%)</span>
                            <strong className="font-mono text-blue-700">
                              {formatNumber(cRow.cumulativeTrenchM)}/{formatNumber(cRow.contractLengthM)}m
                            </strong>
                          </div>
                          <div>
                            <span className="block text-[9px] text-slate-400">Bể cáp</span>
                            <strong
                              className={`font-mono ${
                                isChamberOverContract ? 'text-amber-700' : 'text-emerald-700'
                              }`}
                            >
                              {formatNumber(cRow.cumulativeChambers)}/{formatNumber(cRow.contractChambers)}
                            </strong>
                          </div>
                        </div>

                        {(() => {
                          const assessment = cRow.assessment;
                          const finishStr = summary.project.finishDate
                            ? formatDateFull(summary.project.finishDate)
                            : '';
                          return (
                            <div
                              className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${
                                assessment.overallStatus === 'behind_schedule'
                                  ? 'border-amber-300 bg-amber-50 text-amber-950'
                                  : assessment.overallStatus === 'overdue'
                                  ? 'border-red-300 bg-red-50 text-red-900'
                                  : assessment.overallStatus === 'on_schedule' ||
                                    assessment.overallStatus === 'complete'
                                  ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                                  : 'border-slate-200 bg-white text-slate-600'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 font-bold">
                                <span className="inline-flex items-center gap-1">
                                  {(assessment.overallStatus === 'behind_schedule' ||
                                    assessment.overallStatus === 'overdue') && (
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  )}
                                  {
                                    {
                                      complete: 'Hoàn tất KLHĐ',
                                      on_schedule: 'Đúng tiến độ',
                                      behind_schedule: 'Cảnh báo: Nguy cơ trễ',
                                      overdue: 'Cảnh báo: Quá hạn',
                                      insufficient_data: 'Chưa đủ dữ liệu',
                                    }[assessment.overallStatus]
                                  }
                                </span>
                                {finishStr && (
                                  <span className="font-mono text-[10px] opacity-80">
                                    Hạn {finishStr}
                                  </span>
                                )}
                              </div>
                              {assessment.overallStatus === 'behind_schedule' && (
                                <div className="mt-0.5 space-y-0.5">
                                  {assessment.status === 'behind_schedule' && (
                                    <p className="font-extrabold text-red-700">
                                      Mương: +{formatNumber(assessment.additionalPerDayM || 0)} m/ngày
                                      <span className="ml-1.5 font-mono font-semibold text-slate-700">
                                        (TB {formatNumber(assessment.averagePerCalendarDayM || 0)} / Cần{' '}
                                        {formatNumber(assessment.requiredPerDayM || 0)})
                                      </span>
                                    </p>
                                  )}
                                  {assessment.chamberStatus === 'behind_schedule' && (
                                    <p className="font-extrabold text-red-700">
                                      Hầm: +{formatNumber(assessment.chamberAdditionalPerWeek || 0)} hầm/tuần
                                      <span className="ml-1.5 font-mono font-semibold text-slate-700">
                                        (TB {formatNumber(assessment.chamberAvgPerWeek || 0)} / Cần{' '}
                                        {formatNumber(assessment.chamberRequiredPerWeek || 0)})
                                      </span>
                                    </p>
                                  )}
                                </div>
                              )}
                              {assessment.overallStatus === 'on_schedule' && (
                                <p className="mt-0.5 font-mono text-[10px] font-semibold">
                                  Mương TB {formatNumber(assessment.averagePerCalendarDayM || 0)}/Cần{' '}
                                  {formatNumber(assessment.requiredPerDayM || 0)} m/ng
                                  {assessment.chamberStatus === 'on_schedule' &&
                                    ` · Hầm TB ${formatNumber(
                                      assessment.chamberAvgPerWeek || 0
                                    )}/Cần ${formatNumber(
                                      assessment.chamberRequiredPerWeek || 0
                                    )} h/tuần`}
                                </p>
                              )}
                              {assessment.overallStatus === 'overdue' && (
                                <p className="mt-0.5 font-bold text-red-700">
                                  Quá hạn {formatNumber(Math.abs(assessment.daysUntilFinish || 0))} ngày · Còn{' '}
                                  {[
                                    assessment.remainingM > 0
                                      ? `${formatNumber(assessment.remainingM)}m`
                                      : '',
                                    assessment.remainingChambers > 0
                                      ? `${formatNumber(assessment.remainingChambers)} hầm`
                                      : '',
                                  ]
                                    .filter(Boolean)
                                    .join(', ')}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </article>
                    );
                  })
                )}
              </div>
            )}

            {/* Desktop Table (always shown when capturing PNG!) */}
            <div
              className={`${
                isCapturing
                  ? 'block overflow-visible'
                  : 'hidden md:block overflow-x-auto'
              } rounded-xl border border-slate-200`}
            >
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-100 text-sm font-bold text-slate-900">
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center w-10">STT</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 min-w-[210px]">
                      Dự Án / Tuyến Ngầm
                    </th>
                    <th className="border-r border-slate-200 px-3 py-2.5">Nhà Thầu</th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center w-28">
                      Sản Lượng Ngày
                    </th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-right bg-blue-50/70 w-32">
                      Lũy Kế / KLHĐ (m)
                    </th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-center bg-blue-50/70 w-24">
                      Hoàn Thành
                    </th>
                    <th className="border-r border-slate-200 px-3 py-2.5 text-right bg-emerald-50/60 w-28">
                      Bể Cáp Lũy Kế
                    </th>
                    <th className="px-3 py-2.5 bg-amber-50/70 min-w-[175px]">
                      Đánh Giá Tiến Độ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {projectSummaries.flatMap((summary, pIdx) =>
                    summary.contractorRows.map((cRow, cIdx) => {
                      const pct =
                        cRow.contractLengthM > 0
                          ? Math.min(
                              100,
                              Math.round((cRow.cumulativeTrenchM / cRow.contractLengthM) * 1000) /
                                10
                            )
                          : 0;
                      const todayLog = cRow.todayLog;
                      const pausePeriod = getProjectPausePeriodForDate(
                        summary.project,
                        reportDate
                      );
                      const stopped = todayLog ? isStopped(todayLog) : false;
                      const stopReason = todayLog?.stoppageReason?.trim() || '';
                      const isChamberOverContract =
                        cRow.contractChambers > 0 &&
                        cRow.cumulativeChambers > cRow.contractChambers;
                      const noteOrObstacle = todayLog
                        ? stopped
                          ? stopReason || todayLog.notes?.trim() || 'Nghỉ (chưa nêu lý do)'
                          : todayLog.notes?.trim() ||
                            (todayLog.violationReport?.hasViolation
                              ? `Vi phạm: ${todayLog.violationReport.violationTypeLabel}`
                              : '')
                        : pausePeriod
                        ? `Tạm ngưng: ${pausePeriod.reason}`
                        : '';
                      const todayTrench = todayLog ? getDailyTrenchOutput(todayLog) : 0;
                      const todayChambers = todayLog?.chambersPouredToday || 0;
                      const todayRestored = todayLog?.restoredTodayM || 0;
                      const hasAnyDailyOutput =
                        !stopped && (todayTrench > 0 || todayChambers > 0 || todayRestored > 0);

                      return (
                        <tr
                          key={`${summary.project.id}-${cRow.key}`}
                          className={
                            !todayLog
                              ? 'bg-rose-50/20 hover:bg-rose-50/40 transition-colors'
                              : stopped
                              ? 'bg-amber-50/40'
                              : 'hover:bg-slate-50/80 transition-colors'
                          }
                        >
                          <td className="border-r border-slate-200 px-3 py-2.5 text-center font-mono text-xs font-semibold text-slate-600">
                            {summary.contractorRows.length > 1
                              ? `${pIdx + 1}.${cIdx + 1}`
                              : pIdx + 1}
                          </td>
                          <td className="border-r border-slate-200 px-3 py-2.5">
                            <div className="text-sm font-bold text-slate-900 leading-snug">
                              {summary.project.name}
                            </div>
                            <div className="mt-1 text-xs leading-relaxed text-slate-600">
                              <span className="font-semibold text-slate-700">
                                {summary.planTypeName}
                              </span>
                              {' · '}
                              <span>{summary.project.investor}</span>
                            </div>
                          </td>
                          <td className="border-r border-slate-200 px-3 py-2.5">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: cRow.color }}
                              />
                              <span>{cRow.name}</span>
                            </div>
                          </td>
                          <td className="border-r border-slate-200 px-3 py-2.5 font-mono text-xs">
                            {!todayLog ? (
                              pausePeriod ? (
                                <div className="text-center">
                                  <span className="inline-flex items-center whitespace-nowrap rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-sans text-xs font-bold text-amber-800">
                                    Tạm ngưng
                                  </span>
                                </div>
                              ) : (
                                <div className="text-center">
                                  <span className="inline-flex items-center whitespace-nowrap rounded-md border border-red-200 bg-red-50 px-2 py-0.5 font-sans text-xs font-bold text-red-600">
                                    Chưa BC
                                  </span>
                                </div>
                              )
                            ) : stopped ? (
                              <div className="text-center">
                                <span className="inline-flex items-center whitespace-nowrap rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-sans text-xs font-bold text-amber-800">
                                  Nghỉ
                                </span>
                              </div>
                            ) : hasAnyDailyOutput ? (
                              <div className="space-y-0.5 text-left whitespace-nowrap">
                                {todayTrench > 0 && (
                                  <div className="text-sm font-bold text-blue-900">
                                    Đào: {formatNumber(todayTrench)}m
                                  </div>
                                )}
                                {todayChambers > 0 && (
                                  <div className="text-sm font-bold text-emerald-800">
                                    Hầm: {formatNumber(todayChambers)}
                                  </div>
                                )}
                                {todayRestored > 0 && (
                                  <div className="font-bold text-teal-800">
                                    Thảm: {formatNumber(todayRestored)}m
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center text-sm font-semibold text-slate-400">
                                -
                              </div>
                            )}
                          </td>
                          <td className="border-r border-slate-200 px-3 py-2.5 text-right font-mono bg-blue-50/20 whitespace-nowrap">
                            <strong className="text-sm font-extrabold text-blue-800">
                              {formatNumber(cRow.cumulativeTrenchM)}
                            </strong>
                            <span className="text-xs font-semibold text-slate-500">
                              {' / '}
                              {formatNumber(cRow.contractLengthM)}
                            </span>
                          </td>
                          <td className="border-r border-slate-200 px-3 py-2.5 bg-blue-50/20">
                            <div className="flex flex-col items-center gap-1">
                              <span className="font-mono text-sm font-extrabold text-blue-700">
                                {pct}%
                              </span>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className={`h-full rounded-full ${
                                    pct >= 80
                                      ? 'bg-emerald-500'
                                      : pct >= 40
                                      ? 'bg-blue-600'
                                      : 'bg-amber-500'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td
                            className={`border-r border-slate-200 px-3 py-2.5 text-right font-mono whitespace-nowrap ${
                              isChamberOverContract
                                ? 'bg-amber-50/60 text-amber-800'
                                : 'bg-emerald-50/20 text-emerald-800'
                            }`}
                          >
                            <div className="inline-flex items-center justify-end gap-1 text-sm font-bold">
                              {isChamberOverContract && (
                                <AlertTriangle
                                  className="h-3.5 w-3.5 shrink-0 text-amber-600"
                                  aria-label="Vượt khối lượng hợp đồng"
                                />
                              )}
                              <span>
                                {formatNumber(cRow.cumulativeChambers)}
                                <span className="text-xs font-normal text-slate-500">
                                  {' / '}
                                  {formatNumber(cRow.contractChambers)}
                                </span>
                              </span>
                            </div>
                            {isChamberOverContract && (
                              <span className="mt-0.5 block text-xs font-sans font-bold text-amber-700">
                                +{formatNumber(cRow.cumulativeChambers - cRow.contractChambers)} phát sinh
                              </span>
                            )}
                          </td>
                          {(() => {
                            const assessment = cRow.assessment;
                            const finishStr = summary.project.finishDate
                              ? formatDateFull(summary.project.finishDate)
                              : '';
                            const cellBg =
                              assessment.overallStatus === 'behind_schedule'
                                ? 'bg-amber-50/80'
                                : assessment.overallStatus === 'overdue'
                                ? 'bg-red-50/80'
                                : assessment.overallStatus === 'on_schedule' ||
                                  assessment.overallStatus === 'complete'
                                ? 'bg-emerald-50/30'
                                : 'bg-slate-50/40';
                            return (
                              <td
                                className={`px-3 py-2.5 text-xs align-middle ${cellBg}`}
                              >
                                <div className="space-y-1">
                                  {assessment.overallStatus === 'behind_schedule' ? (
                                    <>
                                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-950">
                                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                                        Cảnh báo: Nguy cơ trễ
                                      </span>
                                      {assessment.status === 'behind_schedule' && (
                                        <div>
                                          <div className="text-xs font-extrabold text-red-700">
                                            Mương: +{formatNumber(assessment.additionalPerDayM || 0)} m/ngày
                                          </div>
                                          <div className="font-mono text-[11px] font-semibold text-slate-700">
                                            TB: {formatNumber(assessment.averagePerCalendarDayM || 0)} · Cần:{' '}
                                            {formatNumber(assessment.requiredPerDayM || 0)} m/ng
                                          </div>
                                        </div>
                                      )}
                                      {assessment.chamberStatus === 'behind_schedule' && (
                                        <div>
                                          <div className="text-xs font-extrabold text-red-700">
                                            Hầm: +{formatNumber(assessment.chamberAdditionalPerWeek || 0)} hầm/tuần
                                          </div>
                                          <div className="font-mono text-[11px] font-semibold text-slate-700">
                                            TB: {formatNumber(assessment.chamberAvgPerWeek || 0)} · Cần:{' '}
                                            {formatNumber(assessment.chamberRequiredPerWeek || 0)} h/tuần
                                          </div>
                                        </div>
                                      )}
                                      {finishStr && (
                                        <div className="text-[11px] font-semibold text-slate-500">
                                          Hạn: {finishStr}
                                        </div>
                                      )}
                                    </>
                                  ) : assessment.overallStatus === 'overdue' ? (
                                    <>
                                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-extrabold text-red-900">
                                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                                        Cảnh báo: Quá hạn
                                      </span>
                                      <div className="text-xs font-extrabold text-red-700">
                                        Trễ {formatNumber(Math.abs(assessment.daysUntilFinish || 0))} ngày · Còn{' '}
                                        {[
                                          assessment.remainingM > 0
                                            ? `${formatNumber(assessment.remainingM)}m`
                                            : '',
                                          assessment.remainingChambers > 0
                                            ? `${formatNumber(assessment.remainingChambers)} hầm`
                                            : '',
                                        ]
                                          .filter(Boolean)
                                          .join(', ')}
                                      </div>
                                      {finishStr && (
                                        <div className="text-[11px] font-semibold text-slate-500">
                                          Hạn: {finishStr}
                                        </div>
                                      )}
                                    </>
                                  ) : assessment.overallStatus === 'complete' ? (
                                    <>
                                      <span className="inline-flex items-center whitespace-nowrap rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                                        Hoàn tất
                                      </span>
                                      <div className="text-[11px] font-semibold text-emerald-700">
                                        Đạt 100% KLHĐ
                                      </div>
                                    </>
                                  ) : assessment.overallStatus === 'on_schedule' ? (
                                    <>
                                      <span className="inline-flex items-center whitespace-nowrap rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                                        Đúng tiến độ
                                      </span>
                                      <div className="font-mono text-[11px] font-semibold text-slate-700">
                                        Mương: TB {formatNumber(assessment.averagePerCalendarDayM || 0)} · Cần{' '}
                                        {formatNumber(assessment.requiredPerDayM || 0)} m/ng
                                      </div>
                                      {assessment.chamberStatus === 'on_schedule' && (
                                        <div className="font-mono text-[11px] font-semibold text-slate-700">
                                          Hầm: TB {formatNumber(assessment.chamberAvgPerWeek || 0)} · Cần{' '}
                                          {formatNumber(assessment.chamberRequiredPerWeek || 0)} h/tuần
                                        </div>
                                      )}
                                      {finishStr && (
                                        <div className="text-[11px] font-semibold text-slate-500">
                                          Hạn: {finishStr}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <span className="inline-flex items-center whitespace-nowrap rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                                        Thiếu dữ liệu
                                      </span>
                                      {assessment.requiredPerDayM !== null && (
                                        <div className="font-mono text-[11px] font-semibold text-slate-600">
                                          Cần: {formatNumber(assessment.requiredPerDayM)} m/ng
                                        </div>
                                      )}
                                      {assessment.chamberRequiredPerWeek !== null && (
                                        <div className="font-mono text-[11px] font-semibold text-slate-600">
                                          Hầm: {formatNumber(assessment.chamberRequiredPerWeek)} h/tuần
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            );
                          })()}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* SECTION 3: LỊCH THI CÔNG N NGÀY GẦN NHẤT */}
          <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-2xs">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <HardHat className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                    Lịch Thi Công {dateColumns.length} Ngày Gần Nhất ({formatDateShort(dateColumns[0])} →{' '}
                    {formatDateShort(dateColumns[dateColumns.length - 1])})
                  </h3>
                  <p className="text-xs text-slate-600">
                    Hiển thị chi tiết từng ngày thi công và sản lượng theo từng dự án & nhà thầu
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-900">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Thi công
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-900">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Nghỉ
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> Chưa BC
                </span>
              </div>
            </div>

            <div
              className={`rounded-xl border border-slate-200 ${
                isCapturing ? 'overflow-visible' : 'overflow-x-auto'
              }`}
            >
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-slate-300 bg-slate-100 text-slate-900">
                    <th
                      className={`${
                        isCapturing
                          ? 'w-[220px] min-w-[220px] max-w-[220px]'
                          : 'sticky left-0 z-20 min-w-[155px] max-w-[175px] sm:w-[220px] sm:min-w-[220px] sm:max-w-[220px]'
                      } border-r border-slate-300 bg-slate-100 px-2.5 py-2 text-left text-sm font-extrabold`}
                    >
                      Dự Án / Nhà Thầu
                    </th>
                    {dateColumns.map((dateKey) => {
                      const isTargetDay = dateKey === reportDate;
                      return (
                        <th
                          key={dateKey}
                          className={`min-w-[96px] border-r border-slate-200 px-1.5 py-2 text-center font-mono text-sm ${
                            isTargetDay
                              ? 'bg-blue-600 text-white font-black'
                              : 'text-slate-800 font-bold'
                          }`}
                        >
                          {formatDateShort(dateKey)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {projectSummaries.map((summary) => {
                    const hasMultipleContractors = summary.contractorRows.length > 1;
                    return (
                      <React.Fragment key={summary.project.id}>
                        {/* Multi-contractor Project Group Header */}
                        {hasMultipleContractors && (
                          <tr className="bg-slate-50/90">
                            <td
                              className={`${
                                isCapturing ? '' : 'sticky left-0 z-10'
                              } border-r border-slate-300 bg-slate-100/95 px-2.5 py-2`}
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <span className="text-xs font-extrabold text-slate-900 leading-snug break-words">
                                  {summary.project.name}
                                </span>
                                <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 font-mono text-xs font-bold text-blue-800">
                                  {summary.pct}%
                                </span>
                              </div>
                            </td>
                            {dateColumns.map((dateKey) => {
                              const dayProjectLogs = summary.contractorRows
                                .map((c) =>
                                  logLookup.get(`${summary.project.id}:${c.key}:${dateKey}`)
                                )
                                .filter((l): l is DailyLogEntry => Boolean(l));
                              const anyWorking = dayProjectLogs.some((l) => !isStopped(l));
                              const dayExcavation = dayProjectLogs.reduce(
                                (s, l) => s + (l.excavationTodayM || 0),
                                0
                              );
                              const dayChambers = dayProjectLogs.reduce(
                                (s, l) => s + (l.chambersPouredToday || 0),
                                0
                              );
                              const dayRestored = dayProjectLogs.reduce(
                                (s, l) => s + (l.restoredTodayM || 0),
                                0
                              );
                              return (
                                <td
                                  key={dateKey}
                                  className="border-r border-slate-200 px-1.5 py-1.5 text-center text-xs font-bold text-slate-800"
                                >
                                  {dayProjectLogs.length > 0 ? (
                                    <div className="space-y-0.5">
                                      <span
                                        className={
                                          anyWorking ? 'text-emerald-800' : 'text-amber-800'
                                        }
                                      >
                                        {anyWorking ? 'Thi công' : 'Nghỉ'}
                                      </span>
                                      {(dayExcavation > 0 || dayChambers > 0 || dayRestored > 0) && (
                                        <div className="font-mono text-xs font-bold text-blue-800">
                                          {[
                                            dayExcavation > 0 ? `Đào ${dayExcavation}m` : '',
                                            dayChambers > 0 ? `${dayChambers} hầm` : '',
                                            dayRestored > 0 ? `Thảm ${dayRestored}m` : '',
                                          ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-300">·</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        )}

                        {/* Contractor Rows */}
                        {summary.contractorRows.map((cRow) => (
                          <tr
                            key={`${summary.project.id}-${cRow.key}`}
                            className="hover:bg-blue-50/20"
                          >
                            <td
                              className={`${
                                isCapturing ? '' : 'sticky left-0 z-10'
                              } border-r border-slate-300 bg-white px-2.5 py-2 align-top`}
                            >
                              {hasMultipleContractors ? (
                                <div className="space-y-0.5 pl-1.5">
                                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                                    <span
                                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                                      style={{ backgroundColor: cRow.color }}
                                    />
                                    <span className="break-words leading-snug">{cRow.name}</span>
                                  </div>
                                  <div className="pl-4 font-mono text-xs text-slate-600">
                                    {formatNumber(cRow.cumulativeTrenchM)} /{' '}
                                    {formatNumber(cRow.contractLengthM)}m
                                  </div>
                                </div>
                              ) : (
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-start justify-between gap-1.5">
                                    <span className="text-xs font-bold text-slate-900 leading-snug break-words">
                                      {summary.project.name}
                                    </span>
                                    <span className="shrink-0 font-mono text-xs font-extrabold text-blue-700">
                                      {summary.pct}%
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-600 leading-snug break-words">
                                    {cRow.name} ·{' '}
                                    <span className="font-mono font-semibold text-slate-800">
                                      {formatNumber(cRow.cumulativeTrenchM)}/{formatNumber(cRow.contractLengthM)}m
                                    </span>
                                  </div>
                                </div>
                              )}
                            </td>

                            {dateColumns.map((dateKey) => {
                              const log = logLookup.get(
                                `${summary.project.id}:${cRow.key}:${dateKey}`
                              );
                              const inSchedule = isProjectActiveOnDate(
                                summary.project,
                                dateKey
                              );
                              const isTargetDay = dateKey === reportDate;

                              if (!log) {
                                const pausePeriod = getProjectPausePeriodForDate(
                                  summary.project,
                                  dateKey
                                );
                                if (pausePeriod) {
                                  return (
                                    <td
                                      key={dateKey}
                                      title={`${formatDateFull(dateKey)} · ${cRow.name}: Tạm ngưng (${pausePeriod.reason})`}
                                      className={`border-r border-slate-200 bg-amber-50/80 px-1.5 py-2 text-left align-top leading-snug ${
                                        isTargetDay ? 'ring-2 ring-inset ring-blue-500' : ''
                                      }`}
                                    >
                                      <div className="inline-block rounded bg-amber-200/80 px-1.5 py-0.5 text-xs font-extrabold text-amber-950">
                                        Tạm ngưng
                                      </div>
                                      <p className="mt-1 line-clamp-2 break-words text-xs font-medium text-amber-900">
                                        {pausePeriod.reason}
                                      </p>
                                    </td>
                                  );
                                }
                                return (
                                  <td
                                    key={dateKey}
                                    title={
                                      inSchedule
                                        ? `${formatDateFull(dateKey)} · ${cRow.name}: Chưa báo cáo`
                                        : `${formatDateFull(dateKey)}: Ngoài thời gian triển khai`
                                    }
                                    className={`border-r border-slate-200 px-1.5 py-2 text-center align-middle ${
                                      isTargetDay ? 'bg-blue-50/40' : ''
                                    }`}
                                  >
                                    {inSchedule ? (
                                      <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                                    ) : (
                                      <span className="text-xs text-slate-300">-</span>
                                    )}
                                  </td>
                                );
                              }

                              const stopped = isStopped(log);
                              const trenchToday = getDailyTrenchOutput(log);
                              const restoredToday = log.restoredTodayM || 0;
                              const noteText = (log.notes || '').trim();
                              const stopReason = (log.stoppageReason || '').trim();
                              const tooltip = stopped
                                ? `${formatDateFull(dateKey)} · ${cRow.name}: Nghỉ (${
                                    stopReason || log.resources
                                  })${noteText ? ` | Ghi chú: ${noteText}` : ''}`
                                : `${formatDateFull(dateKey)} · ${cRow.name}: Thi công | Đào phui: ${formatNumber(
                                    trenchToday
                                  )}m | Đổ hố ga: ${formatNumber(
                                    log.chambersPouredToday
                                  )} hầm | Hoàn trả thảm: ${formatNumber(restoredToday)}m${
                                    noteText ? ` | Ghi chú: ${noteText}` : ''
                                  }`;

                              return (
                                <td
                                  key={dateKey}
                                  title={tooltip}
                                  className={`border-r border-slate-200 px-1.5 py-2 text-left align-top leading-snug ${
                                    stopped
                                      ? 'bg-amber-50 text-amber-950'
                                      : 'bg-emerald-50/85 text-slate-900'
                                  } ${isTargetDay ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                                >
                                  <div
                                    className={`inline-block rounded px-1.5 py-0.5 text-xs font-extrabold ${
                                      stopped
                                        ? 'bg-amber-200/80 text-amber-950'
                                        : 'bg-emerald-200/80 text-emerald-950'
                                    }`}
                                  >
                                    {stopped ? 'Nghỉ' : 'Thi công'}
                                  </div>

                                  {stopped ? (
                                    <div className="mt-1 space-y-0.5 text-xs font-medium text-amber-900">
                                      {(stopReason || log.resources) && (
                                        <p className="line-clamp-2 break-words">
                                          {stopReason || log.resources}
                                        </p>
                                      )}
                                      {noteText && (
                                        <p className="line-clamp-2 break-words italic text-slate-700">
                                          {noteText}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="mt-1 space-y-0.5 font-mono text-xs">
                                      {trenchToday > 0 && (
                                        <div className="font-bold text-blue-900">
                                          Đào: {formatNumber(trenchToday)}m
                                        </div>
                                      )}
                                      {log.chambersPouredToday > 0 && (
                                        <div className="font-bold text-emerald-900">
                                          Hầm: {formatNumber(log.chambersPouredToday)}
                                        </div>
                                      )}
                                      {restoredToday > 0 && (
                                        <div className="font-bold text-teal-800">
                                          Thảm: {formatNumber(restoredToday)}m
                                        </div>
                                      )}
                                      {noteText && (
                                        <p className="font-sans text-xs italic text-slate-700 line-clamp-2 break-words">
                                          {noteText}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
