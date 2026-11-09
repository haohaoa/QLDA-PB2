import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { UndergroundProject, DailyLogEntry, PlanType, SiteBulletin } from '../types/undergrounding';
import { formatNumber } from '../utils/numberFormat';
import {
  BarChart3,
  Download,
  Copy,
  Check,
  Printer,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  Map as MapIcon,
} from 'lucide-react';
import { isProjectActiveOnDate } from '../utils/scheduleUtils';
import { getContractorKey, getDailyTrenchOutput, getLatestProgressLogs } from '../utils/progressUtils';
import { getContractorAssessment } from '../utils/contractorAssessment';

function getWeekRange(dateKey: string, weekOffset = 0): { start: string; end: string } {
  const [year, month, day] = dateKey.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + weekOffset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const toDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;

  return { start: toDateKey(start), end: toDateKey(end) };
}

function wrapProjectName(name: string, maxLineLength = 22): string[] {
  const lines: string[] = [];
  let currentLine = '';

  for (const word of name.trim().split(/\s+/)) {
    let remainingWord = word;
    while (remainingWord.length > maxLineLength) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      lines.push(remainingWord.slice(0, maxLineLength));
      remainingWord = remainingWord.slice(maxLineLength);
    }

    if (!remainingWord) continue;
    if (!currentLine) {
      currentLine = remainingWord;
    } else if (`${currentLine} ${remainingWord}`.length <= maxLineLength) {
      currentLine = `${currentLine} ${remainingWord}`;
    } else {
      lines.push(currentLine);
      currentLine = remainingWord;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [name];
}

interface OverviewDashboardProps {
  projects: UndergroundProject[];
  planTypes: PlanType[];
  dailyLogs: DailyLogEntry[];
  bulletins: SiteBulletin[];
  currentDate: string;
  isAdmin: boolean;
  onGoToDailyReport: (projectId: string) => void;
  onGoToMap: (projectId: string) => void;
  onGoToBulletins: (projectId?: string) => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  projects,
  planTypes,
  dailyLogs,
  bulletins,
  currentDate,
  isAdmin,
  onGoToDailyReport,
  onGoToMap,
  onGoToBulletins,
}) => {
  const [copiedZalo, setCopiedZalo] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [hoveredChartProjectId, setHoveredChartProjectId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedPlanTypeId, setSelectedPlanTypeId] = useState('all');
  const projectCardRefs = useRef(new Map<string, HTMLElement>());

  const openProjectOverview = (projectId: string) => {
    setSelectedProjectId(projectId);
    requestAnimationFrame(() => {
      projectCardRefs.current.get(projectId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  };

  const scopedProjects = projects.filter(
    (project) =>
      selectedPlanTypeId === 'all' ||
      (project.planTypeId || 'plan-type-unclassified') === selectedPlanTypeId
  );
  const selectedPlanTypeName =
    planTypes.find((type) => type.id === selectedPlanTypeId)?.name || 'Chưa phân loại';
  const scopedProjectIds = new Set(scopedProjects.map((project) => project.id));
  const scopedBulletins = bulletins.filter(
    (bulletin) =>
      bulletin.projectId === 'all' || scopedProjectIds.has(bulletin.projectId)
  );
  const activeProjects = scopedProjects.filter(
    (project) => (project.status || 'in_progress') === 'in_progress'
  );
  const pausedProjectCount = scopedProjects.filter((project) => project.status === 'paused').length;
  const completedProjectCount = scopedProjects.filter((project) => project.status === 'completed').length;
  const latestProgressLogs = getLatestProgressLogs(dailyLogs);
  // Compute aggregate system metrics
  const totalSystemLengthM = scopedProjects.reduce((sum, p) => sum + p.totalLengthM, 0);
  const totalCompletedLengthM = scopedProjects.reduce((sum, p) => sum + p.completedLengthM, 0);
  const totalTargetChambers = scopedProjects.reduce((sum, p) => sum + p.totalChambers, 0);
  const totalCompletedChambers = scopedProjects.reduce((sum, p) => sum + p.completedChambers, 0);
  const totalContractValue = scopedProjects.reduce((sum, p) => sum + p.contractValueVND, 0);

  const overallLengthPercent =
    totalSystemLengthM > 0 ? Math.round((totalCompletedLengthM / totalSystemLengthM) * 100) : 0;
  const overallChamberPercent =
    totalTargetChambers > 0 ? Math.round((totalCompletedChambers / totalTargetChambers) * 100) : 0;
  const overallProgressPercent = Math.round((overallLengthPercent + overallChamberPercent) / 2);
  const projectChartData = scopedProjects.map((project) => {
    const trenchPercent =
      project.totalLengthM > 0
        ? Math.round((project.completedLengthM / project.totalLengthM) * 100)
        : 0;
    const chamberPercent =
      project.totalChambers > 0
        ? Math.round((project.completedChambers / project.totalChambers) * 100)
        : 0;
    return {
      project,
      trenchPercent,
      chamberPercent,
      overallPercent: Math.round((trenchPercent + chamberPercent) / 2),
    };
  });
  const projectChartWidth = Math.max(720, projectChartData.length * 190 + 72);
  const projectChartNameLines = projectChartData.map(({ project }) => wrapProjectName(project.name));
  const maxProjectNameLines = Math.max(1, ...projectChartNameLines.map((lines) => lines.length));
  const extraLabelHeight = Math.max(0, maxProjectNameLines - 3) * 12;
  const chartHeight = 280 + extraLabelHeight;
  const chartMargin = { top: 20, right: 24, bottom: 62 + extraLabelHeight, left: 46 };
  const chartPlotWidth = projectChartWidth - chartMargin.left - chartMargin.right;
  const chartPlotHeight = chartHeight - chartMargin.top - chartMargin.bottom;
  const chartBaseline = chartMargin.top + chartPlotHeight;
  const projectChartPoints = projectChartData.map(({ overallPercent }, index) => ({
    x: chartMargin.left + chartPlotWidth * ((index + 0.5) / Math.max(projectChartData.length, 1)),
    y: chartBaseline - (Math.min(Math.max(overallPercent, 0), 100) / 100) * chartPlotHeight,
  }));
  const projectChartLine = projectChartPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const thisWeekRange = getWeekRange(currentDate);
  const previousWeekRange = getWeekRange(currentDate, -1);
  const weekProgressByProject = scopedProjects.map((project) => {
    const sumForRange = (range: { start: string; end: string }) => {
      const rangeLogs = dailyLogs.filter(
        (log) =>
          log.projectId === project.id &&
          log.date >= range.start &&
          log.date <= range.end &&
          isProjectActiveOnDate(project, log.date)
      );
      return rangeLogs.reduce(
          (totals, log) => ({
            trench: totals.trench + getDailyTrenchOutput(log),
            chambers: totals.chambers + (log.chambersPouredToday || 0),
            reports: totals.reports + 1,
          }),
          { trench: 0, chambers: 0, reports: 0 }
        );
    };
    const previous = sumForRange(previousWeekRange);
    const current = sumForRange({
      start: thisWeekRange.start,
      end: thisWeekRange.end < currentDate ? thisWeekRange.end : currentDate,
    });
    return { project, previous, current };
  });
  const maxWeeklyTrench = Math.max(
    1,
    ...weekProgressByProject.flatMap(({ previous, current }) => [previous.trench, current.trench])
  );
  const maxWeeklyChambers = Math.max(
    1,
    ...weekProgressByProject.flatMap(({ previous, current }) => [previous.chambers, current.chambers])
  );

  // Check today's submission status for projects
  const todayLogs = dailyLogs.filter((log) => {
    const project = scopedProjects.find((item) => item.id === log.projectId);
    return log.date === currentDate && !!project && isProjectActiveOnDate(project, currentDate);
  });
  const reportedProjectIds = new Set(todayLogs.map((l) => l.projectId));
  const unsubmittedProjects = activeProjects.filter(
    (project) =>
      isProjectActiveOnDate(project, currentDate) && !reportedProjectIds.has(project.id)
  );

  // Zalo dispatch copy
  const handleCopyZalo = () => {
    let text = `📊 BÁO CÁO NHANH TIẾN ĐỘ NGẦM HÓA CHO LÃNH ĐẠO\n`;
    text += `📅 Ngày báo cáo: ${currentDate}\n`;
    text += `🗂 Phạm vi: ${selectedPlanTypeId === 'all' ? 'Tất cả loại kế hoạch' : selectedPlanTypeName}\n`;
    text += `💰 Tổng quy mô: ${(totalContractValue / 1000000000).toFixed(1)} Tỷ VNĐ (${scopedProjects.length} Dự án)\n`;
    text += `⚡ Tiến độ mương cáp: ${formatNumber(totalCompletedLengthM)}/${formatNumber(totalSystemLengthM)} m (${overallLengthPercent}%)\n`;
    text += `☵ Hố ga hoàn tất: ${totalCompletedChambers}/${totalTargetChambers} hầm (${overallChamberPercent}%)\n`;
    text += `📈 Tiến độ tổng hợp theo phạm vi đã chọn: ${overallProgressPercent}% (trung bình mương cáp và hố ga)\n`;
    text += `------------------------------------\n`;
    text += `📋 TIẾN ĐỘ TỪNG DỰ ÁN:\n`;

    scopedProjects.forEach((p, idx) => {
      const pct = p.totalLengthM > 0 ? Math.round((p.completedLengthM / p.totalLengthM) * 100) : 0;
      const chPct = p.totalChambers > 0 ? Math.round((p.completedChambers / p.totalChambers) * 100) : 0;
      text += `${idx + 1}. ${p.name}\n`;
      const contractors = p.contractors?.length
        ? p.contractors.map((contractor) => contractor.name)
        : [p.contractor];
      text += `   • Nhà thầu: ${contractors.join(', ')}\n`;
      p.contractors?.forEach((contractor) => {
        const latest = latestProgressLogs.find(
          (log) =>
            log.projectId === p.id &&
            getContractorKey(log.contractorName) === getContractorKey(contractor.name)
        );
        text += `      - ${contractor.name}: ${formatNumber(latest?.cumulativeTrenchM || 0)}/${formatNumber(contractor.totalLengthM)} m, hố ga ${formatNumber(latest?.cumulativeChambers || 0)}/${formatNumber(contractor.totalChambers)}\n`;
      });
      text += `   • Mương cáp: ${formatNumber(p.completedLengthM)}/${formatNumber(p.totalLengthM)} m (${pct}%)\n`;
      text += `   • Hố ga: ${p.completedChambers}/${p.totalChambers} hầm (${chPct}%)\n`;
      text += `   • Hiện trường: ${p.currentWorkLocation}\n`;

      const projectBulletins = bulletins.filter((b) => b.isActive && (b.projectId === p.id || b.projectId === 'all'));
      if (projectBulletins.length > 0) {
        text += `   ⚠️ Chú ý: ${projectBulletins[0].title} (${projectBulletins[0].documentRefNumber || 'Hồ sơ pháp lý'})\n`;
      }
    });

    if (isAdmin && unsubmittedProjects.length > 0) {
      text += `------------------------------------\n`;
      text += `🚨 CẢNH BÁO HÔM NAY (${currentDate}): Có ${unsubmittedProjects.length} tuyến chưa chốt số liệu: ${unsubmittedProjects.map(p => p.name).join(', ')}\n`;
    }

    navigator.clipboard.writeText(text);
    setCopiedZalo(true);
    setTimeout(() => setCopiedZalo(false), 2500);
  };

  return (
    <div className="w-full min-w-0 space-y-4 overflow-x-clip pb-12 sm:space-y-6">
      {/* 1. Header Toolbar with Direct Fast Actions */}
      <div className="flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs sm:flex-row sm:items-center sm:gap-4 sm:p-5 md:flex-row">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 mb-1">
            <Sparkles className="w-4 h-4" />
            <span>TỔNG QUAN</span>
          </div>
          <h2 className="text-lg font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
            Biểu Đồ Tiến Độ & Báo Cáo Điều Hành
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi tiến độ tổng hợp, khối lượng từng hạng mục và tăng trưởng thi công theo tuần.
          </p>
        </div>

        <div className="grid w-full gap-2 sm:w-auto sm:min-w-[18rem] sm:grid-cols-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Tổng quan theo loại kế hoạch
            <select
              value={selectedPlanTypeId}
              onChange={(event) => {
                setSelectedPlanTypeId(event.target.value);
                setSelectedProjectId(null);
              }}
              aria-label="Lọc tổng quan theo loại kế hoạch"
              className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold normal-case tracking-normal text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">Tất cả loại kế hoạch</option>
              {planTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Action buttons: Zalo & Export Image/Print */}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-2.5">
          <button
            onClick={handleCopyZalo}
            className="flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-2 py-2 text-[10px] font-bold text-white shadow-xs transition-all hover:bg-blue-700 active:scale-[0.98] sm:gap-2 sm:px-4 sm:text-xs"
            title="Sao chép tóm tắt định dạng nhanh gửi Zalo các sếp"
          >
            {copiedZalo ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedZalo ? 'Đã Sao Chép Zalo!' : 'Báo Cáo Zalo (1-Click)'}</span>
          </button>

          <button
            onClick={() => setShowPrintModal(true)}
            className="flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-2 py-2 text-[10px] font-semibold text-slate-800 transition-colors hover:bg-slate-200 sm:gap-1.5 sm:px-3.5 sm:text-xs"
            title="Xem & Chụp hình phiếu báo cáo lãnh đạo"
          >
            <Printer className="w-4 h-4" />
            <span>Chụp / In Phiếu Báo Cáo</span>
          </button>
        </div>
      </div>

      {/* 2. Today Unsubmitted Warning Banner (Nổi bật nếu hôm nay chưa báo cáo) */}
      {isAdmin && unsubmittedProjects.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-950 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-bold">
                  {unsubmittedProjects.length} dự án chưa báo cáo hôm nay
                </p>
                <p className="mt-0.5 text-xs text-amber-800">
                  Ngày {currentDate.split('-').reverse().join('/')}
                </p>
              </div>
            </div>
            <button
              onClick={() => onGoToDailyReport(unsubmittedProjects[0]?.id)}
              className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-800"
            >
              Mở báo cáo
            </button>
          </div>
          <details className="group mt-3 border-t border-amber-200 pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-amber-800 marker:hidden">
              <span>Xem danh sách dự án</span>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-2 space-y-1 pl-4 text-xs text-amber-900">
              {unsubmittedProjects.map((project) => (
                <li key={project.id} className="list-disc">{project.name}</li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* 3. Executive KPI Metric Row */}
      <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5">
        <div className="order-1 min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-5 lg:order-none">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Tổng Giá Trị Hợp Đồng
          </span>
          <div className="break-words text-lg font-black font-mono text-slate-900 sm:text-2xl">
            {(totalContractValue / 1000000000).toFixed(2)}{' '}
            <span className="text-xs font-sans font-semibold text-slate-500">Tỷ VNĐ</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {activeProjects.length} dự án đang thực hiện
          </span>
        </div>

        <div className="order-3 col-span-2 min-w-0 rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/70 p-3 shadow-xs sm:p-5 lg:order-none">
          <div className="min-w-0 space-y-3">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Tiến độ tổng hợp theo phạm vi đã chọn
              </span>
              <span className="shrink-0 text-2xl font-black font-mono text-slate-900">
                {overallProgressPercent}%
              </span>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-blue-100 bg-white/80 p-2.5 sm:p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Mương cáp</p>
                  <p className="shrink-0 font-mono text-sm font-black text-blue-700">{overallLengthPercent}%</p>
                </div>
                <p className="mt-1 whitespace-nowrap text-[10px] tabular-nums text-slate-500">
                  {formatNumber(totalCompletedLengthM)} / {formatNumber(totalSystemLengthM)} m
                </p>
              </div>
              <div className="min-w-0 rounded-xl border border-emerald-100 bg-white/80 p-2.5 sm:p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Hầm / hố ga</p>
                  <p className="shrink-0 font-mono text-sm font-black text-emerald-700">{overallChamberPercent}%</p>
                </div>
                <p className="mt-1 whitespace-nowrap text-[10px] tabular-nums text-slate-500">
                  {formatNumber(totalCompletedChambers)} / {formatNumber(totalTargetChambers)} hầm
                </p>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Tiến độ tổng hợp = trung bình tỷ lệ hoàn thành mương cáp và hầm / hố ga.
          </p>
        </div>

        <div className="order-2 min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-5 lg:order-none">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
            Bảng Tin & Pháp Lý
          </span>
          <div className="text-lg font-black font-mono text-amber-600 sm:text-2xl">
            {formatNumber(scopedBulletins.filter((b) => b.isActive).length)}{' '}
            <span className="text-xs font-sans font-semibold text-slate-500">thông báo</span>
          </div>
          <button
            onClick={() => onGoToBulletins()}
            className="text-[11px] text-blue-600 hover:text-blue-800 underline font-semibold mt-1 block text-left"
          >
            Xem bảng tin hiện trường
          </button>
        </div>

        <div className="order-4 col-span-2 min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-5 lg:order-none lg:col-span-1">
          <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Số lượng dự án
          </span>
          <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-1 lg:gap-1">
            <div className="rounded-lg bg-blue-50 px-2 py-1.5 text-center lg:flex lg:items-center lg:justify-between lg:text-left">
              <span className="block text-[9px] font-semibold text-blue-700 sm:text-[10px]">Đang thực hiện</span>
              <strong className="font-mono text-sm text-blue-800">{activeProjects.length}</strong>
            </div>
            <div className="rounded-lg bg-amber-50 px-2 py-1.5 text-center lg:flex lg:items-center lg:justify-between lg:text-left">
              <span className="block text-[9px] font-semibold text-amber-700 sm:text-[10px]">Tạm ngưng</span>
              <strong className="font-mono text-sm text-amber-800">{pausedProjectCount}</strong>
            </div>
            <div className="rounded-lg bg-emerald-50 px-2 py-1.5 text-center lg:flex lg:items-center lg:justify-between lg:text-left">
              <span className="block text-[9px] font-semibold text-emerald-700 sm:text-[10px]">Hoàn tất</span>
              <strong className="font-mono text-sm text-emerald-800">{completedProjectCount}</strong>
            </div>
          </div>
        </div>
      </div>

      <section
        onMouseLeave={() => setHoveredChartProjectId(null)}
        className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-5"
      >
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <BarChart3 className="h-4 w-4 text-indigo-600" />
              Biểu đồ tiến độ tổng hợp các dự án
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Cột so sánh tỷ lệ hoàn thành mương cáp và hố ga; đường biểu diễn tiến độ tổng hợp.
            </p>
          </div>
        </div>

        {projectChartData.length > 0 ? (
          <>
            <AnimatePresence mode="wait">
              {hoveredChartProjectId && (
            <motion.div
              key={hoveredChartProjectId}
              initial={{ opacity: 0, y: -8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.99 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="origin-top"
            >
              {(() => {
                const chartItem = projectChartData.find(
                  ({ project }) => project.id === hoveredChartProjectId
                );
                if (!chartItem) return null;
                const project = chartItem.project;
                const projectWeek = weekProgressByProject.find(
                  ({ project: weekProject }) => weekProject.id === project.id
                );
                const contractors = project.contractors?.length
                  ? project.contractors.map((contractor) => {
                      const latest = latestProgressLogs.find(
                        (log) =>
                          log.projectId === project.id &&
                          getContractorKey(log.contractorName) === getContractorKey(contractor.name)
                      );
                      const assessment = getContractorAssessment(
                        project,
                        contractor,
                        dailyLogs,
                        currentDate
                      );
                      return {
                        name: contractor.name,
                        completedM: latest?.cumulativeTrenchM || 0,
                        totalM: contractor.totalLengthM,
                        completedChambers: latest?.cumulativeChambers || 0,
                        totalChambers: contractor.totalChambers,
                        assessment,
                      };
                    })
                  : latestProgressLogs
                      .filter((log) => log.projectId === project.id)
                      .map((log) => ({
                        name: log.contractorName,
                        completedM: log.cumulativeTrenchM,
                        totalM: log.contractTrenchM,
                        completedChambers: log.cumulativeChambers,
                        totalChambers: log.contractChambers,
                        assessment: getContractorAssessment(
                          project,
                          { name: log.contractorName, totalLengthM: log.contractTrenchM },
                          dailyLogs,
                          currentDate
                        ),
                      }));
                const projectBulletins = bulletins.filter(
                  (bulletin) =>
                    bulletin.isActive &&
                    (bulletin.projectId === project.id || bulletin.projectId === 'all')
                );
                return (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-xs shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words font-bold text-slate-900">{project.name}</p>
                        <p className="mt-0.5 text-[10px] text-slate-600">
                          {project.code} · {project.investor} · Hạn {project.finishDate.split('-').reverse().join('/')}
                          {' · '}{formatNumber(project.contractValueVND / 1_000_000_000, 2)} tỷ VNĐ
                        </p>
                        <p className="break-words text-[10px] text-slate-600">
                          Hiện trường: {project.currentWorkLocation || 'Chưa cập nhật'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => onGoToMap(project.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-teal-800 transition duration-200 hover:-translate-y-0.5 hover:bg-teal-50 hover:shadow-sm active:translate-y-0"
                        >
                          <MapIcon className="h-3 w-3" />
                          Xem tuyến
                        </button>
                        <button
                          type="button"
                          onClick={() => openProjectOverview(project.id)}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[10px] font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-md active:translate-y-0"
                        >
                          Mở toàn bộ thông tin ↓
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <p className="rounded-lg bg-white px-2.5 py-2 text-slate-700">
                        <strong>Tiến độ:</strong> Mương {formatNumber(project.completedLengthM)}/{formatNumber(project.totalLengthM)} m ({chartItem.trenchPercent}%)
                        {' · '}Hố ga {formatNumber(project.completedChambers)}/{formatNumber(project.totalChambers)} ({chartItem.chamberPercent}%)
                        {' · '}Tổng hợp {chartItem.overallPercent}%
                      </p>
                      <div className="rounded-lg bg-white px-2.5 py-2 text-slate-700">
                        <strong>Nhà thầu:</strong>
                        {contractors.length > 0 ? (
                          <div className="mt-1 space-y-1">
                            {contractors.map((contractor) => (
                              <p key={contractor.name} className="break-words">
                                {contractor.name}: {formatNumber(contractor.completedM)}/{formatNumber(contractor.totalM)} m
                                {' · '}hố ga {formatNumber(contractor.completedChambers)}/{formatNumber(contractor.totalChambers)}
                                {' · '}ngày làm/nghỉ {formatNumber(contractor.assessment.workDays)}/{formatNumber(contractor.assessment.restDays)}
                                {' · '}KLTB {contractor.assessment.averagePerWorkdayM === null
                                  ? '—'
                                  : `${formatNumber(contractor.assessment.averagePerWorkdayM)} m/ngày`}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <span className="ml-1">Chưa có nhật ký nhà thầu</span>
                        )}
                      </div>
                      <p className="rounded-lg bg-white px-2.5 py-2 text-slate-700">
                        <strong>Sản lượng tuần:</strong>{' '}
                        {projectWeek
                          ? `Mương ${formatNumber(projectWeek.current.trench)} m tuần này / ${formatNumber(projectWeek.previous.trench)} m tuần trước · Hố ga ${formatNumber(projectWeek.current.chambers)} / ${formatNumber(projectWeek.previous.chambers)}`
                          : 'Chưa có dữ liệu tuần'}
                        {' · '}<strong>Thông báo:</strong> {projectBulletins.length}
                      </p>
                    </div>
                    {projectBulletins.length > 0 && (
                      <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-amber-900">
                        <strong>Thông báo mới nhất:</strong> {projectBulletins[0].title} — {projectBulletins[0].content}
                      </p>
                    )}
                  </div>
                );
              })()}
            </motion.div>
              )}
            </AnimatePresence>
          <div className="overflow-x-auto">
            <svg
              role="group"
              aria-label="Biểu đồ cột tỷ lệ hoàn thành mương cáp và hố ga, kết hợp đường tiến độ tổng hợp theo từng dự án"
              viewBox={`0 0 ${projectChartWidth} ${chartHeight}`}
              className="block w-full min-w-[720px]"
              style={{ height: `${chartHeight}px` }}
            >
              {[0, 25, 50, 75, 100].map((tick) => {
                const y = chartBaseline - (tick / 100) * chartPlotHeight;
                return (
                  <g key={tick}>
                    <line
                      x1={chartMargin.left}
                      x2={projectChartWidth - chartMargin.right}
                      y1={y}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray={tick === 0 ? undefined : '3 4'}
                    />
                    <text
                      x={chartMargin.left - 8}
                      y={y + 3}
                      textAnchor="end"
                      className="fill-slate-500"
                      fontSize="9"
                    >
                      {tick}%
                    </text>
                  </g>
                );
              })}

              {projectChartData.map(({ project, trenchPercent, chamberPercent }, index) => {
                const groupCenter =
                  chartMargin.left + chartPlotWidth * ((index + 0.5) / projectChartData.length);
                const groupWidth = chartPlotWidth / projectChartData.length;
                const barWidth = Math.min(28, groupWidth * 0.22);
                const barGap = 5;
                const trenchHeight = (Math.min(Math.max(trenchPercent, 0), 100) / 100) * chartPlotHeight;
                const chamberHeight = (Math.min(Math.max(chamberPercent, 0), 100) / 100) * chartPlotHeight;
                const labelLines = projectChartNameLines[index];
                return (
                  <g
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Xem tổng quan dự án ${project.name}`}
                    className="group cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
                    onMouseEnter={() => setHoveredChartProjectId(project.id)}
                    onFocus={() => setHoveredChartProjectId(project.id)}
                    onClick={() => openProjectOverview(project.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openProjectOverview(project.id);
                      }
                    }}
                  >
                    <rect
                      x={groupCenter - groupWidth / 2}
                      y={chartMargin.top}
                      width={groupWidth}
                      height={chartPlotHeight + chartMargin.bottom - 10}
                      fill="transparent"
                    />
                    <rect
                      x={groupCenter - barGap / 2 - barWidth}
                      y={chartBaseline - trenchHeight}
                      width={barWidth}
                      height={trenchHeight}
                      rx="3"
                      fill="#2563eb"
                      className="transition-[filter,opacity] duration-200 ease-out group-hover:brightness-110 group-focus-visible:brightness-110"
                    />
                    <rect
                      x={groupCenter + barGap / 2}
                      y={chartBaseline - chamberHeight}
                      width={barWidth}
                      height={chamberHeight}
                      rx="3"
                      fill="#10b981"
                      className="transition-[filter,opacity] duration-200 ease-out group-hover:brightness-110 group-focus-visible:brightness-110"
                    />
                    <text x={groupCenter} y={chartBaseline + 16} textAnchor="middle" className="fill-slate-600" fontSize="9">
                      {labelLines.map((line, lineIndex) => (
                        <tspan key={`${project.id}-label-${lineIndex}`} x={groupCenter} dy={lineIndex === 0 ? 0 : 12}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                );
              })}

              {projectChartPoints.length > 1 && (
                <path d={projectChartLine} fill="none" stroke="#7c3aed" strokeWidth="2.5" pointerEvents="none" />
              )}
              {projectChartPoints.map((point, index) => (
                <g
                  key={projectChartData[index].project.id}
                  onMouseEnter={() => setHoveredChartProjectId(projectChartData[index].project.id)}
                  onClick={() => openProjectOverview(projectChartData[index].project.id)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="4"
                    fill="#7c3aed"
                    stroke="white"
                    strokeWidth="2"
                    className="origin-center transition-transform duration-200 ease-out hover:scale-125"
                  />
                  <text
                    x={point.x}
                    y={point.y - 8}
                    textAnchor="middle"
                    fill="#6d28d9"
                    fontSize="9"
                    fontWeight="700"
                  >
                    {projectChartData[index].overallPercent}%
                  </text>
                </g>
              ))}
            </svg>
          </div>
          </>
        ) : (
          <p className="py-8 text-center text-xs text-slate-500">Chưa có dự án phù hợp với loại kế hoạch đã chọn.</p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-semibold text-slate-600">
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-blue-600" />Mương cáp</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Hầm / hố ga</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-3 rounded bg-violet-600" />Tiến độ tổng hợp</span>
        </div>
      </section>

      <section className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-5">
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              Tiến độ tổng hợp các dự án
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Mỗi dự án hiển thị tiến độ tổng hợp cùng tỷ lệ riêng của mương cáp và hầm / hố ga.
            </p>
          </div>
          <span className="w-fit rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
            {selectedPlanTypeId === 'all' ? 'Toàn hệ thống' : selectedPlanTypeName}: {overallProgressPercent}%
          </span>
        </div>

        {scopedProjects.length > 0 ? (
          <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
            {scopedProjects.map((project) => {
              const trenchPercent =
                project.totalLengthM > 0
                  ? Math.round((project.completedLengthM / project.totalLengthM) * 100)
                  : 0;
              const chamberPercent =
                project.totalChambers > 0
                  ? Math.round((project.completedChambers / project.totalChambers) * 100)
                  : 0;
              const projectProgressPercent = Math.round((trenchPercent + chamberPercent) / 2);
              const projectBulletins = bulletins.filter(
                (bulletin) =>
                  bulletin.isActive && (bulletin.projectId === project.id || bulletin.projectId === 'all')
              );
              const isAwaitingReport =
                isProjectActiveOnDate(project, currentDate) && !reportedProjectIds.has(project.id);
              const weeklyProgress = weekProgressByProject.find(
                (item) => item.project.id === project.id
              );
              const contractorProgress = project.contractors?.length
                ? project.contractors.map((contractor) => {
                    const latest = latestProgressLogs.find(
                      (log) =>
                        log.projectId === project.id &&
                        getContractorKey(log.contractorName) === getContractorKey(contractor.name)
                    );
                    return {
                      id: contractor.id,
                      name: contractor.name,
                      color: contractor.color,
                      assessment: getContractorAssessment(project, contractor, dailyLogs, currentDate),
                      completedLengthM: latest?.cumulativeTrenchM || 0,
                      totalLengthM: contractor.totalLengthM,
                      completedChambers: latest?.cumulativeChambers || 0,
                      totalChambers: contractor.totalChambers,
                      contractValueVND: contractor.contractValueVND,
                    };
                  })
                : (() => {
                    const existingLogs = latestProgressLogs.filter((log) => log.projectId === project.id);
                    return (existingLogs.length ? existingLogs : [{
                      id: project.id,
                      contractorName: project.contractor,
                      cumulativeTrenchM: 0,
                      contractTrenchM: project.totalLengthM,
                      cumulativeChambers: 0,
                      contractChambers: project.totalChambers,
                      contractValueVND: project.contractValueVND,
                    }]).map((log) => ({
                      id: log.id,
                      name: log.contractorName,
                      color: '#2563eb',
                      assessment: getContractorAssessment(
                        project,
                        { name: log.contractorName, totalLengthM: log.contractTrenchM },
                        dailyLogs,
                        currentDate
                      ),
                      completedLengthM: log.cumulativeTrenchM,
                      totalLengthM: log.contractTrenchM,
                      completedChambers: log.cumulativeChambers,
                      totalChambers: log.contractChambers,
                      contractValueVND: project.contractValueVND,
                    }));
                  })();

              return (
                <article
                  key={project.id}
                  ref={(element) => {
                    if (element) projectCardRefs.current.set(project.id, element);
                    else projectCardRefs.current.delete(project.id);
                  }}
                  className={`min-w-0 rounded-xl border p-3 transition sm:p-4 ${
                    selectedProjectId === project.id
                      ? 'scroll-mt-24 border-indigo-300 bg-indigo-50/20 shadow-md ring-2 ring-indigo-100'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="mb-3 flex min-w-0 items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4
                          title={project.name}
                          className={`min-w-0 break-words text-sm font-bold leading-snug ${isAwaitingReport ? 'text-red-700' : 'text-slate-900'}`}
                        >
                          {project.name}
                        </h4>
                        {projectBulletins.length > 0 && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-red-500"
                            title={`${projectBulletins.length} thông báo hiện trường`}
                          />
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] font-mono text-slate-500">{project.code}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {isAwaitingReport && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-black uppercase text-red-700 sm:text-[10px]">
                          Chưa báo cáo hôm nay
                        </span>
                      )}
                      <div className="text-right">
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[10px]">Tổng hợp</p>
                        <p className="font-mono text-base font-black text-slate-900 sm:text-lg">{projectProgressPercent}%</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onGoToMap(project.id)}
                        aria-label={`Xem bản đồ tuyến ${project.name}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-800 transition duration-200 hover:-translate-y-0.5 hover:bg-teal-100 hover:shadow-sm active:translate-y-0"
                      >
                        <MapIcon className="h-3 w-3" />
                        Xem tuyến
                      </button>
                    </div>
                  </div>

                  {selectedProjectId === project.id && (
                    <div className="mb-3 grid gap-2 rounded-lg border border-indigo-100 bg-indigo-50/70 p-2.5 text-[10px] text-slate-700 sm:grid-cols-2">
                      <p className="break-words"><strong>Chủ đầu tư:</strong> {project.investor}</p>
                      <p className="break-words"><strong>Nhà thầu:</strong> {project.contractors?.length ? project.contractors.map((contractor) => contractor.name).join(', ') : project.contractor}</p>
                      <p><strong>Thời gian:</strong> {project.startDate.split('-').reverse().join('/')} – {project.finishDate.split('-').reverse().join('/')}</p>
                      <p><strong>Giá trị hợp đồng:</strong> {formatNumber(project.contractValueVND / 1_000_000_000, 2)} tỷ VNĐ</p>
                      <p className="break-words sm:col-span-2"><strong>Vị trí hiện trường:</strong> {project.currentWorkLocation || 'Chưa cập nhật'}</p>
                    </div>
                  )}

                  <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all"
                      style={{ width: `${Math.min(projectProgressPercent, 100)}%` }}
                    />
                  </div>

                  <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:gap-2">
                    <div className="min-w-0 rounded-lg bg-blue-50/70 p-2 sm:p-2.5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-blue-800">Mương cáp</span>
                        <span className="font-mono text-xs font-black text-blue-800">{trenchPercent}%</span>
                      </div>
                      <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-blue-100">
                        <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(trenchPercent, 100)}%` }} />
                      </div>
                      <p className="break-words text-[9px] font-mono text-slate-600 sm:text-[10px]">
                        {formatNumber(project.completedLengthM)} / {formatNumber(project.totalLengthM)} m
                      </p>
                    </div>
                    <div className="min-w-0 rounded-lg bg-emerald-50/70 p-2 sm:p-2.5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-emerald-800">Hầm / hố ga</span>
                        <span className="font-mono text-xs font-black text-emerald-800">{chamberPercent}%</span>
                      </div>
                      <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-emerald-100">
                        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(chamberPercent, 100)}%` }} />
                      </div>
                      <p className="break-words text-[9px] font-mono text-slate-600 sm:text-[10px]">
                        {formatNumber(project.completedChambers)} / {formatNumber(project.totalChambers)} hầm
                      </p>
                    </div>
                  </div>
                  {projectBulletins.length > 0 && (
                    <details open={selectedProjectId === project.id} className="group mt-3 border-t border-slate-100 pt-2">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[10px] font-semibold text-amber-800 marker:hidden">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Thông báo hiện trường ({projectBulletins.length})
                        </span>
                        <span className="text-indigo-700 group-open:hidden">Xem +</span>
                        <span className="text-indigo-700 group-not-open:hidden">Thu gọn −</span>
                      </summary>
                      <div className="mt-2 space-y-2">
                        {projectBulletins.map((bulletin) => (
                          <div
                            key={bulletin.id}
                            className={`rounded-lg border px-2.5 py-2 text-[10px] ${
                              bulletin.severity === 'critical'
                                ? 'border-red-200 bg-red-50 text-red-950'
                                : bulletin.severity === 'warning'
                                ? 'border-amber-200 bg-amber-50 text-amber-950'
                                : 'border-blue-200 bg-blue-50 text-blue-950'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-1">
                              <p className="font-bold">{bulletin.title}</p>
                              <span className="font-mono text-[9px]">{bulletin.date.split('-').reverse().join('/')}</span>
                            </div>
                            {bulletin.documentRefNumber && (
                              <p className="mt-0.5 font-mono text-[9px]">{bulletin.documentRefNumber}</p>
                            )}
                            <p className="mt-1 leading-relaxed">{bulletin.content}</p>
                            <button
                              type="button"
                              onClick={() => onGoToBulletins(project.id)}
                              className="mt-1 font-bold underline"
                            >
                              Mở thông báo
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {contractorProgress.length > 0 && (
                    <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">
                        Lũy kế theo nhà thầu
                      </p>
                      {contractorProgress.map((contractor) => (
                        <details
                          key={contractor.id}
                          open={selectedProjectId === project.id}
                          className="group min-w-0 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] sm:text-[11px]"
                        >
                          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-2 gap-y-1 marker:hidden">
                            <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-800">
                              <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: contractor.color }} />
                              <span className="break-words">{contractor.name}</span>
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                                contractor.assessment.status === 'complete' || contractor.assessment.status === 'on_schedule'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : contractor.assessment.status === 'behind_schedule'
                                  ? 'bg-amber-100 text-amber-800'
                                  : contractor.assessment.status === 'overdue'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-white text-slate-600'
                              }`}>
                                {{
                                  complete: 'Hoàn tất',
                                  on_schedule: 'Đúng tiến độ',
                                  behind_schedule: 'Nguy cơ trễ',
                                  overdue: 'Quá hạn',
                                  insufficient_data: 'Thiếu dữ liệu',
                                }[contractor.assessment.status]}
                              </span>
                            </span>
                            <span className="font-mono text-slate-600">
                              {formatNumber(contractor.completedLengthM)}/{formatNumber(contractor.totalLengthM)} m
                              {' · '}hố ga {formatNumber(contractor.completedChambers)}/{formatNumber(contractor.totalChambers)}
                              {' · '}{formatNumber(contractor.contractValueVND / 1_000_000_000, 2)} tỷ
                            </span>
                            <span className="shrink-0 text-[9px] font-semibold text-indigo-700 group-open:hidden">
                              Xem thống kê +
                            </span>
                            <span className="shrink-0 text-[9px] font-semibold text-indigo-700 group-not-open:hidden">
                              Thu gọn −
                            </span>
                          </summary>
                          <div className="mt-2 grid gap-2 border-t border-slate-200 pt-2 sm:grid-cols-2">
                            <div className="space-y-0.5 text-slate-700">
                              <p>
                                Ngày làm: <strong>{formatNumber(contractor.assessment.workDays)}</strong>
                                {' · '}Ngày nghỉ: <strong>{formatNumber(contractor.assessment.restDays)}</strong>
                              </p>
                              <p>
                                Đào phui: <strong>{formatNumber(contractor.assessment.excavationTotalM)} m</strong>
                                {' · '}Còn lại: <strong>{formatNumber(contractor.assessment.remainingM)} m</strong>
                              </p>
                              <p>
                                KLTB:{' '}
                                <strong>{contractor.assessment.averagePerWorkdayM === null ? '—' : `${formatNumber(contractor.assessment.averagePerWorkdayM)} m/ngày`}</strong>
                              </p>
                              <p>
                                KLTB:{' '}
                                <strong>{contractor.assessment.averagePerWeekM === null ? '—' : `${formatNumber(contractor.assessment.averagePerWeekM)} m/tuần`}</strong>
                              </p>
                              <p>
                                KLTB:{' '}
                                <strong>{contractor.assessment.averagePerMonthM === null ? '—' : `${formatNumber(contractor.assessment.averagePerMonthM)} m/tháng`}</strong>
                              </p>
                            </div>
                            <div className="text-slate-700">
                              <p className="font-semibold">Đánh giá đến hạn {project.finishDate.split('-').reverse().join('/')}</p>
                              {contractor.assessment.status === 'complete' ? (
                                <p className="text-emerald-700">Đã hoàn thành khối lượng hợp đồng.</p>
                              ) : contractor.assessment.status === 'overdue' ? (
                                <p className="text-red-700">Đã quá hạn; cần cập nhật tiến độ và thời hạn.</p>
                              ) : contractor.assessment.requiredPerDayM !== null ? (
                                <>
                                  <p>
                                    KLTB cần đạt: <strong>{formatNumber(contractor.assessment.requiredPerDayM)} m/ngày</strong>
                                    {' · '}<strong>{formatNumber(contractor.assessment.requiredPerWeekM || 0)} m/tuần</strong>
                                    {' · '}<strong>{formatNumber(contractor.assessment.requiredPerMonthM || 0)} m/tháng</strong>
                                  </p>
                                  {contractor.assessment.status === 'behind_schedule' ? (
                                    <p className="font-semibold text-amber-800">
                                      Cần tăng thêm {formatNumber(contractor.assessment.additionalPerDayM || 0)} m/ngày.
                                    </p>
                                  ) : contractor.assessment.status === 'on_schedule' ? (
                                    <p className="font-semibold text-emerald-700">Tốc độ hiện tại đáp ứng tiến độ.</p>
                                  ) : (
                                    <p className="text-slate-500">Chưa có nhật ký để xác định tốc độ.</p>
                                  )}
                                </>
                              ) : (
                                <p className="text-slate-500">Chưa đủ dữ liệu để dự báo tiến độ.</p>
                              )}
                            </div>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                  {weeklyProgress && (
                    <details open={selectedProjectId === project.id} className="group mt-2 border-t border-slate-100 pt-2">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-slate-700 marker:hidden">
                        <span>Tăng trưởng sản lượng: tuần này và tuần trước</span>
                        <span className="text-indigo-700 group-open:hidden">Xem so sánh +</span>
                        <span className="text-indigo-700 group-not-open:hidden">Thu gọn −</span>
                      </summary>
                      <p className="mt-1 text-[9px] text-slate-500">
                        Tuần trước {previousWeekRange.start.split('-').reverse().join('/')}–{previousWeekRange.end.split('-').reverse().join('/')}
                        {' · '}Tuần này {thisWeekRange.start.split('-').reverse().join('/')}–{currentDate.split('-').reverse().join('/')}
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {[
                          {
                            label: 'Mương cáp',
                            unit: 'm',
                            previous: weeklyProgress.previous.trench,
                            current: weeklyProgress.current.trench,
                            max: maxWeeklyTrench,
                            color: 'bg-violet-600',
                          },
                          {
                            label: 'Hầm / hố ga',
                            unit: 'hầm',
                            previous: weeklyProgress.previous.chambers,
                            current: weeklyProgress.current.chambers,
                            max: maxWeeklyChambers,
                            color: 'bg-emerald-600',
                          },
                        ].map((metric) => {
                          const difference = metric.current - metric.previous;
                          return (
                            <div key={metric.label} className="rounded-lg bg-slate-50 p-2">
                              <div className="mb-1 flex items-center justify-between gap-2 text-[9px]">
                                <span className="font-semibold text-slate-700">{metric.label}</span>
                                <span className={`font-bold ${
                                  difference > 0
                                    ? 'text-emerald-700'
                                    : difference < 0
                                    ? 'text-rose-700'
                                    : 'text-slate-500'
                                }`}>
                                  {difference > 0 ? '+' : ''}{formatNumber(difference)} {metric.unit}
                                </span>
                              </div>
                              <div className="space-y-1">
                                {[
                                  { label: 'Trước', value: metric.previous, color: 'bg-slate-300' },
                                  { label: 'Này', value: metric.current, color: metric.color },
                                ].map((week) => (
                                  <div key={week.label} className="flex items-center gap-1.5 text-[9px]">
                                    <span className="w-7 shrink-0 text-slate-500">{week.label}</span>
                                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white">
                                      <div
                                        className={`h-full rounded-full ${week.color}`}
                                        style={{ width: `${Math.min((week.value / metric.max) * 100, 100)}%` }}
                                      />
                                    </div>
                                    <span className="w-14 shrink-0 text-right font-mono text-slate-700">
                                      {formatNumber(week.value)} {metric.unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">Chưa có dự án để hiển thị.</p>
        )}
        <p className="text-[10px] text-slate-500">
          Tiến độ tổng hợp mỗi dự án = trung bình tỷ lệ hoàn thành mương cáp và hầm / hố ga.
        </p>
      </section>

      {/* 6. Clean Printable / Screenshot Executive Card Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 text-slate-900 border border-slate-300 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-black text-lg text-slate-900 uppercase">
                  Phiếu Báo Cáo Tiến Độ Ngầm Hóa (Executive Summary)
                </h3>
                <p className="text-xs text-slate-500">
                  Ngày chốt số liệu: {currentDate} · Phạm vi: {selectedPlanTypeId === 'all' ? 'Tất cả loại kế hoạch' : selectedPlanTypeName}
                </p>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="text-slate-400 hover:text-slate-800 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block text-[10px]">Tổng Hợp Đồng:</span>
                  <strong className="text-sm font-mono text-slate-900">
                    {(totalContractValue / 1000000000).toFixed(2)} Tỷ
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Tiến Độ Mương:</span>
                  <strong className="text-sm font-mono text-blue-600">
                    {formatNumber(totalCompletedLengthM)}m ({overallLengthPercent}%)
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Hố Ga Hoàn Tất:</span>
                  <strong className="text-sm font-mono text-emerald-600">
                    {formatNumber(totalCompletedChambers)}/{formatNumber(totalTargetChambers)} ({overallChamberPercent}%)
                  </strong>
                </div>
              </div>

              <div className="space-y-2">
                <span className="font-bold text-slate-800 block text-xs">Bảng tổng hợp tiến độ các dự án:</span>
                <table className="w-full text-left border-collapse border border-slate-200 text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="p-2 border border-slate-200">Dự án</th>
                      <th className="p-2 border border-slate-200">Nhà thầu</th>
                      <th className="p-2 border border-slate-200 text-right">Mương (m)</th>
                      <th className="p-2 border border-slate-200 text-right">%</th>
                      <th className="p-2 border border-slate-200 text-right">Hố ga</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopedProjects.map((p) => {
                      const pct = p.totalLengthM > 0 ? Math.round((p.completedLengthM / p.totalLengthM) * 100) : 0;
                      return (
                        <tr key={p.id}>
                          <td className="p-2 border border-slate-200 font-bold">{p.name}</td>
                          <td className="p-2 border border-slate-200">{p.contractor}</td>
                          <td className="p-2 border border-slate-200 text-right font-mono">
                            {formatNumber(p.completedLengthM)}/{formatNumber(p.totalLengthM)}
                          </td>
                          <td className="p-2 border border-slate-200 text-right font-mono font-bold text-blue-600">
                            {pct}%
                          </td>
                          <td className="p-2 border border-slate-200 text-right font-mono">
                            {formatNumber(p.completedChambers)}/{formatNumber(p.totalChambers)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>In / Xuất PDF</span>
              </button>
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
