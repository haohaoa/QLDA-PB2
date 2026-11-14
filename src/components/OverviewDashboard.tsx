import React, { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
  TrendingUp,
  DollarSign,
  Layers,
  Bell,
  CheckCircle2,
  Filter,
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

function getSmoothSplinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

function getSmoothAreaPath(points: { x: number; y: number }[], baselineY: number): string {
  if (points.length === 0) return '';
  const spline = getSmoothSplinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${spline} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

const ContractorNames: React.FC<{ names: string[]; count: number; className?: string }> = ({ names, count, className }) => {
  const label = names.join(', ') || 'Chưa phân công';
  const staticNameRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useLayoutEffect(() => {
    const element = staticNameRef.current;
    if (!element) return;

    const measureOverflow = () => setIsOverflowing(element.scrollWidth > element.clientWidth + 1);
    measureOverflow();
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(measureOverflow);
    observer?.observe(element);
    window.addEventListener('resize', measureOverflow);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measureOverflow);
    };
  }, [label]);

  return (
    <div
      className={className || "contractor-name-group min-w-0 w-fit max-w-[min(36vw,220px)] px-2 text-[9px] font-semibold text-slate-600 sm:text-[10px]"}
      data-overflow={isOverflowing}
      title={`${count} nhà thầu: ${label}`}
      aria-label={`${count} nhà thầu: ${label}`}
    >
      <span ref={staticNameRef} className="contractor-name-static block max-w-full truncate">
        {label}
      </span>
      {isOverflowing && (
        <span className="contractor-name-marquee hidden overflow-hidden whitespace-nowrap">
          <span className="contractor-marquee-track flex w-max">
            <span className="pr-8">{label}</span>
            <span aria-hidden="true" className="pr-8">{label}</span>
          </span>
        </span>
      )}
    </div>
  );
};

interface OverviewDashboardProps {
  projects: UndergroundProject[];
  planTypes: PlanType[];
  dailyLogs: DailyLogEntry[];
  bulletins: SiteBulletin[];
  currentDate: string;
  onGoToMap: (projectId: string) => void;
  onGoToBulletins: (projectId?: string) => void;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  projects,
  planTypes,
  dailyLogs,
  bulletins,
  currentDate,
  onGoToMap,
  onGoToBulletins,
}) => {
  const [copiedZalo, setCopiedZalo] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [hoveredChartProjectId, setHoveredChartProjectId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [expandedDetailProjectId, setExpandedDetailProjectId] = useState<string | null>(null);
  const [selectedPlanTypeId, setSelectedPlanTypeId] = useState('all');
  const projectCardRefs = useRef(new Map<string, HTMLElement>());
  const shouldReduceMotion = useReducedMotion();

  const openProjectOverview = (projectId: string) => {
    setSelectedProjectId(projectId);
    setExpandedDetailProjectId(projectId);
    requestAnimationFrame(() => {
      projectCardRefs.current.get(projectId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  };

  const planTypeProjects = projects.filter(
    (project) =>
      selectedPlanTypeId === 'all' ||
      (project.planTypeId || 'plan-type-unclassified') === selectedPlanTypeId
  );
  const scopedProjects = planTypeProjects.filter(
    (project) => (project.status || 'in_progress') === 'in_progress'
  );
  const selectedPlanTypeName =
    planTypes.find((type) => type.id === selectedPlanTypeId)?.name || 'Chưa phân loại';
  const scopedProjectIds = new Set(scopedProjects.map((project) => project.id));
  const scopedBulletins = bulletins.filter(
    (bulletin) =>
      bulletin.projectId === 'all' || scopedProjectIds.has(bulletin.projectId)
  );
  const activeProjects = scopedProjects;
  const pausedProjectCount = planTypeProjects.filter((project) => project.status === 'paused').length;
  const completedProjectCount = planTypeProjects.filter((project) => project.status === 'completed').length;
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
  const chartHeight = 290 + extraLabelHeight;
  const chartMargin = { top: 32, right: 32, bottom: 64 + extraLabelHeight, left: 48 };
  const chartPlotWidth = projectChartWidth - chartMargin.left - chartMargin.right;
  const chartPlotHeight = chartHeight - chartMargin.top - chartMargin.bottom;
  const chartBaseline = chartMargin.top + chartPlotHeight;
  const projectChartPoints = projectChartData.map(({ overallPercent }, index) => ({
    x: chartMargin.left + chartPlotWidth * ((index + 0.5) / Math.max(projectChartData.length, 1)),
    y: chartBaseline - (Math.min(Math.max(overallPercent, 0), 100) / 100) * chartPlotHeight,
  }));
  const projectChartLine = getSmoothSplinePath(projectChartPoints);
  const projectChartArea = getSmoothAreaPath(projectChartPoints, chartBaseline);
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

    navigator.clipboard.writeText(text);
    setCopiedZalo(true);
    setTimeout(() => setCopiedZalo(false), 2500);
  };

  return (
    <div className="w-full min-w-0 space-y-3 overflow-x-clip pb-8 sm:space-y-6 sm:pb-12">
      {/* 1. Header Toolbar with Direct Fast Actions */}
      <div className="flex min-w-0 flex-col justify-between gap-2.5 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xs sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-blue-700">
              <Sparkles className="w-3 h-3 text-blue-600" />
              Tổng Quan Điều Hành
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {currentDate.split('-').reverse().join('/')}
            </span>
          </div>
          <h2 className="text-base font-black leading-tight tracking-tight text-slate-900 sm:text-2xl">
            Biểu Đồ Tiến Độ & Báo Cáo Điều Hành
          </h2>
          <p className="hidden sm:block text-xs text-slate-500 mt-1">
            Theo dõi tổng hợp khối lượng thi công mương cáp, hố ga và tiến độ toàn mạng lưới dự án.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {/* Plan Type Selector */}
          <div className="w-full sm:min-w-[15rem]">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Filter className="h-3.5 w-3.5" />
              </div>
              <select
                value={selectedPlanTypeId}
                onChange={(event) => {
                  setSelectedPlanTypeId(event.target.value);
                  setSelectedProjectId(null);
                }}
                aria-label="Lọc tổng quan theo loại kế hoạch"
                className="min-h-9 sm:min-h-10 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/90 pl-8.5 pr-8 py-1.5 sm:py-2 text-xs font-bold text-slate-800 shadow-2xs transition hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">Tất cả loại kế hoạch</option>
                {planTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                <ChevronDown className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>

          {/* Action buttons: Zalo & Export Image/Print */}
          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:items-center sm:gap-2">
            <button
              onClick={handleCopyZalo}
              className="inline-flex min-h-9 sm:min-h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 active:scale-[0.98]"
              title="Sao chép tóm tắt định dạng nhanh gửi Zalo các sếp"
            >
              {copiedZalo ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              <span>{copiedZalo ? 'Đã chép!' : 'Báo cáo Zalo'}</span>
            </button>

            <button
              onClick={() => setShowPrintModal(true)}
              className="inline-flex min-h-9 sm:min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98]"
              title="Xem & Chụp hình phiếu báo cáo lãnh đạo"
            >
              <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />
              <span>Chụp / In Phiếu</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Executive KPI Metric Row - 2x2 Mobile App Grid / 4 Desktop Columns */}
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        {/* Card 1: Tổng Giá Trị Hợp Đồng */}
        <div className="flex min-w-0 flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-2.5 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-sm sm:p-5">
          <div>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                Tổng Hợp Đồng
              </span>
              <span className="flex h-6 w-6 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-blue-50 text-blue-600">
                <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            </div>
            <div className="mt-1 sm:mt-2 flex items-baseline gap-1">
              <span className="font-mono text-lg font-black tracking-tight text-slate-900 sm:text-3xl">
                {(totalContractValue / 1_000_000_000).toFixed(2)}
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-slate-500">Tỷ VNĐ</span>
            </div>
          </div>

          <div className="mt-2 sm:mt-4 space-y-1.5 sm:space-y-2 border-t border-slate-100 pt-2 sm:pt-3">
            <div className="flex items-center justify-between text-[10px] sm:text-[11px]">
              <span className="text-slate-500 truncate">Quy mô tuyến</span>
              <span className="font-mono font-bold text-slate-700 shrink-0">
                {formatNumber(totalSystemLengthM)}m
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-500"
                style={{ width: `${Math.min(overallLengthPercent, 100)}%` }}
              />
            </div>
            <p className="text-[9px] sm:text-[10px] text-slate-400 truncate">
              {activeProjects.length} dự án đang thi công
            </p>
          </div>
        </div>

        {/* Card 2: Tiến Độ Tổng Hợp Toàn Tuyến */}
        <div className="flex min-w-0 flex-col justify-between rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 via-white to-blue-50/30 p-2.5 shadow-xs transition-all duration-200 hover:border-indigo-200 hover:shadow-sm sm:p-5">
          <div>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-indigo-900 truncate">
                Tiến Độ Chung
              </span>
              <span className="flex h-6 w-6 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-indigo-100/80 text-indigo-700">
                <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            </div>
            <div className="mt-1 sm:mt-2 flex items-baseline justify-between gap-1">
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-lg font-black tracking-tight text-indigo-950 sm:text-3xl">
                  {overallProgressPercent}%
                </span>
                <span className="hidden sm:inline text-xs font-semibold text-indigo-600">toàn phạm vi</span>
              </div>
              <span className="truncate rounded-full bg-indigo-100 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-indigo-800">
                {selectedPlanTypeId === 'all' ? 'Toàn bộ' : selectedPlanTypeName}
              </span>
            </div>
          </div>

          <div className="mt-2 sm:mt-4 space-y-1.5 sm:space-y-2.5 border-t border-indigo-100/80 pt-2 sm:pt-3">
            <div>
              <div className="flex items-center justify-between text-[10px] sm:text-[11px]">
                <span className="font-semibold text-blue-900">Cáp ({overallLengthPercent}%)</span>
                <span className="font-mono text-[9px] sm:text-[10px] text-slate-500">
                  {formatNumber(totalCompletedLengthM)}/{formatNumber(totalSystemLengthM)}m
                </span>
              </div>
              <div className="mt-0.5 sm:mt-1 h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${Math.min(overallLengthPercent, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] sm:text-[11px]">
                <span className="font-semibold text-emerald-900">Bể ({overallChamberPercent}%)</span>
                <span className="font-mono text-[9px] sm:text-[10px] text-slate-500">
                  {formatNumber(totalCompletedChambers)}/{formatNumber(totalTargetChambers)}
                </span>
              </div>
              <div className="mt-0.5 sm:mt-1 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${Math.min(overallChamberPercent, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Danh Mục Dự Án */}
        <div className="flex min-w-0 flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-2.5 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-sm sm:p-5">
          <div>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                Danh Mục DA
              </span>
              <span className="flex h-6 w-6 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-emerald-50 text-emerald-600">
                <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            </div>
            <div className="mt-1 sm:mt-2 flex items-baseline gap-1">
              <span className="font-mono text-lg font-black tracking-tight text-slate-900 sm:text-3xl">
                {scopedProjects.length}
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-slate-500">tuyến</span>
            </div>
          </div>

          <div className="mt-2 sm:mt-4 space-y-1.5 sm:space-y-2 border-t border-slate-100 pt-2 sm:pt-3">
            <div className="grid grid-cols-3 gap-1 text-center">
              <div className="rounded-lg bg-blue-50/80 p-1 sm:p-1.5">
                <span className="block text-[8px] sm:text-[9px] font-semibold text-blue-700">Làm</span>
                <strong className="font-mono text-[11px] sm:text-xs font-bold text-blue-900">{activeProjects.length}</strong>
              </div>
              <div className="rounded-lg bg-amber-50/80 p-1 sm:p-1.5">
                <span className="block text-[8px] sm:text-[9px] font-semibold text-amber-700">Ngưng</span>
                <strong className="font-mono text-[11px] sm:text-xs font-bold text-amber-900">{pausedProjectCount}</strong>
              </div>
              <div className="rounded-lg bg-emerald-50/80 p-1 sm:p-1.5">
                <span className="block text-[8px] sm:text-[9px] font-semibold text-emerald-700">Xong</span>
                <strong className="font-mono text-[11px] sm:text-xs font-bold text-emerald-900">{completedProjectCount}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Bảng Tin & Pháp Lý */}
        <div className="flex min-w-0 flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-2.5 shadow-xs transition-all duration-200 hover:border-slate-300 hover:shadow-sm sm:p-5">
          <div>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                Tin & Pháp Lý
              </span>
              <span className="flex h-6 w-6 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-amber-50 text-amber-600">
                <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
            </div>
            <div className="mt-1 sm:mt-2 flex items-baseline gap-1">
              <span className="font-mono text-lg font-black tracking-tight text-amber-600 sm:text-3xl">
                {scopedBulletins.filter((b) => b.isActive).length}
              </span>
              <span className="text-[10px] sm:text-xs font-bold text-slate-500">tin mới</span>
            </div>
          </div>

          <div className="mt-2 sm:mt-4 space-y-1.5 sm:space-y-2 border-t border-slate-100 pt-2 sm:pt-3">
            {scopedBulletins.filter((b) => b.isActive).length > 0 ? (
              <div className="rounded-lg bg-amber-50/90 p-1.5 sm:p-2 text-[9px] sm:text-[10px] text-amber-900 line-clamp-1 sm:line-clamp-2">
                <strong>Mới:</strong> {scopedBulletins.find((b) => b.isActive)?.title}
              </div>
            ) : (
              <div className="flex items-center gap-1 rounded-lg bg-emerald-50/80 px-2 py-1 text-[9px] sm:text-[10px] font-semibold text-emerald-800">
                <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                <span className="truncate">Hiện trường thông suốt</span>
              </div>
            )}
            <button
              onClick={() => onGoToBulletins()}
              className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-blue-600 transition hover:text-blue-800 hover:underline"
            >
              <span>Xem bảng tin</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      <section
        onMouseLeave={() => setHoveredChartProjectId(null)}
        className="min-w-0 space-y-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-5"
      >
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <BarChart3 className="h-5 w-5 text-indigo-600" />
              Biểu đồ tiến độ tổng hợp các dự án
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Cột đôi so sánh tỷ lệ hoàn thành Mương cáp & Hố ga; đường biểu diễn Tiến độ tổng hợp từng tuyến.
            </p>
          </div>

          {/* Interactive Legend in Header */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600 sm:gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-blue-600 shadow-2xs" />
              <span>Mương cáp</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-emerald-500 shadow-2xs" />
              <span>Hầm / hố ga</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-full bg-indigo-600 shadow-2xs" />
              <span>Tiến độ tổng hợp</span>
            </span>
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
              <defs>
                <linearGradient id="chartTrenchGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#1d4ed8" />
                </linearGradient>
                <linearGradient id="chartChamberGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#047857" />
                </linearGradient>
                <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.01" />
                </linearGradient>
                <filter id="chartPillShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#312e81" floodOpacity="0.25" />
                </filter>
              </defs>

              {/* Grid Lines */}
              {[0, 25, 50, 75, 100].map((tick) => {
                const y = chartBaseline - (tick / 100) * chartPlotHeight;
                return (
                  <g key={tick}>
                    <line
                      x1={chartMargin.left}
                      x2={projectChartWidth - chartMargin.right}
                      y1={y}
                      y2={y}
                      stroke="#f1f5f9"
                      strokeWidth={tick === 0 ? "1.5" : "1"}
                      strokeDasharray={tick === 0 ? undefined : '4 4'}
                    />
                    <text
                      x={chartMargin.left - 10}
                      y={y + 3.5}
                      textAnchor="end"
                      className="fill-slate-400 font-mono text-[9px] font-semibold"
                    >
                      {tick}%
                    </text>
                  </g>
                );
              })}

              {/* Project Columns (Backdrop, Bars & Labels) */}
              {projectChartData.map(({ project, trenchPercent, chamberPercent }, index) => {
                const groupCenter =
                  chartMargin.left + chartPlotWidth * ((index + 0.5) / projectChartData.length);
                const groupWidth = chartPlotWidth / projectChartData.length;
                const barWidth = Math.min(24, Math.max(16, groupWidth * 0.18));
                const barGap = 6;
                const trenchHeight = (Math.min(Math.max(trenchPercent, 0), 100) / 100) * chartPlotHeight;
                const chamberHeight = (Math.min(Math.max(chamberPercent, 0), 100) / 100) * chartPlotHeight;
                const labelLines = projectChartNameLines[index];
                const isHovered = hoveredChartProjectId === project.id;

                return (
                  <g
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Xem tổng quan dự án ${project.name}`}
                    className="group cursor-pointer outline-none"
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
                    {/* Hover column background */}
                    <rect
                      x={groupCenter - groupWidth / 2 + 4}
                      y={chartMargin.top - 8}
                      width={groupWidth - 8}
                      height={chartPlotHeight + chartMargin.bottom + 4}
                      rx="12"
                      fill={isHovered ? '#f8fafc' : 'transparent'}
                      stroke={isHovered ? '#e2e8f0' : 'transparent'}
                      className="transition-all duration-200"
                    />

                    {/* Trench Bar */}
                    <rect
                      x={groupCenter - barGap / 2 - barWidth}
                      y={chartBaseline - Math.max(trenchHeight, trenchPercent > 0 ? 4 : 4)}
                      width={barWidth}
                      height={Math.max(trenchHeight, trenchPercent > 0 ? 4 : 4)}
                      rx="4"
                      fill={trenchPercent > 0 ? "url(#chartTrenchGrad)" : "#e2e8f0"}
                      className="transition-[filter,opacity] duration-200 ease-out group-hover:brightness-110"
                    />

                    {/* Chamber Bar */}
                    <rect
                      x={groupCenter + barGap / 2}
                      y={chartBaseline - Math.max(chamberHeight, chamberPercent > 0 ? 4 : 4)}
                      width={barWidth}
                      height={Math.max(chamberHeight, chamberPercent > 0 ? 4 : 4)}
                      rx="4"
                      fill={chamberPercent > 0 ? "url(#chartChamberGrad)" : "#e2e8f0"}
                      className="transition-[filter,opacity] duration-200 ease-out group-hover:brightness-110"
                    />

                    {/* Project Code & Label Lines */}
                    <text x={groupCenter} y={chartBaseline + 16} textAnchor="middle">
                      <tspan
                        x={groupCenter}
                        dy="0"
                        className="font-mono text-[9px] font-bold"
                        fill={isHovered ? '#4f46e5' : '#94a3b8'}
                      >
                        {project.code}
                      </tspan>
                      {labelLines.map((line, lineIndex) => (
                        <tspan
                          key={`${project.id}-label-${lineIndex}`}
                          x={groupCenter}
                          dy={lineIndex === 0 ? 12 : 11}
                          className="text-[9px]"
                          fill={isHovered ? '#0f172a' : '#475569'}
                          fontWeight={isHovered ? '700' : '500'}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  </g>
                );
              })}

              {/* Area Fill under Spline */}
              {projectChartPoints.length > 1 && (
                <path d={projectChartArea} fill="url(#chartAreaGrad)" pointerEvents="none" />
              )}

              {/* Smooth Spline Curve */}
              {projectChartPoints.length > 1 && (
                <path
                  d={projectChartLine}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              )}

              {/* Interactive Trend Points & Percentage Badges */}
              {projectChartPoints.map((point, index) => {
                const project = projectChartData[index].project;
                const isHovered = hoveredChartProjectId === project.id;
                const badgeY = Math.max(8, point.y - 25);

                return (
                  <g
                    key={project.id}
                    onMouseEnter={() => setHoveredChartProjectId(project.id)}
                    onClick={() => openProjectOverview(project.id)}
                    className="cursor-pointer"
                  >
                    {/* Badge Pill Above Point */}
                    <rect
                      x={point.x - 17}
                      y={badgeY}
                      width={34}
                      height={18}
                      rx={9}
                      fill={isHovered ? '#312e81' : '#4f46e5'}
                      filter="url(#chartPillShadow)"
                      className="transition-all duration-200"
                    />
                    <text
                      x={point.x}
                      y={badgeY + 12}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="9.5"
                      fontWeight="800"
                      className="font-mono"
                    >
                      {projectChartData[index].overallPercent}%
                    </text>

                    {/* Point Circle on Line */}
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={isHovered ? 6 : 4.5}
                      fill="#4f46e5"
                      stroke="#ffffff"
                      strokeWidth="2.5"
                      className="origin-center transition-all duration-200"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
          </>
        ) : (
          <p className="py-8 text-center text-xs text-slate-500">Chưa có dự án phù hợp với loại kế hoạch đã chọn.</p>
        )}
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
              const contractorCount = project.contractors?.length
                || (project.contractor && project.contractor !== 'Chưa phân công'
                  ? project.contractor.split(',').filter((name) => name.trim()).length
                  : 0);
              const contractorNames = project.contractors?.length
                ? project.contractors.map((contractor) => contractor.name.trim()).filter(Boolean)
                : project.contractor && project.contractor !== 'Chưa phân công'
                ? project.contractor.split(',').map((name) => name.trim()).filter(Boolean)
                : [];
              const isDetailsOpen = expandedDetailProjectId === project.id;
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
                  className={`min-w-0 overflow-hidden rounded-2xl border bg-white p-3 shadow-sm transition-[border-color,box-shadow] duration-200 sm:p-4 ${
                    selectedProjectId === project.id
                      ? 'scroll-mt-24 border-blue-200 shadow-md'
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                  }`}
                >
                  {/* 1. Header Row: Code, Bulletin Dot, Map Action + Full-width Project Title */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700">
                          {project.code}
                        </span>
                        {projectBulletins.length > 0 && (
                          <span
                            className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-bold text-red-700 border border-red-200"
                            title={`${projectBulletins.length} thông báo hiện trường`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                            <span>{projectBulletins.length} tin</span>
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onGoToMap(project.id)}
                        aria-label={`Xem bản đồ tuyến ${project.name}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-teal-200/90 bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-800 transition-colors hover:border-teal-300 hover:bg-teal-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 sm:px-2.5 sm:text-[11px]"
                      >
                        <MapIcon className="h-3 w-3 text-teal-700 sm:h-3.5 sm:w-3.5" />
                        <span>Bản đồ</span>
                      </button>
                    </div>

                    <h4
                      title={project.name}
                      className="w-full break-words text-[13px] font-extrabold leading-snug text-slate-900 sm:text-base"
                    >
                      {project.name}
                    </h4>

                    {/* 2. Metadata Grid: Compact 2-col on mobile */}
                    <div className="grid min-w-0 grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-600 lg:grid-cols-3 sm:text-[11px]">
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-slate-400">Kỳ hạn:</span>
                        <span className="truncate font-medium text-slate-700">
                          {project.startDate.split('-').reverse().join('/')} – {project.finishDate.split('-').reverse().join('/')}
                        </span>
                      </div>
                      <div className="flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-slate-400">HĐ:</span>
                        <span className="font-mono font-bold text-slate-800">
                          {formatNumber(project.contractValueVND / 1_000_000_000, 2)} tỷ
                        </span>
                      </div>
                      <div className="col-span-2 flex min-w-0 items-center gap-1 lg:col-span-1">
                        <span className="shrink-0 text-slate-400">Nhà thầu:</span>
                        <ContractorNames
                          names={contractorNames}
                          count={contractorCount}
                          className="contractor-name-group min-w-0 flex-1 text-[10px] font-semibold text-slate-700 sm:text-[11px]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3. Unified Progress Section: Compact 3-col on mobile & desktop */}
                  <div className="mt-2.5 grid min-w-0 grid-cols-[72px_1fr_1fr] gap-1.5 sm:mt-3 sm:grid-cols-[105px_1fr_1fr] sm:gap-2.5">
                    {/* Overall Progress Gauge */}
                    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/60 to-slate-50 p-1.5 sm:p-2.5 text-center">
                      <div
                        className="grid h-10 w-10 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-full shadow-xs"
                        style={{
                          background: `conic-gradient(#4f46e5 ${Math.min(projectProgressPercent, 100)}%, #e2e8f0 0)`,
                        }}
                        role="img"
                        aria-label={`Tiến độ tổng hợp ${projectProgressPercent}%`}
                      >
                        <span className="grid h-7.5 w-7.5 sm:h-9 sm:w-9 place-items-center rounded-full bg-white font-mono text-[10px] font-black text-slate-900 sm:text-xs">
                          {projectProgressPercent}%
                        </span>
                      </div>
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-indigo-900 sm:text-[11px]">
                        Chung
                      </span>
                    </div>

                    {/* Trench Progress */}
                    <div className="flex min-w-0 flex-col justify-between rounded-xl border border-blue-100 bg-blue-50/60 p-2 sm:p-2.5">
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <span className="truncate text-[9px] font-bold uppercase tracking-wide text-blue-900 sm:text-[11px]">
                          Mương cáp
                        </span>
                        <span className="font-mono text-[11px] font-black text-blue-700 sm:text-sm">
                          {trenchPercent}%
                        </span>
                      </div>
                      <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-blue-100">
                        <motion.div
                          className="h-full rounded-full bg-blue-600"
                          initial={shouldReduceMotion ? false : { width: 0 }}
                          animate={{ width: `${Math.min(trenchPercent, 100)}%` }}
                          transition={{ duration: shouldReduceMotion ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                      <p className="truncate font-mono text-[9px] font-semibold text-blue-800 tabular-nums sm:text-[10px]">
                        {formatNumber(project.completedLengthM)}/{formatNumber(project.totalLengthM)}m
                      </p>
                    </div>

                    {/* Chamber Progress */}
                    <div className="flex min-w-0 flex-col justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 p-2 sm:p-2.5">
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <span className="truncate text-[9px] font-bold uppercase tracking-wide text-emerald-900 sm:text-[11px]">
                          Hố ga
                        </span>
                        <span className="font-mono text-[11px] font-black text-emerald-700 sm:text-sm">
                          {chamberPercent}%
                        </span>
                      </div>
                      <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-emerald-100">
                        <motion.div
                          className="h-full rounded-full bg-emerald-600"
                          initial={shouldReduceMotion ? false : { width: 0 }}
                          animate={{ width: `${Math.min(chamberPercent, 100)}%` }}
                          transition={{ duration: shouldReduceMotion ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                      <p className="truncate font-mono text-[9px] font-semibold text-emerald-800 tabular-nums sm:text-[10px]">
                        {formatNumber(project.completedChambers)}/{formatNumber(project.totalChambers)} bể
                      </p>
                    </div>
                  </div>

                  {/* 4. Streamlined Details Collapsible Button */}
                  <button
                    type="button"
                    aria-expanded={isDetailsOpen}
                    aria-controls={`project-details-${project.id}`}
                    onClick={() =>
                      setExpandedDetailProjectId(isDetailsOpen ? null : project.id)
                    }
                    className="mt-2.5 flex h-8 w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-left text-[11px] font-bold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100/80 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <span>{isDetailsOpen ? 'Thu gọn chi tiết tuyến' : 'Chi tiết tuyến'}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                        isDetailsOpen ? 'rotate-180 text-blue-600' : 'text-slate-400'
                      }`}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                  {isDetailsOpen && (
                    <motion.div
                      id={`project-details-${project.id}`}
                      initial={shouldReduceMotion ? false : { opacity: 0, height: 0, y: -6 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 }}
                      transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-700 sm:grid-cols-2 sm:p-4">
                        <p className="break-words"><strong>Chủ đầu tư:</strong> {project.investor}</p>
                        <p className="break-words"><strong>Nhà thầu:</strong> {project.contractors?.length ? project.contractors.map((contractor) => contractor.name).join(', ') : project.contractor}</p>
                        <p><strong>Thời gian:</strong> {project.startDate.split('-').reverse().join('/')} – {project.finishDate.split('-').reverse().join('/')}</p>
                        <p><strong>Giá trị hợp đồng:</strong> {formatNumber(project.contractValueVND / 1_000_000_000, 2)} tỷ VNĐ</p>
                        <p className="break-words sm:col-span-2"><strong>Vị trí hiện trường:</strong> {project.currentWorkLocation || 'Chưa cập nhật'}</p>
                        <p className="font-mono"><strong>Mương cáp:</strong> {formatNumber(project.completedLengthM)} / {formatNumber(project.totalLengthM)} m</p>
                        <p className="font-mono"><strong>Hầm / hố ga:</strong> {formatNumber(project.completedChambers)} / {formatNumber(project.totalChambers)} hầm</p>
                        <button
                          type="button"
                          onClick={() => onGoToMap(project.id)}
                          aria-label={`Xem bản đồ tuyến ${project.name}`}
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 font-bold text-teal-800 transition-colors hover:bg-teal-100 sm:col-span-2 sm:justify-self-start"
                        >
                          <MapIcon className="h-3.5 w-3.5" />
                          Xem bản đồ tuyến
                        </button>
                      </div>
                  {projectBulletins.length > 0 && (
                    <details open={isDetailsOpen} className="group mt-3 border-t border-slate-100 pt-2">
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
                          open={isDetailsOpen}
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
                    <details open={isDetailsOpen} className="group mt-2 border-t border-slate-100 pt-2">
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
                    </motion.div>
                  )}
                  </AnimatePresence>
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
