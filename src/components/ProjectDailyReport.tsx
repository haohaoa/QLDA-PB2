import React, { ChangeEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { UndergroundProject, DailyLogEntry, PlanType, SiteBulletin, ViolationReport } from '../types/undergrounding';
import {
  Calendar as CalendarIcon,
  Download,
  FileSpreadsheet,
  Upload,
  Copy,
  Check,
  PlusCircle,
  Building2,
  Edit3,
  Trash2,
  HardHat,
  CloudRain,
  AlertTriangle,
  Info,
  Layers,
  ArrowRight,
  Clock,
  Sparkles,
  FileWarning,
  Lock,
  ChevronDown,
  X,
  ExternalLink,
  Camera,
  ChevronLeft,
  ChevronRight,
  Eye,
  MapPin,
  Search,
} from 'lucide-react';
import { ViolationPhotoImage } from './ViolationPhotoImage';
import { generateZaloReportText } from '../utils/exportUtils';
import {
  downloadDailyLogExcelTemplate,
  downloadProjectHistoryTemplate,
  exportDailyLogsToExcel,
  exportProjectLogsByRange,
  importDailyLogsFromExcel,
  ImportedDailyLog,
} from '../utils/dailyLogExcel';
import { formatNumber } from '../utils/numberFormat';
import { getContractorKey, getDailyTrenchOutput, getLatestProgressLogs } from '../utils/progressUtils';
import { hasAssignedProjectContractor } from '../utils/projectContractors';
import { getViolationPhotoUrls } from '../utils/violationPhotos';
import { getDailyLogPhotoUrls } from '../utils/dailyLogPhotos';
import {
  buildScheduleWeeks,
  getCurrentDateKey,
  getScheduleBounds,
  isProjectActiveOnDate,
} from '../utils/scheduleUtils';

interface ProjectDailyReportProps {
  projects: UndergroundProject[];
  planTypes: PlanType[];
  dailyLogs: DailyLogEntry[];
  bulletins?: SiteBulletin[];
  selectedProjectId: string;
  onSelectProjectId: (projectId: string) => void;
  selectedContractorKey: string;
  onSelectContractorKey: (contractorKey: string) => void;
  showProjectPicker: boolean;
  onChooseProject: (projectId: string, contractorKey?: string) => void;
  onShowProjectPicker: () => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  isAdmin: boolean;
  onOpenSupervisorForm: (
    prefillDate?: string,
    prefillProjectId?: string,
    contractorName?: string
  ) => void;
  onEditLog: (log: DailyLogEntry) => void;
  onDeleteLog: (id: string) => Promise<void>;
  onImportDailyLogs: (
    logs: ImportedDailyLog[]
  ) => Promise<{ added: number; updated: number } | null>;
  onGoToBulletins?: (projectId?: string) => void;
  onOpenLogin?: () => void;
  initialViewMode?: 'daily' | 'weekly';
}

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

function getPreviousDateKey(dateKey: string, daysAgo: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day - daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function getStoppageReason(log: Pick<DailyLogEntry, 'resources' | 'stoppageReason'>): string {
  const resources = log.resources || '';
  const rawReason = log.stoppageReason?.trim() || '';
  const source = rawReason || resources;
  return source
    .replace(/^\s*(?:tạm\s+nghỉ|nghỉ(?:\s+(?:do|vì))?|dừng|ngưng)\s*[:：-]?\s*/i, '')
    .trim();
}

function getResourceDescription(log: Pick<DailyLogEntry, 'resources' | 'stoppageReason'>): string {
  const resources = log.resources || '';
  if (isStoppedLog(log)) {
    return `Nghỉ: ${getStoppageReason(log) || 'chưa ghi lý do'}`;
  }
  const stoppageReason = log.stoppageReason?.trim();
  if (stoppageReason && !resources.toLocaleLowerCase().includes(stoppageReason.toLocaleLowerCase())) {
    return resources ? `${resources} · ${stoppageReason}` : stoppageReason;
  }
  return resources || stoppageReason || 'Chưa ghi nguồn lực';
}

function isStoppedLog(log: Pick<DailyLogEntry, 'resources' | 'stoppageReason'>): boolean {
  return (
    !!log.stoppageReason?.trim() ||
    /nghỉ|tạm nghỉ|dừng|ngưng|không thi công/i.test(log.resources || '')
  );
}

function getDailyTeamCount(logs: DailyLogEntry[]): number {
  return logs.reduce((total, log) => {
    if (isStoppedLog(log)) return total;
    const teamMentions = [...(log.resources || '').matchAll(/(?:(\d+)\s*)?đội\b/gi)];
    return total + teamMentions.reduce((count, match) => count + (Number(match[1]) || 1), 0);
  }, 0);
}

const PROJECT_PICKER_PAGE_SIZE = 20;

export const ProjectDailyReport: React.FC<ProjectDailyReportProps> = ({
  projects: allProjects,
  planTypes,
  dailyLogs,
  bulletins = [],
  selectedProjectId: requestedProjectId,
  onSelectProjectId,
  selectedContractorKey,
  onSelectContractorKey,
  showProjectPicker,
  onChooseProject,
  onShowProjectPicker,
  selectedDate,
  onSelectDate,
  isAdmin,
  onOpenSupervisorForm,
  onEditLog,
  onDeleteLog,
  onImportDailyLogs,
  onGoToBulletins,
  onOpenLogin,
  initialViewMode = 'daily',
}) => {
  const projects = allProjects.filter((project) => (project.status || 'in_progress') === 'in_progress');
  const selectedProjectId =
    requestedProjectId === 'all' || projects.some((project) => project.id === requestedProjectId)
      ? requestedProjectId
      : 'all';
  const shouldReduceMotion = useReducedMotion();
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>(initialViewMode);
  const [copiedZalo, setCopiedZalo] = useState(false);
  const [selectedViolationDetail, setSelectedViolationDetail] = useState<ViolationReport | null>(null);
  const [expandedViolationPhoto, setExpandedViolationPhoto] = useState<string | null>(null);
  const [showProjectBulletins, setShowProjectBulletins] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(selectedDate.slice(0, 7));
  const [selectedWeekId, setSelectedWeekId] = useState('');
  const [excelStatus, setExcelStatus] = useState<string | null>(null);
  const [excelStatusIsError, setExcelStatusIsError] = useState(false);
  const [historyTemplateProjectId, setHistoryTemplateProjectId] = useState(
    selectedProjectId === 'all' ? '' : selectedProjectId
  );
  const [rangeProjectId, setRangeProjectId] = useState(
    selectedProjectId === 'all' ? '' : selectedProjectId
  );
  const [rangeContractorKey, setRangeContractorKey] = useState('all');
  const [rangeStartDate, setRangeStartDate] = useState(selectedDate);
  const [rangeEndDate, setRangeEndDate] = useState(selectedDate);
  const [rangeQuery, setRangeQuery] = useState<{
    projectId: string;
    contractorKey: string;
    startDate: string;
    endDate: string;
  } | null>(null);
  const [rangeQueryMessage, setRangeQueryMessage] = useState<string | null>(null);
  const [isExportingRange, setIsExportingRange] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectTypeFilter, setProjectTypeFilter] = useState('all');
  const [projectPickerPage, setProjectPickerPage] = useState(0);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!expandedViolationPhoto) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedViolationPhoto(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedViolationPhoto]);

  const TODAY_STR = getCurrentDateKey();

  useEffect(() => {
    setShowProjectBulletins(false);
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId !== 'all') setHistoryTemplateProjectId(selectedProjectId);
    if (selectedProjectId !== 'all') setRangeProjectId(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    setCalendarMonth(selectedDate.slice(0, 7));
  }, [selectedDate]);

  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const currentProjectHasAssignedContractor =
    !currentProject || hasAssignedProjectContractor(currentProject);
  const scheduleBounds = getScheduleBounds(projects, selectedProjectId);
  const scheduleProjects = selectedProjectId === 'all' ? projects : currentProject ? [currentProject] : [];
  const isDateInSchedule = (date: string) =>
    scheduleProjects.some((project) => isProjectActiveOnDate(project, date));
  const selectedDateIsInSchedule = isDateInSchedule(selectedDate);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const visibleProjects = projects.filter((project) => {
    const matchesType = projectTypeFilter === 'all' || project.planTypeId === projectTypeFilter ||
      (!project.planTypeId && projectTypeFilter === 'plan-type-unclassified');
    const searchText = `${project.name} ${project.code} ${project.contractor}`.toLocaleLowerCase();
    return matchesType && searchText.includes(projectSearch.trim().toLocaleLowerCase());
  });
  const projectPickerPageCount = Math.max(
    1,
    Math.ceil(visibleProjects.length / PROJECT_PICKER_PAGE_SIZE)
  );
  const currentProjectPickerPage = Math.min(projectPickerPage, projectPickerPageCount - 1);
  const pageProjects = visibleProjects.slice(
    currentProjectPickerPage * PROJECT_PICKER_PAGE_SIZE,
    (currentProjectPickerPage + 1) * PROJECT_PICKER_PAGE_SIZE
  );
  const contractorScopeProjects =
    selectedProjectId === 'all' ? projects : currentProject ? [currentProject] : [];
  const contractorNames = new Map<
    string,
    { name: string; projectIds: Set<string>; activeProjectIds: Set<string> }
  >();
  const addContractorOption = (projectId: string, name: string, isActive: boolean) => {
    const key = getContractorKey(name);
    const existing = contractorNames.get(key) || {
      name,
      projectIds: new Set<string>(),
      activeProjectIds: new Set<string>(),
    };
    existing.projectIds.add(projectId);
    if (isActive) existing.activeProjectIds.add(projectId);
    contractorNames.set(key, existing);
  };
  contractorScopeProjects.forEach((project) => {
    (project.contractors || []).forEach((contractor) => {
      addContractorOption(project.id, contractor.name, true);
    });
    dailyLogs
      .filter((log) => log.projectId === project.id)
      .forEach((log) =>
        addContractorOption(project.id, log.contractorName, !project.contractors?.length)
      );
    if (
      !project.contractors?.length &&
      hasAssignedProjectContractor(project) &&
      !dailyLogs.some((log) => log.projectId === project.id)
    ) {
      addContractorOption(project.id, project.contractor, true);
    }
  });
  const contractorOptions = [...contractorNames.entries()].map(([key, contractor]) => ({
    key,
    ...contractor,
  }));
  const rangeProject = projects.find((project) => project.id === rangeProjectId);
  const rangeContractorOptions = (() => {
    const contractors = new Map<string, string>();
    (rangeProject?.contractors || []).forEach((contractor) => {
      contractors.set(getContractorKey(contractor.name), contractor.name);
    });
    dailyLogs
      .filter((log) => log.projectId === rangeProjectId)
      .forEach((log) => contractors.set(getContractorKey(log.contractorName), log.contractorName));
    return [...contractors.entries()].map(([key, name]) => ({ key, name }));
  })();
  const rangeResultLogs = rangeQuery
    ? projects.some((project) => project.id === rangeQuery.projectId)
      ? dailyLogs
        .filter(
          (log) =>
            log.projectId === rangeQuery.projectId &&
            log.date >= rangeQuery.startDate &&
            log.date <= rangeQuery.endDate &&
            (rangeQuery.contractorKey === 'all' ||
              getContractorKey(log.contractorName) === rangeQuery.contractorKey)
        )
        .sort(
          (left, right) =>
            left.date.localeCompare(right.date) ||
            left.contractorName.localeCompare(right.contractorName, 'vi')
        )
      : []
    : [];
  const reportedContractorProjects = new Set(
    dailyLogs
      .filter(
        (log) =>
          log.date === selectedDate &&
          (selectedProjectId === 'all' || log.projectId === selectedProjectId)
      )
      .map((log) => `${log.projectId}:${getContractorKey(log.contractorName)}`)
  );
  const missingContractors = contractorOptions.flatMap((contractor) =>
    [...contractor.activeProjectIds]
      .filter((projectId) => {
        const project = projectById.get(projectId);
        return (
          !!project &&
          isProjectActiveOnDate(project, selectedDate) &&
          !reportedContractorProjects.has(`${projectId}:${contractor.key}`)
        );
      })
      .map((projectId) => ({ ...contractor, projectId }))
  );
  const selectedContractorName =
    contractorOptions.find((contractor) => contractor.key === selectedContractorKey)?.name;

  // Relevant active bulletins for current project or all
  const activeBulletinsForProject = bulletins.filter(
    (b) => b.isActive && (selectedProjectId === 'all' || b.projectId === selectedProjectId || b.projectId === 'all')
  );
  const currentWeekRange = getWeekRange(TODAY_STR);
  const previousWeekRange = getWeekRange(TODAY_STR, -1);
  const sumWeekOutput = (range: { start: string; end: string }) =>
    dailyLogs
      .filter((log) => {
        const project = projectById.get(log.projectId);
        return (
          (selectedProjectId === 'all' || log.projectId === selectedProjectId) &&
          log.date >= range.start &&
          log.date <= range.end &&
          !!project &&
          isProjectActiveOnDate(project, log.date)
        );
      })
      .filter((log) =>
        selectedContractorKey === 'all' ||
        getContractorKey(log.contractorName) === selectedContractorKey
      )
      .reduce(
        (totals, log) => ({
          trench: totals.trench + getDailyTrenchOutput(log),
          pipe: totals.pipe + (log.pipeLaidTodayM || 0),
          restored: totals.restored + (log.restoredTodayM || 0),
          chambers: totals.chambers + (log.chambersPouredToday || 0),
        }),
        { trench: 0, pipe: 0, restored: 0, chambers: 0 }
      );
  const thisWeekOutput = sumWeekOutput({
    start: currentWeekRange.start,
    end: currentWeekRange.end < TODAY_STR ? currentWeekRange.end : TODAY_STR,
  });
  const lastWeekOutput = sumWeekOutput(previousWeekRange);

  // Filter logs for the selected project, date, and contractor.
  const filteredLogs = dailyLogs
    .filter((log) => projectById.has(log.projectId))
    .filter((log) => (selectedProjectId === 'all' ? true : log.projectId === selectedProjectId))
    .filter((log) => log.date === selectedDate)
    .filter((log) =>
      selectedContractorKey === 'all' ||
      getContractorKey(log.contractorName) === selectedContractorKey
    );
  const progressSummaryLogs = getLatestProgressLogs(dailyLogs, selectedDate).filter(
    (log) => {
      const project = projectById.get(log.projectId);
      return (
        (selectedProjectId === 'all' || log.projectId === selectedProjectId) &&
        (selectedContractorKey === 'all' ||
          getContractorKey(log.contractorName) === selectedContractorKey) &&
        !!project &&
        log.date >= project.startDate &&
        log.date <= project.finishDate
      );
    }
  );

  // Team resources for selected date
  let trenchTeams = 0;
  let drillingTeams = 0;
  let stoppedTeams = 0;
  let violationsCountToday = 0;

  filteredLogs.forEach((log) => {
    if (log.violationReport?.hasViolation) {
      violationsCountToday += 1;
    }
    const res = (log.resources || '').toLocaleLowerCase();
    if (isStoppedLog(log)) {
      stoppedTeams += 1;
    } else {
      if (res.includes('đào')) {
        const match = res.match(/(\d+)\s*đội đào/);
        trenchTeams += match ? parseInt(match[1]) : 1;
      }
      if (res.includes('khoan')) {
        const match = res.match(/(\d+)\s*đội khoan/);
        drillingTeams += match ? parseInt(match[1]) : 1;
      }
    }
  });

  const totalActiveTeams = trenchTeams + drillingTeams;

  // Totals calculations
  const totalExcavation = filteredLogs.reduce((sum, r) => sum + (r.excavationTodayM || 0), 0);
  const totalChambersToday = filteredLogs.reduce((sum, r) => sum + (r.chambersPouredToday || 0), 0);
  const totalCumTrench = progressSummaryLogs.reduce((sum, r) => sum + (r.cumulativeTrenchM || 0), 0);
  const totalContractTrench = progressSummaryLogs.reduce((sum, r) => sum + (r.contractTrenchM || 0), 0);
  const trenchRate =
    totalContractTrench > 0 ? Math.round((totalCumTrench / totalContractTrench) * 100) : 0;
  const totalCumChambers = progressSummaryLogs.reduce((sum, r) => sum + (r.cumulativeChambers || 0), 0);
  const totalContractChambers = progressSummaryLogs.reduce((sum, r) => sum + (r.contractChambers || 0), 0);
  const selectedProjectContractor =
    currentProject?.contractors?.find(
      (contractor) => getContractorKey(contractor.name) === selectedContractorKey
    );
  const selectedProjectContractorLog = currentProject
    ? progressSummaryLogs.find((log) => log.projectId === currentProject.id)
    : undefined;
  const displayedLength = selectedContractorKey === 'all'
    ? currentProject?.completedLengthM || 0
    : selectedProjectContractorLog?.cumulativeTrenchM || 0;
  const displayedLengthTarget = selectedContractorKey === 'all'
    ? currentProject?.totalLengthM || 0
    : selectedProjectContractor?.totalLengthM ??
      selectedProjectContractorLog?.contractTrenchM ??
      currentProject?.totalLengthM ??
      0;
  const displayedChambers = selectedContractorKey === 'all'
    ? currentProject?.completedChambers || 0
    : selectedProjectContractorLog?.cumulativeChambers || 0;
  const displayedChambersTarget = selectedContractorKey === 'all'
    ? currentProject?.totalChambers || 0
    : selectedProjectContractor?.totalChambers ??
      selectedProjectContractorLog?.contractChambers ??
      currentProject?.totalChambers ??
      0;
  const displayedContractValue =
    selectedProjectContractor?.contractValueVND ?? currentProject?.contractValueVND ?? 0;

  // Check today unsubmitted projects
  const todayLogs = dailyLogs.filter((log) => {
    const project = projectById.get(log.projectId);
    return (
      log.date === TODAY_STR &&
      !!project &&
      isProjectActiveOnDate(project, TODAY_STR) &&
      (selectedContractorKey === 'all' ||
        getContractorKey(log.contractorName) === selectedContractorKey)
    );
  });
  const reportedProjectIdsToday = new Set(todayLogs.map((l) => l.projectId));
  const unsubmittedProjectsToday = projects.filter(
    (project) => {
      if (!isProjectActiveOnDate(project, TODAY_STR)) return false;
      const requiredContractors = (project.contractors || []).filter(
        (contractor) =>
          selectedContractorKey === 'all' ||
          getContractorKey(contractor.name) === selectedContractorKey
      );
      if (requiredContractors.length > 0) {
        return requiredContractors.some(
          (contractor) =>
            !todayLogs.some(
              (log) =>
                log.projectId === project.id &&
                getContractorKey(log.contractorName) === getContractorKey(contractor.name)
            )
        );
      }
      return !reportedProjectIdsToday.has(project.id);
    }
  );

  const handleCopyZalo = () => {
    const text = generateZaloReportText(
      filteredLogs,
      selectedDate,
      currentProject?.name || 'Toàn bộ dự án ngầm hóa',
      currentProject?.investor || 'FPT Telecom & Điện lực',
      progressSummaryLogs
    );
    navigator.clipboard.writeText(text);
    setCopiedZalo(true);
    setTimeout(() => setCopiedZalo(false), 2500);
  };

  const handleExport = async () => {
    try {
      await exportDailyLogsToExcel(
        filteredLogs,
        projects,
        `Bao_Cao_Ngay_${selectedDate.replace(/-/g, '_')}.xlsx`
      );
    } catch (error) {
      setExcelStatus(error instanceof Error ? error.message : 'Không thể tạo tệp Excel.');
      setExcelStatusIsError(true);
    }
  };

  const handleRangeQuery = () => {
    setRangeQueryMessage(null);
    if (!rangeProjectId) {
      setRangeQueryMessage('Vui lòng chọn tuyến/dự án.');
      setRangeQuery(null);
      return;
    }
    if (!rangeStartDate || !rangeEndDate) {
      setRangeQueryMessage('Vui lòng chọn ngày bắt đầu và ngày kết thúc.');
      setRangeQuery(null);
      return;
    }
    if (rangeStartDate > rangeEndDate) {
      setRangeQueryMessage('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      setRangeQuery(null);
      return;
    }
    setRangeQuery({
      projectId: rangeProjectId,
      contractorKey: rangeContractorKey,
      startDate: rangeStartDate,
      endDate: rangeEndDate,
    });
  };

  const handleExportRange = async () => {
    if (!rangeQuery || rangeResultLogs.length === 0) return;
    setIsExportingRange(true);
    setRangeQueryMessage(null);
    try {
      const result = await exportProjectLogsByRange(
        dailyLogs,
        projects,
        rangeQuery.projectId,
        rangeQuery.startDate,
        rangeQuery.endDate,
        rangeQuery.contractorKey
      );
      setRangeQueryMessage(
        `Đã tải xuống ${result.logCount} nhật ký và ${result.imageCount} liên kết ảnh.`
      );
    } catch (error) {
      setRangeQueryMessage(
        error instanceof Error ? error.message : 'Không thể tạo tệp Excel.'
      );
    } finally {
      setIsExportingRange(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadDailyLogExcelTemplate();
    } catch (error) {
      setExcelStatus(error instanceof Error ? error.message : 'Không thể tải mẫu Excel.');
      setExcelStatusIsError(true);
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setExcelStatus(null);
    setExcelStatusIsError(false);
    try {
      const importedLogs = await importDailyLogsFromExcel(file, projects);
      const result = await onImportDailyLogs(importedLogs);
      if (result) {
        setExcelStatus(`Đã nhập ${result.added} báo cáo mới và cập nhật ${result.updated} báo cáo.`);
      }
    } catch (error) {
      setExcelStatus(error instanceof Error ? error.message : 'Không thể đọc tệp Excel.');
      setExcelStatusIsError(true);
    } finally {
      event.target.value = '';
    }
  };

  const handleDownloadHistoryTemplate = async () => {
    const project = projects.find((item) => item.id === historyTemplateProjectId);
    if (!project) {
      setExcelStatus('Vui lòng chọn dự án cần cập nhật.');
      setExcelStatusIsError(true);
      return;
    }

    try {
      setExcelStatus(null);
      setExcelStatusIsError(false);
      await downloadProjectHistoryTemplate(project, dailyLogs, TODAY_STR);
    } catch (error) {
      setExcelStatus(error instanceof Error ? error.message : 'Không thể tạo mẫu Excel dự án.');
      setExcelStatusIsError(true);
    }
  };

  const handleImportHistoryFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!historyTemplateProjectId) {
      setExcelStatus('Vui lòng chọn dự án trước khi nhập Excel.');
      setExcelStatusIsError(true);
      event.target.value = '';
      return;
    }

    setExcelStatus(null);
    setExcelStatusIsError(false);
    try {
      const importedLogs = await importDailyLogsFromExcel(
        file,
        projects,
        historyTemplateProjectId,
        TODAY_STR
      );
      const result = await onImportDailyLogs(importedLogs);
      if (result) {
        setExcelStatus(`Đã thêm ${result.added} và cập nhật ${result.updated} nhật ký.`);
      }
    } catch (error) {
      setExcelStatus(error instanceof Error ? error.message : 'Không thể đọc tệp Excel.');
      setExcelStatusIsError(true);
    } finally {
      event.target.value = '';
    }
  };

  const handleActionRequiresAdmin = (actionFn: () => void) => {
    if (isAdmin) {
      actionFn();
    } else if (onOpenLogin) {
      onOpenLogin();
    }
  };

  const firstScheduleMonth = scheduleBounds?.startDate.slice(0, 7) || selectedDate.slice(0, 7);
  const lastScheduleMonth = scheduleBounds?.finishDate.slice(0, 7) || selectedDate.slice(0, 7);
  const visibleCalendarMonth =
    calendarMonth < firstScheduleMonth
      ? firstScheduleMonth
      : calendarMonth > lastScheduleMonth
      ? lastScheduleMonth
      : calendarMonth;
  const [calendarYear, calendarMonthNumber] = visibleCalendarMonth.split('-').map(Number);
  const calendarMonthLabel = new Intl.DateTimeFormat('vi-VN', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(calendarYear, calendarMonthNumber - 1, 1));
  const previousCalendarMonth = new Date(calendarYear, calendarMonthNumber - 2, 1);
  const nextCalendarMonth = new Date(calendarYear, calendarMonthNumber, 1);
  const previousCalendarMonthKey = `${previousCalendarMonth.getFullYear()}-${String(
    previousCalendarMonth.getMonth() + 1
  ).padStart(2, '0')}`;
  const nextCalendarMonthKey = `${nextCalendarMonth.getFullYear()}-${String(
    nextCalendarMonth.getMonth() + 1
  ).padStart(2, '0')}`;
  const daysInMonth = new Date(calendarYear, calendarMonthNumber, 0).getDate();
  const startDayOfWeek = new Date(calendarYear, calendarMonthNumber - 1, 1).getDay();
  const calendarCells: Array<{ day: number | null; dateStr: string | null }> = [];

  for (let i = 0; i < startDayOfWeek; i++) {
    calendarCells.push({ day: null, dateStr: null });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    const monthStr = calendarMonthNumber < 10 ? `0${calendarMonthNumber}` : `${calendarMonthNumber}`;
    calendarCells.push({ day, dateStr: `${calendarYear}-${monthStr}-${dayStr}` });
  }

  // Get status for each date on calendar
  const getDateStatus = (dateStr: string) => {
    const dayLogs = dailyLogs
      .filter((log) => projectById.has(log.projectId))
      .filter((l) => (selectedProjectId === 'all' ? true : l.projectId === selectedProjectId))
      .filter((l) => l.date === dateStr)
      .filter((log) =>
        selectedContractorKey === 'all' ||
        getContractorKey(log.contractorName) === selectedContractorKey
      );

    if (dayLogs.length === 0) return { status: 'none', label: 'Chưa có báo cáo', count: 0, hasViolation: false };

    const hasObstacle = dayLogs.some(
      (log) => `${log.resources || ''} ${log.stoppageReason || ''}`.toLocaleLowerCase().includes('vướng')
    );
    const hasStopped = dayLogs.some(isStoppedLog);
    const hasViolation = dayLogs.some((l) => l.violationReport?.hasViolation);
    const teamCount = getDailyTeamCount(dayLogs);
    const workingLogs = dayLogs.filter((log) => !isStoppedLog(log));
    const excavationMeters = workingLogs.reduce((total, log) => total + (log.excavationTodayM || 0), 0);
    const workMeters = workingLogs.reduce((total, log) => total + getDailyTrenchOutput(log), 0);
    const resourcesSummary = workingLogs
      .map((log) => log.resources?.trim())
      .filter(Boolean)
      .join('; ');
    const hasActiveWork =
      teamCount > 0 ||
      workMeters > 0 ||
      workingLogs.some(
        (log) => (log.chambersPouredToday || 0) > 0 || (log.restoredTodayM || 0) > 0
      );
    const stoppageDescriptions = [...new Set(
      dayLogs
        .filter(
          (log) =>
            isStoppedLog(log) ||
            `${log.resources || ''} ${log.stoppageReason || ''}`.toLocaleLowerCase().includes('vướng')
        )
        .map(getStoppageReason)
        .filter(Boolean)
    )];
    const reasonSummary = stoppageDescriptions.join('; ');

    if (hasActiveWork) {
      const workSummary = `${resourcesSummary || `${formatNumber(teamCount)} đội`} · Đào phui ${formatNumber(excavationMeters)} m/ngày`;
      return {
        status: 'working',
        workSummary,
        resourcesSummary: resourcesSummary || `${formatNumber(teamCount)} đội`,
        excavationSummary: `${formatNumber(excavationMeters)} m/ngày`,
        label: `Thi công: ${workSummary}${hasStopped || hasObstacle ? ` · Nghỉ: ${reasonSummary || 'chưa ghi lý do'}` : ''}`,
        count: dayLogs.length,
        hasViolation,
      };
    }
    return {
      status: 'off',
      label: `Nghỉ: ${reasonSummary || (hasObstacle ? 'vướng mặt bằng' : 'chưa ghi lý do')}`,
      count: dayLogs.length,
      hasViolation,
    };
  };

  const WEEKS_LIST = buildScheduleWeeks(scheduleBounds, TODAY_STR);
  const activeWeek =
    WEEKS_LIST.find((week) => week.id === selectedWeekId) ||
    WEEKS_LIST.find((week) => week.days.some((day) => day.date === selectedDate)) ||
    WEEKS_LIST.find((week) => week.isCurrent) ||
    WEEKS_LIST[0] || {
      id: '',
      name: 'Chưa có thời gian triển khai',
      shortLabel: '',
      isCurrent: false,
      days: [],
    };
  const activeWeekIndex = WEEKS_LIST.findIndex((week) => week.id === activeWeek.id);
  const previousWeek = activeWeekIndex > 0 ? WEEKS_LIST[activeWeekIndex - 1] : undefined;
  const nextWeek = activeWeekIndex >= 0 ? WEEKS_LIST[activeWeekIndex + 1] : undefined;
  const currentWeek = WEEKS_LIST.find((week) => week.isCurrent);
  const activeWeekLogs = dailyLogs.filter(
    (log) =>
      scheduleProjects.some((project) => project.id === log.projectId) &&
      activeWeek.days.some((day) => day.date === log.date) &&
      (selectedContractorKey === 'all' ||
        getContractorKey(log.contractorName) === selectedContractorKey)
  );

  const handleExportWeek = async () => {
    try {
      await exportDailyLogsToExcel(
        activeWeekLogs,
        projects,
        `Bao_Cao_Tuan_${activeWeek.days[0]?.date.replace(/-/g, '_') || 'du_lieu'}.xlsx`
      );
    } catch (error) {
      setExcelStatus(error instanceof Error ? error.message : 'Không thể tạo tệp Excel tuần.');
      setExcelStatusIsError(true);
    }
  };

  const isSelectedDateFuture = selectedDate > TODAY_STR;
  const selectCalendarDate = (date: string) => {
    onSelectDate(date);
    setCalendarMonth(date.slice(0, 7));
    window.requestAnimationFrame(() => {
      document.getElementById('daily-quantity-report')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };
  const todayLogsByProject = new Map<string, DailyLogEntry[]>();
  dailyLogs.forEach((log) => {
    if (log.date !== TODAY_STR) return;
    const projectLogs = todayLogsByProject.get(log.projectId) || [];
    projectLogs.push(log);
    todayLogsByProject.set(log.projectId, projectLogs);
  });

  if (showProjectPicker) {
    return (
      <div className="space-y-3 pb-6 sm:space-y-6 sm:pb-12">
        <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:rounded-3xl">
          <div className="bg-gradient-to-br from-slate-950 via-blue-950 to-blue-800 px-3.5 py-3 text-white sm:px-6 sm:py-5">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
                <div className="shrink-0 rounded-xl bg-white/10 p-2 ring-1 ring-white/15 sm:p-2.5">
                  <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-200 sm:text-[10px]">
                    Báo cáo thi công
                  </p>
                  <h2 className="truncate text-base font-black tracking-tight sm:text-2xl">
                    Chọn dự án cần xem
                  </h2>
                </div>
              </div>
              <div className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-blue-50 sm:px-3 sm:text-[11px]">
                <Building2 className="h-3.5 w-3.5" />
                <span>{visibleProjects.length}/{projects.length} dự án</span>
              </div>
            </div>
            <p className="mt-1.5 hidden max-w-2xl text-xs leading-relaxed text-blue-100 sm:block sm:text-sm">
              Chọn một dự án để xem báo cáo ngày, lịch thi công và tiến độ cập nhật.
            </p>
          </div>

          <div className="grid gap-2 border-b border-slate-100 p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.6fr)] sm:p-4">
            <label className="relative block min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 sm:h-4 sm:w-4" />
              <input
                type="search"
                value={projectSearch}
                onChange={(event) => {
                  setProjectSearch(event.target.value);
                  setProjectPickerPage(0);
                }}
                placeholder="Tìm tên dự án, mã hoặc nhà thầu..."
                aria-label="Tìm dự án"
                className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-8.5 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:py-2.5 sm:pl-9 sm:text-sm"
              />
            </label>
            <label className="block min-w-0">
              <span className="sr-only">Lọc theo loại kế hoạch</span>
              <select
                value={projectTypeFilter}
                onChange={(event) => {
                  setProjectTypeFilter(event.target.value);
                  setProjectPickerPage(0);
                }}
                aria-label="Lọc theo loại kế hoạch"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:py-2.5 sm:text-sm"
              >
                <option value="all">Tất cả loại kế hoạch</option>
                {planTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </label>
          </div>

          {projects.length > 0 ? (
            <div className="p-2.5 sm:p-5">
              <div className="space-y-2.5 sm:space-y-3">
              {pageProjects.map((project, projectIndex) => {
                const progress = project.totalLengthM > 0
                  ? Math.min(100, Math.round((project.completedLengthM / project.totalLengthM) * 100))
                  : 0;
                const todayProjectLogs = todayLogsByProject.get(project.id) || [];
                const todayReportCount = project.contractors?.length
                  ? project.contractors.filter((contractor) =>
                      todayProjectLogs.some(
                        (log) =>
                          getContractorKey(log.contractorName) === getContractorKey(contractor.name)
                      )
                    ).length
                  : todayProjectLogs.length;
                const expectedReportCount = project.contractors?.length || 1;
                const allContractorsReported = todayReportCount >= expectedReportCount;
                const hasAssignedContractor = hasAssignedProjectContractor(project);
                const projectIsActive = isProjectActiveOnDate(project, TODAY_STR);
                const hasContractors = !!project.contractors?.length;
                const isProjectExpanded = expandedProjectId === project.id;
                const recentReportStatuses = Array.from({ length: 5 }, (_, offset) => {
                  const date = getPreviousDateKey(TODAY_STR, offset);
                  if (!isProjectActiveOnDate(project, date)) return null;

                  const dateLogs = dailyLogs.filter(
                    (log) => log.projectId === project.id && log.date === date
                  );
                  const missingContractors = (project.contractors || []).filter(
                    (contractor) =>
                      !dateLogs.some(
                        (log) =>
                          getContractorKey(log.contractorName) === getContractorKey(contractor.name)
                      )
                  );
                  const reportedCount = project.contractors?.length
                    ? project.contractors.length - missingContractors.length
                    : Math.min(dateLogs.length, 1);
                  return {
                    date,
                    reportedCount,
                    expectedCount: expectedReportCount,
                    missingCount: Math.max(0, expectedReportCount - reportedCount),
                    missingContractorKey: missingContractors[0]
                      ? getContractorKey(missingContractors[0].name)
                      : undefined,
                    missingContractorNames: missingContractors.map((contractor) => contractor.name),
                    isToday: offset === 0,
                  };
                }).filter((status): status is NonNullable<typeof status> => status !== null);
                const missingRecentDates = recentReportStatuses.filter((status) => status.missingCount > 0);

                return (
                  <motion.article
                    key={project.id}
                    layout={!shouldReduceMotion}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: shouldReduceMotion ? 0 : 0.2,
                      delay: shouldReduceMotion ? 0 : Math.min(projectIndex * 0.025, 0.15),
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className={`min-w-0 overflow-hidden rounded-xl border bg-white shadow-xs transition-all duration-200 motion-reduce:transform-none hover:-translate-y-0.5 hover:shadow-md sm:rounded-2xl ${
                      missingRecentDates.length > 0
                        ? 'border-rose-200/90'
                        : 'border-slate-200/90'
                    }`}
                  >
                  <button
                    type="button"
                    aria-expanded={hasContractors ? isProjectExpanded : undefined}
                    onClick={() => {
                      if (hasContractors) {
                        setExpandedProjectId(isProjectExpanded ? null : project.id);
                      } else {
                        onChooseProject(project.id);
                      }
                    }}
                    className="group flex w-full min-w-0 flex-col items-stretch gap-2 p-3 text-left transition-colors duration-200 hover:bg-slate-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:gap-2.5 sm:p-4"
                  >
                    {/* Top Row: Badges on left, Status & Action Arrow on right */}
                    <div className="flex w-full min-w-0 items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white sm:h-7 sm:w-7">
                          <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </span>
                        {project.code && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-700 sm:text-[10px]">
                            {project.code}
                          </span>
                        )}
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-700 sm:text-[10px]">
                          {planTypes.find((type) => type.id === project.planTypeId)?.name || 'Chưa phân loại'}
                        </span>
                      </div>

                      {/* Status Badges & Action Arrow */}
                      <div className="flex shrink-0 items-center gap-1">
                        {projectIsActive ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-bold sm:text-[10px] ${
                              allContractorsReported
                                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border border-rose-200 bg-rose-50 text-rose-700'
                            }`}
                          >
                            <span className="sm:hidden">
                              {allContractorsReported
                                ? `Đủ (${todayReportCount}/${expectedReportCount})`
                                : `Thiếu (${todayReportCount}/${expectedReportCount})`}
                            </span>
                            <span className="hidden sm:inline">
                              {allContractorsReported
                                ? `Hôm nay: Đã đủ (${todayReportCount}/${expectedReportCount})`
                                : `Hôm nay: Chưa đủ (${todayReportCount}/${expectedReportCount})`}
                            </span>
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-500">
                            Ngoài kỳ
                          </span>
                        )}

                        {hasContractors ? (
                          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isProjectExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                        ) : (
                          <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-blue-600" />
                        )}
                      </div>
                    </div>

                    {/* Full-Width Project Name Row - Always 100% readable on mobile */}
                    <h3 className="w-full break-words text-[13px] font-extrabold leading-snug text-slate-900 group-hover:text-blue-700 sm:text-base">
                      {project.name}
                    </h3>

                    {/* Middle Row: Contractor & Progress metrics */}
                    <div className="grid w-full min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-12 sm:items-center sm:gap-4">
                      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-600 sm:col-span-6 sm:text-xs">
                        <MapPin className="h-3 w-3 shrink-0 text-slate-400 sm:h-3.5 sm:w-3.5" />
                        <span className="truncate font-medium">
                          {project.contractors?.length
                            ? project.contractors.map((contractor) => contractor.name).join(', ')
                            : hasAssignedContractor
                            ? project.contractor
                            : 'Chưa phân công nhà thầu'}
                        </span>
                      </div>

                      <div className="min-w-0 sm:col-span-6">
                        <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
                          <span className="font-semibold text-slate-500">Tiến độ tuyến</span>
                          <span className="font-mono font-bold text-slate-800">
                            {formatNumber(project.completedLengthM)} / {formatNumber(project.totalLengthM)} m ({progress}%)
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-600 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>

                  {projectIsActive && (
                    <div className={`border-t px-3 py-1.5 sm:px-4 sm:py-2 ${
                      missingRecentDates.length > 0
                        ? 'border-rose-100 bg-rose-50/40'
                        : 'border-slate-100 bg-emerald-50/30'
                    }`}>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="mr-0.5 text-[9px] font-bold text-slate-500 sm:text-[10px]">
                          Chưa BC:
                        </span>
                        {missingRecentDates.length > 0 ? (
                          missingRecentDates.map((status) => (
                            <button
                              key={status.date}
                              type="button"
                              onClick={() => {
                                onSelectDate(status.date);
                                onChooseProject(project.id, status.missingContractorKey);
                              }}
                              className="inline-flex min-h-6 items-center gap-1 rounded-full border border-rose-200/90 bg-white px-2 py-0.5 text-[9px] font-bold text-rose-800 shadow-2xs transition hover:border-rose-300 hover:bg-rose-50 active:scale-95 sm:min-h-7 sm:px-2.5 sm:text-[10px]"
                              title={`Mở báo cáo ngày ${status.date.split('-').reverse().join('/')} · ${status.missingContractorNames.length ? `chưa báo cáo: ${status.missingContractorNames.join(', ')}` : 'chưa có báo cáo cho tuyến này'}`}
                              aria-label={`Mở báo cáo ngày ${status.date.split('-').reverse().join('/')} cho ${status.missingContractorNames[0] || 'tuyến này'}`}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              <span>
                                {status.isToday
                                  ? `Hôm nay (${status.reportedCount}/${status.expectedCount})`
                                  : `${status.date.slice(8)}/${status.date.slice(5, 7)} (-${status.missingCount})`}
                              </span>
                            </button>
                          ))
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/70 px-2 py-0.5 text-[9px] font-bold text-emerald-800 sm:text-[10px]">
                            <Check className="h-2.5 w-2.5 text-emerald-600 sm:h-3 sm:w-3" />
                            <span>Đủ {recentReportStatuses.length} ngày gần nhất</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <AnimatePresence initial={false}>
                  {hasContractors && isProjectExpanded && (
                    <motion.div
                      initial={shouldReduceMotion ? false : { opacity: 0, height: 0, y: -6 }}
                      animate={{ opacity: 1, height: 'auto', y: 0 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 }}
                      transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-1.5 overflow-hidden border-t border-blue-100 bg-blue-50/50 p-2.5 sm:space-y-2 sm:p-3"
                    >
                      <p className="px-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">
                        Chọn nhà thầu để xem báo cáo ({project.name})
                      </p>
                      {project.contractors!.map((contractor) => {
                        const contractorKey = getContractorKey(contractor.name);
                        const contractorRecentMissingDates = recentReportStatuses.filter((status) =>
                          !dailyLogs.some(
                            (log) =>
                              log.projectId === project.id &&
                              log.date === status.date &&
                              getContractorKey(log.contractorName) === contractorKey
                          )
                        );
                        const hasReported = !contractorRecentMissingDates.some((status) => status.isToday);
                        const startName = project.points.find(
                          (point) => point.id === contractor.startPointId
                        )?.name;
                        const endName = project.points.find(
                          (point) => point.id === contractor.endPointId
                        )?.name;
                        return (
                          <button
                            key={contractor.id}
                            type="button"
                            onClick={() => {
                              onChooseProject(project.id, contractorKey);
                            }}
                            className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 text-left transition-[transform,border-color,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 motion-reduce:transform-none sm:gap-3 sm:p-2.5"
                          >
                            <span className="flex min-w-0 flex-1 items-start gap-2">
                              <span
                                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: contractor.color }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block break-words text-[11px] font-bold leading-snug text-slate-900 sm:text-xs">
                                  {contractor.name}
                                </span>
                                <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                                  {startName && endName ? `${startName} → ${endName} · ` : ''}
                                  {formatNumber(contractor.totalLengthM)} m · {formatNumber(contractor.totalChambers)} hố ga
                                </span>
                              </span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-0.5">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                  hasReported
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-rose-100 text-rose-700'
                                }`}
                              >
                                {hasReported ? 'Đã BC' : 'Chưa BC'}
                              </span>
                              {contractorRecentMissingDates.length > 0 && (
                                <span className="max-w-28 text-right text-[8px] leading-tight text-rose-700 sm:max-w-36 sm:text-[9px]">
                                  Thiếu: {contractorRecentMissingDates.map((status) =>
                                    status.isToday ? 'hôm nay' : `${status.date.slice(8)}/${status.date.slice(5, 7)}`
                                  ).join(', ')}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                  </AnimatePresence>
                  </motion.article>
                );
              })}
              {visibleProjects.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-slate-500 sm:text-sm">
                  Không tìm thấy dự án phù hợp.
                </div>
              )}
              </div>
              <div className="flex flex-col gap-2 pt-3 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:text-xs">
                <span>
                  {visibleProjects.length
                    ? `Hiển thị ${currentProjectPickerPage * PROJECT_PICKER_PAGE_SIZE + 1}–${Math.min(
                        (currentProjectPickerPage + 1) * PROJECT_PICKER_PAGE_SIZE,
                        visibleProjects.length
                      )} / ${visibleProjects.length} dự án`
                    : '0 dự án'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setProjectPickerPage((page) => Math.max(0, page - 1))}
                    disabled={currentProjectPickerPage === 0}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-1.5"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Trước
                  </button>
                  <span className="min-w-14 text-center font-semibold text-slate-600">
                    {currentProjectPickerPage + 1} / {projectPickerPageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setProjectPickerPage((page) => Math.min(projectPickerPageCount - 1, page + 1))
                    }
                    disabled={currentProjectPickerPage >= projectPickerPageCount - 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-1.5"
                  >
                    Tiếp
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <Building2 className="mx-auto h-9 w-9 text-slate-300" />
              <h3 className="mt-2.5 text-sm font-bold text-slate-800">Chưa có dự án nào</h3>
              <p className="mt-1 text-xs text-slate-500">Tạo dự án trước để bắt đầu theo dõi báo cáo ngày.</p>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-8 sm:space-y-5 sm:pb-12">
      {/* 1. Prominent Active Project Header & Mobile-App Control Card */}
      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xs sm:rounded-2xl">
        {/* Top Project Identity Banner - Always visible first on mobile & desktop */}
        {currentProject ? (
          <div className="border-b border-slate-200/80">
            <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-blue-900 px-3.5 py-3 text-white sm:px-5 sm:py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onShowProjectPicker}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-white/20 sm:px-2.5 sm:text-xs"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Đổi dự án</span>
                  </button>
                  <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-200">
                    {currentProject.code}
                  </span>
                  <span className="rounded-full bg-blue-500/25 px-2 py-0.5 text-[10px] font-semibold text-blue-100">
                    {planTypes.find((type) => type.id === currentProject.planTypeId)?.name || 'Chưa phân loại'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-bold text-emerald-300 sm:text-xs">
                    {displayedLengthTarget > 0
                      ? Math.round((displayedLength / displayedLengthTarget) * 100)
                      : 0}% hoàn thành
                  </span>
                  <button
                    type="button"
                    aria-expanded={showProjectBulletins}
                    onClick={() => setShowProjectBulletins((shown) => !shown)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-bold transition hover:bg-white/20 sm:text-xs"
                  >
                    <AlertTriangle className="h-3 w-3 text-amber-300 sm:h-3.5 sm:w-3.5" />
                    <span>TB ({activeBulletinsForProject.length})</span>
                    <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${showProjectBulletins ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              <h2 className="mt-2 break-words text-sm font-black leading-snug tracking-tight text-white sm:text-xl">
                {currentProject.name}
              </h2>

              {selectedContractorName && (
                <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-200 sm:text-xs">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                  <span className="break-words">Nhà thầu: {selectedContractorName}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-slate-50/70 p-2.5 sm:grid-cols-4 sm:gap-2.5 sm:p-4">
              {[
                { label: 'Hợp đồng', value: `${formatNumber(displayedContractValue / 1_000_000_000, 2)} tỷ` },
                { label: selectedContractorName ? 'Đoạn nhà thầu' : 'Chiều dài tuyến', value: `${formatNumber(displayedLength)}/${formatNumber(displayedLengthTarget)} m` },
                { label: 'Hầm / hố ga', value: `${formatNumber(displayedChambers)}/${formatNumber(displayedChambersTarget)} hầm` },
                { label: 'Thời gian', value: `${currentProject.startDate.split('-').reverse().join('/')}–${currentProject.finishDate.split('-').reverse().join('/')}` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 sm:rounded-xl sm:p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 sm:text-[10px]">{item.label}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] font-bold text-slate-900 sm:text-sm" title={item.value}>{item.value}</p>
                </div>
              ))}
              <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-[10px] sm:col-span-4 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs">
                <span className="text-slate-600">
                  <strong className="text-slate-500">CĐT:</strong> {currentProject.investor}
                </span>
                <span className="text-slate-300">•</span>
                <div className="flex flex-wrap items-center gap-1">
                  <strong className="text-slate-500">Nhà thầu:</strong>
                  {currentProject.contractors?.length ? currentProject.contractors.map((contractor) => (
                    <span key={contractor.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-semibold text-slate-800 sm:text-[10px]">
                      <i className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: contractor.color }} />
                      <span>{contractor.name}</span>
                    </span>
                  )) : (
                    <span className="font-semibold text-slate-700">{currentProject.contractor}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-slate-950 via-blue-950 to-blue-900 px-3.5 py-2.5 text-white sm:px-5 sm:py-3.5">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider text-blue-300 sm:text-[10px]">
                Phạm vi báo cáo đang xem
              </p>
              <h2 className="text-sm font-black tracking-tight text-white sm:text-lg">
                ★ Tất cả dự án ngầm hóa ({projects.length} dự án)
              </h2>
            </div>
            <button
              type="button"
              onClick={onShowProjectPicker}
              className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/20 sm:text-xs"
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Danh sách dự án</span>
            </button>
          </div>
        )}

        <div className="space-y-3 p-3 sm:space-y-4 sm:p-5">
          <div className="grid min-w-0 gap-2.5 sm:gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
            <div className="min-w-0">
              <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-500 sm:text-[11px]">
                Chọn nhanh dự án
              </label>
              <select
                value={selectedProjectId}
                onChange={(e) => onSelectProjectId(e.target.value)}
                aria-label="Dự án"
                className="min-h-9 w-full min-w-0 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-900 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-blue-600 sm:min-h-10 sm:rounded-xl sm:px-3.5 sm:py-2 sm:text-sm"
              >
                <option value="all">★ Tất Cả Dự Án Ngầm ({projects.length} Dự Án)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code ? `[${p.code}] ` : ''}{p.name} ({formatNumber(p.totalLengthM)}m)
                  </option>
                ))}
              </select>
            </div>
            {contractorOptions.length > 0 && (
              <div className="min-w-0">
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-500 sm:text-[11px]">
                  Nhà thầu cần xem / báo cáo
                </label>
                <select
                  value={selectedContractorKey}
                  onChange={(event) => onSelectContractorKey(event.target.value)}
                  aria-label="Lọc báo cáo theo nhà thầu"
                  className="min-h-9 w-full min-w-0 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 sm:min-h-10 sm:rounded-xl sm:px-3 sm:py-2"
                >
                  <option value="all">Tất cả nhà thầu</option>
                  {contractorOptions.map((contractor) => {
                    const isMissing = missingContractors.some((item) => item.key === contractor.key);
                    return (
                      <option key={contractor.key} value={contractor.key}>
                        {isMissing
                          ? '⚠ Chưa báo cáo · '
                          : contractor.activeProjectIds.size === 0
                          ? 'Lịch sử · '
                          : '✓ Đã báo cáo · '}
                        {contractor.name}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* View Mode Toggle: Báo cáo ngày vs Danh sách tuần */}
            <div className="min-w-0 xl:min-w-[210px]">
              <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-slate-500 sm:text-[11px]">
                Chế độ xem
              </label>
              <div className="grid w-full grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-0.5 sm:rounded-xl sm:p-1">
                <button
                  onClick={() => setViewMode('daily')}
                  className={`min-w-0 rounded-md px-2 py-1.5 text-[11px] font-bold transition-all sm:rounded-lg sm:px-3 sm:text-xs ${
                    viewMode === 'daily'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ngày & tháng
                </button>
                <button
                  onClick={() => setViewMode('weekly')}
                  className={`flex min-w-0 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition-all sm:rounded-lg sm:px-3 sm:text-xs ${
                    viewMode === 'weekly'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CalendarIcon className="hidden h-3.5 w-3.5 sm:block" />
                  <span>So sánh tuần</span>
                </button>
              </div>
            </div>
          </div>

          {missingContractors.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 sm:p-3.5">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
                <p className="text-[11px] font-bold text-rose-800 sm:text-xs">
                  {missingContractors.length} lượt nhà thầu chưa báo cáo ngày {selectedDate.split('-').reverse().join('/')}
                </p>
                <span className="text-[9px] text-rose-700 sm:text-[10px]">Chạm để nhập nhật ký</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {missingContractors.map((contractor) => {
                  const contractorProj = projectById.get(contractor.projectId);
                  return (
                    <button
                      key={`${contractor.projectId}:${contractor.key}`}
                      type="button"
                      onClick={() => {
                        onSelectContractorKey(contractor.key);
                        if (isAdmin) {
                          onOpenSupervisorForm(selectedDate, contractor.projectId, contractor.name);
                        } else {
                          onOpenLogin?.();
                        }
                      }}
                      className="rounded-lg border border-rose-300 bg-white px-2 py-1 text-left text-[10px] font-bold text-rose-800 hover:bg-rose-100 sm:px-2.5 sm:py-1.5 sm:text-[11px]"
                    >
                      ⚠ {contractor.name}
                      {selectedProjectId === 'all' && contractorProj ? (
                        <span className="ml-1 font-normal text-rose-600">
                          ({contractorProj.code || contractorProj.name})
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action buttons with Admin separation & Future Date restriction */}
          <div className="flex w-full flex-col gap-2 border-t border-slate-100 pt-2.5 sm:flex-row sm:items-center sm:justify-between sm:pt-3.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {currentProject && !currentProjectHasAssignedContractor && (
                <div
                  role="status"
                  className="flex w-full items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 sm:text-xs"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>Chưa phân công nhà thầu.</strong> Vui lòng phân công trong Quản lý dự án trước khi báo cáo.
                  </span>
                </div>
              )}
              {!selectedDateIsInSchedule ? (
                <div className="flex min-h-9 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-center text-xs font-bold text-slate-500 sm:min-h-10 sm:w-auto">
                  {currentProject && selectedDate < currentProject.startDate
                    ? 'Dự án chưa bắt đầu'
                    : currentProject && selectedDate > currentProject.finishDate
                    ? 'Dự án đã kết thúc'
                    : 'Ngày ngoài kỳ triển khai'}
                </div>
              ) : !currentProjectHasAssignedContractor ? null : isSelectedDateFuture ? (
                <div
                  className="flex min-h-9 w-full cursor-not-allowed select-none items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-center text-xs font-bold text-slate-400 sm:min-h-10 sm:w-auto"
                  title="Ngày này chưa đến thời điểm thi công, nút cập nhật báo cáo bị ẩn"
                >
                  Chưa Đến Ngày ({selectedDate.split('-').reverse().join('/')})
                </div>
              ) : isAdmin ? (
                <button
                  onClick={() =>
                    onOpenSupervisorForm(
                      selectedDate,
                      selectedProjectId !== 'all' ? selectedProjectId : undefined,
                      selectedContractorName
                    )
                  }
                  className="flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-all hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] sm:w-auto"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Cập nhật báo cáo</span>
                </button>
              ) : (
                <button
                  onClick={onOpenLogin}
                  className="flex min-h-10 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-200 sm:w-auto"
                  title="Đăng nhập tài khoản Quản trị để cập nhật số liệu nhật ký"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Đăng nhập để sửa</span>
                </button>
              )}
            </div>

            {/* Secondary actions: 4 compact columns on mobile, row on tablet/desktop */}
            <div className="grid grid-cols-4 gap-1.5 sm:flex sm:items-center sm:gap-1.5">
              <button
                onClick={handleCopyZalo}
                disabled={!selectedDateIsInSchedule || filteredLogs.length === 0}
                className="flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-lg border border-slate-200/90 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-10 sm:rounded-xl sm:px-3 sm:text-xs"
                title="Sao chép báo cáo gửi Zalo cho sếp"
              >
                {copiedZalo ? <Check className="w-3.5 h-3.5 shrink-0 text-green-600" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">{copiedZalo ? 'Đã chép' : 'Zalo'}</span>
              </button>

              <button
                onClick={handleExport}
                disabled={!selectedDateIsInSchedule || filteredLogs.length === 0}
                className="flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-lg border border-slate-200/90 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-10 sm:rounded-xl sm:px-3 sm:text-xs"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Xuất Excel</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-lg border border-slate-200/90 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100 sm:min-h-10 sm:rounded-xl sm:px-3 sm:text-xs"
                title="Tải mẫu Excel để nhập nhiều báo cáo cùng lúc"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Mẫu Excel</span>
              </button>

              {isAdmin ? (
                <label className="flex min-h-9 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[11px] font-semibold text-blue-800 transition-colors hover:bg-blue-100 sm:min-h-10 sm:rounded-xl sm:px-3 sm:text-xs">
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Nhập Excel</span>
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-lg border border-slate-200/90 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 sm:min-h-10 sm:rounded-xl sm:px-3 sm:text-xs"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Nhập Excel</span>
                </button>
              )}
            </div>
          </div>

          <details
            open={!!rangeQuery || !!rangeQueryMessage}
            className="group rounded-xl border border-blue-200/80 bg-blue-50/30 p-3 shadow-2xs sm:rounded-2xl sm:p-4"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold text-slate-900 marker:hidden sm:text-sm">
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-blue-600" />
                <span>Tra cứu & tải dữ liệu báo cáo theo khoảng ngày</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
            </summary>

            <div className="mt-3 space-y-3 border-t border-blue-100/80 pt-3">
              <p className="text-[11px] leading-relaxed text-slate-500">
                Chọn tuyến, nhà thầu và ngày bắt đầu – kết thúc để xem và xuất Excel toàn bộ nhật ký, khối lượng, sai phạm và ảnh.
              </p>

              <div className="grid grid-cols-2 gap-2 xl:grid-cols-[minmax(12rem,1.4fr)_minmax(10rem,1fr)_minmax(9rem,0.8fr)_minmax(9rem,0.8fr)_auto] xl:items-end">
                <label className="col-span-2 min-w-0 text-[11px] font-semibold text-slate-600 sm:col-span-1">
                  <span className="mb-1 block">Tuyến / dự án</span>
                  <select
                    value={rangeProjectId}
                    onChange={(event) => {
                      setRangeProjectId(event.target.value);
                      setRangeContractorKey('all');
                      setRangeQuery(null);
                      setRangeQueryMessage(null);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 sm:px-3 sm:py-2"
                  >
                    <option value="">Chọn tuyến / dự án</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.code ? `${project.code} - ` : ''}{project.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="col-span-2 min-w-0 text-[11px] font-semibold text-slate-600 sm:col-span-1">
                  <span className="mb-1 block">Nhà thầu</span>
                  <select
                    value={rangeContractorKey}
                    onChange={(event) => {
                      setRangeContractorKey(event.target.value);
                      setRangeQuery(null);
                      setRangeQueryMessage(null);
                    }}
                    disabled={!rangeProjectId}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 disabled:bg-slate-100 sm:px-3 sm:py-2"
                  >
                    <option value="all">Tất cả nhà thầu</option>
                    {rangeContractorOptions.map((contractor) => (
                      <option key={contractor.key} value={contractor.key}>
                        {contractor.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="min-w-0 text-[11px] font-semibold text-slate-600">
                  <span className="mb-1 block">Từ ngày</span>
                  <input
                    type="date"
                    value={rangeStartDate}
                    onChange={(event) => {
                      setRangeStartDate(event.target.value);
                      setRangeQuery(null);
                      setRangeQueryMessage(null);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 sm:px-3 sm:py-2"
                  />
                </label>

                <label className="min-w-0 text-[11px] font-semibold text-slate-600">
                  <span className="mb-1 block">Đến ngày</span>
                  <input
                    type="date"
                    value={rangeEndDate}
                    onChange={(event) => {
                      setRangeEndDate(event.target.value);
                      setRangeQuery(null);
                      setRangeQueryMessage(null);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 sm:px-3 sm:py-2"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleRangeQuery}
                  className="col-span-2 flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 xl:col-span-1 sm:min-h-10"
                >
                  <Search className="h-3.5 w-3.5" />
                  Lấy dữ liệu
                </button>
              </div>

              {rangeQueryMessage && (
                <p
                  role={rangeQueryMessage.startsWith('Không') || rangeQueryMessage.startsWith('Vui lòng') || rangeQueryMessage.startsWith('Ngày bắt đầu') ? 'alert' : 'status'}
                  className={`text-xs ${
                    rangeQueryMessage.startsWith('Không') || rangeQueryMessage.startsWith('Vui lòng') || rangeQueryMessage.startsWith('Ngày bắt đầu')
                      ? 'text-red-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {rangeQueryMessage}
                </p>
              )}

              {rangeQuery && (
                <div className="space-y-3 border-t border-slate-200/80 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 sm:text-sm">
                        Kết quả: {projects.find((project) => project.id === rangeQuery.projectId)?.name}
                      </h3>
                      <p className="text-[10px] text-slate-500 sm:text-[11px]">
                        {rangeQuery.startDate.split('-').reverse().join('/')} – {rangeQuery.endDate.split('-').reverse().join('/')}
                        {' · '}
                        {rangeQuery.contractorKey === 'all'
                          ? 'Tất cả nhà thầu'
                          : rangeContractorOptions.find((contractor) => contractor.key === rangeQuery.contractorKey)?.name}
                        {' · '}{rangeResultLogs.length} nhật ký
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleExportRange()}
                      disabled={rangeResultLogs.length === 0 || isExportingRange}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {isExportingRange ? 'Đang tạo tệp...' : 'Tải xuống Excel'}
                    </button>
                  </div>

                  {rangeResultLogs.length === 0 ? (
                    <p className="rounded-lg bg-white px-3 py-4 text-center text-xs text-slate-500">
                      Không có dữ liệu cho tuyến, nhà thầu và khoảng ngày đã chọn.
                    </p>
                  ) : (
                    <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200 bg-white">
                      <table className="min-w-[1450px] w-full border-collapse text-left text-[11px]">
                        <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700">
                          <tr>
                            {[
                              'Mã nhật ký',
                              'STT',
                              'Ngày',
                              'Nhà thầu',
                              'Nguồn lực',
                              'Đào (m)',
                              'Lắp ống (m)',
                              'Hoàn trả (m)',
                              'Đổ hố ga',
                              'Lũy kế mương / HĐ (m)',
                              'Tỷ lệ mương',
                              'Lũy kế hố ga / HĐ',
                              'Lý do ngưng',
                              'Giám sát',
                              'Ghi chú',
                              'Sai phạm',
                              'Ảnh ngày',
                              'Ảnh sai phạm',
                            ].map((header) => (
                              <th key={header} className="whitespace-nowrap border-b border-r border-slate-200 px-2.5 py-2 font-bold last:border-r-0">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rangeResultLogs.map((log) => {
                            const violation = log.violationReport;
                            const dailyPhotos = getDailyLogPhotoUrls(log);
                            const violationPhotos = getViolationPhotoUrls(violation);
                            return (
                              <tr key={log.id} className="align-top hover:bg-blue-50/40">
                                <td className="whitespace-nowrap px-2.5 py-2 font-mono">{log.id}</td>
                                <td className="px-2.5 py-2 text-right">{log.stt}</td>
                                <td className="whitespace-nowrap px-2.5 py-2">{log.date.split('-').reverse().join('/')}</td>
                                <td className="px-2.5 py-2 font-semibold">{log.contractorName}</td>
                                <td className="px-2.5 py-2">{log.resources}</td>
                                <td className="px-2.5 py-2 text-right">{formatNumber(log.excavationTodayM)}</td>
                                <td className="px-2.5 py-2 text-right">{formatNumber(log.pipeLaidTodayM || 0)}</td>
                                <td className="px-2.5 py-2 text-right">{formatNumber(log.restoredTodayM || 0)}</td>
                                <td className="px-2.5 py-2 text-right">{formatNumber(log.chambersPouredToday)}</td>
                                <td className="whitespace-nowrap px-2.5 py-2 text-right">
                                  {formatNumber(log.cumulativeTrenchM)} / {formatNumber(log.contractTrenchM)}
                                </td>
                                <td className="px-2.5 py-2 text-right">
                                  {log.contractTrenchM > 0
                                    ? `${((log.cumulativeTrenchM / log.contractTrenchM) * 100).toFixed(1)}%`
                                    : '0%'}
                                </td>
                                <td className="whitespace-nowrap px-2.5 py-2 text-right">
                                  {formatNumber(log.cumulativeChambers)} / {formatNumber(log.contractChambers)}
                                </td>
                                <td className="max-w-40 whitespace-normal px-2.5 py-2">{log.stoppageReason || ''}</td>
                                <td className="px-2.5 py-2">{log.supervisorName || ''}</td>
                                <td className="max-w-48 whitespace-normal px-2.5 py-2">{log.notes || ''}</td>
                                <td className="max-w-56 whitespace-normal px-2.5 py-2">
                                  {violation?.hasViolation
                                    ? [
                                        `ID: ${violation.id}`,
                                        `Mã: ${violation.code}`,
                                        `${violation.violationTypeLabel} (${violation.violationType})`,
                                        `Mô tả: ${violation.description}`,
                                        `Khắc phục: ${violation.correctiveAction}`,
                                        `Hạn: ${violation.deadlineHours} giờ`,
                                        `Trạng thái: ${violation.status}`,
                                        `Người lập: ${violation.supervisorSign}`,
                                      ].join(' · ')
                                    : 'Không'}
                                </td>
                                <td className="min-w-28 px-2.5 py-2">
                                  <div className="flex flex-wrap gap-1">
                                    {dailyPhotos.map((url, index) => (
                                      <button
                                        key={`${url}-${index}`}
                                        type="button"
                                        onClick={() => setExpandedViolationPhoto(url)}
                                        className="h-9 w-11 overflow-hidden rounded border border-blue-200"
                                        aria-label={`Mở ảnh báo cáo ${index + 1}`}
                                      >
                                        <ViolationPhotoImage src={url} alt={`Ảnh báo cáo ${index + 1}`} className="h-full w-full object-cover" />
                                      </button>
                                    ))}
                                  </div>
                                </td>
                                <td className="min-w-28 px-2.5 py-2">
                                  <div className="flex flex-wrap gap-1">
                                    {violationPhotos.map((url, index) => (
                                      <button
                                        key={`${url}-${index}`}
                                        type="button"
                                        onClick={() => setExpandedViolationPhoto(url)}
                                        className="h-9 w-11 overflow-hidden rounded border border-red-200"
                                        aria-label={`Mở ảnh sai phạm ${index + 1}`}
                                      >
                                        <ViolationPhotoImage src={url} alt={`Ảnh sai phạm ${index + 1}`} className="h-full w-full object-cover" />
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>

          {excelStatus && (
            <div
              role={excelStatusIsError ? 'alert' : 'status'}
              className={`whitespace-pre-line rounded-xl border px-3 py-2 text-xs ${
                excelStatusIsError
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              {excelStatus}
            </div>
          )}

          {/* Highlight Today status if today is not submitted */}
          {isAdmin && unsubmittedProjectsToday.length > 0 && (
            <div className="flex flex-col justify-between gap-2.5 rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-50 via-amber-50/80 to-orange-50/50 p-3 sm:flex-row sm:items-center sm:rounded-2xl sm:p-4 shadow-xs">
              <div className="flex items-center gap-2 text-[11px] text-amber-950 font-bold sm:text-xs">
                <span className="relative flex h-2 w-2 shrink-0 sm:h-2.5 sm:w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600 sm:h-2.5 sm:w-2.5" />
                </span>
                <span>
                  HÔM NAY ({TODAY_STR.split('-').reverse().join('/')}): Còn{' '}
                  <strong className="text-red-700 font-black">{unsubmittedProjectsToday.length} dự án</strong> chưa chốt nhật ký!
                </span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() =>
                    handleActionRequiresAdmin(() => {
                      onSelectDate(TODAY_STR);
                      if (unsubmittedProjectsToday[0]) {
                        onSelectProjectId(unsubmittedProjectsToday[0].id);
                      }
                      const project = unsubmittedProjectsToday[0];
                      const firstMissingContractor = project?.contractors?.find(
                        (contractor) =>
                          (selectedContractorKey === 'all' ||
                            getContractorKey(contractor.name) === selectedContractorKey) &&
                          !todayLogs.some(
                            (log) =>
                              log.projectId === project.id &&
                              getContractorKey(log.contractorName) === getContractorKey(contractor.name)
                          )
                      );
                      onOpenSupervisorForm(
                        TODAY_STR,
                        project?.id,
                        selectedContractorName || firstMissingContractor?.name
                      );
                    })
                  }
                  className="w-full rounded-lg bg-gradient-to-r from-red-600 to-rose-600 px-3.5 py-2 text-[11px] font-bold text-white shadow-xs transition hover:from-red-700 hover:to-rose-700 active:scale-[0.98] sm:w-auto sm:rounded-xl sm:text-xs"
                >
                  {isAdmin ? 'Nhập báo cáo hôm nay' : 'Đăng nhập Admin'}
                </button>
              </div>
            </div>
          )}

          {selectedProjectId === 'all' && activeBulletinsForProject.length > 0 && (
            <button
              type="button"
              aria-expanded={showProjectBulletins}
              onClick={() => setShowProjectBulletins((shown) => !shown)}
              className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-xs font-bold text-amber-900"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Thông báo hiện trường ({activeBulletinsForProject.length})
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showProjectBulletins ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>

        {showProjectBulletins && activeBulletinsForProject.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-slate-100">
            {activeBulletinsForProject.map((b) => (
              <div
                key={b.id}
                className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                  b.severity === 'critical'
                    ? 'bg-red-50/90 border-red-200 text-red-950'
                    : b.severity === 'warning'
                    ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                    : 'bg-blue-50/90 border-blue-200 text-blue-950'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      b.severity === 'critical'
                        ? 'text-red-600'
                        : b.severity === 'warning'
                        ? 'text-amber-600'
                        : 'text-blue-600'
                    }`}
                  />
                  <div>
                    <div className="font-bold flex flex-wrap items-center gap-2">
                      <span>THÔNG BÁO HIỆN TRƯỜNG: {b.title}</span>
                      {b.documentRefNumber && (
                        <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border">
                          📄 {b.documentRefNumber}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-slate-800 leading-relaxed">{b.content}</p>
                  </div>
                </div>

                {onGoToBulletins && (
                  <button
                    onClick={() => onGoToBulletins(b.projectId)}
                    className="text-[11px] font-bold underline shrink-0 hover:opacity-80"
                  >
                    Xem hồ sơ
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {viewMode === 'weekly' && (
        <div className="space-y-3 sm:space-y-4">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-blue-800 px-3.5 py-3.5 text-white sm:px-6 sm:py-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">
              Theo dõi tiến độ
            </p>
            <h2 className="mt-0.5 text-sm font-black sm:text-xl">So sánh khối lượng tuần này với tuần trước</h2>
            <p className="mt-1 break-words text-[11px] text-blue-100 sm:text-xs">
              <strong className="text-white">{selectedProjectId === 'all' ? 'Toàn bộ dự án' : currentProject?.name}</strong> ·
              {' '}{previousWeekRange.start.split('-').reverse().join('/')} – {previousWeekRange.end.split('-').reverse().join('/')}
              {' '}so với {currentWeekRange.start.split('-').reverse().join('/')} – {TODAY_STR.split('-').reverse().join('/')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3 sm:gap-3 sm:p-5 xl:grid-cols-4">
            {[
              { label: 'Khối lượng tuyến', unit: 'm', current: thisWeekOutput.trench, previous: lastWeekOutput.trench },
              { label: 'Ống đã lắp', unit: 'm', current: thisWeekOutput.pipe, previous: lastWeekOutput.pipe },
              { label: 'Mặt bằng hoàn trả', unit: 'm', current: thisWeekOutput.restored, previous: lastWeekOutput.restored },
              { label: 'Hầm / hố ga', unit: 'hầm', current: thisWeekOutput.chambers, previous: lastWeekOutput.chambers },
            ].map((metric) => {
              const difference = metric.current - metric.previous;
              const changeLabel =
                difference > 0 ? `+${formatNumber(difference)} ${metric.unit}` :
                difference < 0 ? `-${formatNumber(Math.abs(difference))} ${metric.unit}` :
                'Không đổi';
              return (
                <article key={metric.label} className="rounded-xl border border-slate-200 p-2.5 sm:p-4">
                  <p className="text-[11px] font-semibold text-slate-600 sm:text-xs">{metric.label}</p>
                  <p className="mt-1 text-lg font-black tracking-tight text-slate-900 sm:mt-2 sm:text-2xl">
                    {formatNumber(metric.current)} <span className="text-xs font-semibold text-slate-500 sm:text-sm">{metric.unit}</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500 sm:mt-1 sm:text-[11px]">
                    Tuần trước: {formatNumber(metric.previous)} {metric.unit}
                  </p>
                  <p className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold sm:mt-3 sm:px-2.5 sm:py-1 sm:text-[11px] ${
                    difference > 0
                      ? 'bg-emerald-50 text-emerald-700'
                      : difference < 0
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {changeLabel}
                  </p>
                </article>
              );
            })}
          </div>
          <p className="px-3 pb-3 text-[10px] text-slate-500 sm:px-5 sm:pb-4 sm:text-[11px]">
            Số liệu tổng hợp từ nhật ký thi công trong thời gian dự án hoạt động. Tuần hiện tại được tính từ thứ Hai đến hôm nay.
          </p>
        </section>

        <section className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:space-y-3 sm:p-5">
          <div>
            <h3 className="flex items-center gap-2 text-xs font-bold text-slate-900 sm:text-sm">
              <FileSpreadsheet className="h-4 w-4 text-blue-600" />
              Cập nhật nhật ký bằng Excel
            </h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 sm:text-xs">
              Chọn dự án, tải mẫu có sẵn ngày thi công và nhật ký đã nhập. Điền sản lượng theo ngày rồi tải tệp lên.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-[11px] font-semibold text-slate-600">
              <span className="mb-1 block">Dự án</span>
              <select
                value={historyTemplateProjectId}
                onChange={(event) => setHistoryTemplateProjectId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800"
              >
                <option value="">Chọn dự án</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={handleDownloadHistoryTemplate}
                disabled={!historyTemplateProjectId}
                className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10"
              >
                <Download className="h-3.5 w-3.5" />
                Tải mẫu dự án
              </button>

              {isAdmin ? (
                <label className="flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 sm:min-h-10">
                  <Upload className="h-3.5 w-3.5" />
                  Nhập nhật ký
                  <input
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    disabled={!historyTemplateProjectId}
                    onChange={handleImportHistoryFile}
                  />
                </label>
              ) : (
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 sm:min-h-10"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Đăng nhập để nhập
                </button>
              )}
            </div>
          </div>

          {excelStatus && (
            <div
              role={excelStatusIsError ? 'alert' : 'status'}
              className={`whitespace-pre-line rounded-lg border px-3 py-2 text-xs ${
                excelStatusIsError
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              {excelStatus}
            </div>
          )}
        </section>
        </div>
      )}

      {false && viewMode === 'weekly' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-blue-600" />
                  Tra Cứu Lịch Sử Thi Công Theo Danh Sách Các Tuần
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chọn tuần từ danh sách hoặc dùng nút chuyển tuần để xem lại toàn bộ tình hình hoạt động của các đội thi công, khối lượng đào và ngày nghỉ bão lũ.
                </p>
              </div>

              {/* Week Selector Dropdown & Stepper Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportWeek}
                  disabled={activeWeekLogs.length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5" />
                  Xuất Excel tuần
                </button>
                <button
                  type="button"
                  onClick={() => previousWeek && setSelectedWeekId(previousWeek.id)}
                  disabled={!previousWeek}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                  title="Chuyển về tuần trước"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Tuần trước</span>
                </button>

                <select
                  value={activeWeek.id}
                  onChange={(e) => setSelectedWeekId(e.target.value)}
                  className="px-3.5 py-2 text-xs font-bold text-blue-900 bg-blue-50 border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden shadow-2xs"
                >
                  {WEEKS_LIST.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => nextWeek && setSelectedWeekId(nextWeek.id)}
                  disabled={!nextWeek}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                  title="Chuyển sang tuần sau"
                >
                  <span>Tuần sau</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Display active selected week table */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-100 px-4 py-2.5 rounded-xl border border-slate-200 gap-2">
                <span className="font-extrabold text-xs sm:text-sm text-slate-800 uppercase tracking-wide">
                  LỊCH TRÌNH: {activeWeek.name}
                </span>
                {activeWeek.isCurrent && (
                  <span className="text-[11px] font-bold text-blue-700 bg-white px-2.5 py-0.5 rounded-md border border-blue-200 w-fit">
                    Hôm nay: {TODAY_STR.split('-').reverse().join('/')}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                      <th className="py-2.5 px-3 min-w-[210px] border-r border-slate-200">Dự Án / Nhà Thầu</th>
                      {activeWeek.days.map((d) => (
                        <th
                          key={d.date}
                          className={`py-2 px-2 text-center min-w-[115px] border-r border-slate-200 ${
                            d.isToday ? 'bg-amber-100 text-amber-950 border-x-2 border-amber-400 font-black' : ''
                          }`}
                        >
                          <div>{d.label}</div>
                          {d.isToday && (
                            <span className="inline-block bg-red-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded uppercase mt-0.5 shadow-2xs">
                              HÔM NAY ({TODAY_STR.slice(-2)})
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200">
                    {scheduleProjects.map((proj) => {
                      return (
                        <tr key={proj.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3 border-r border-slate-200 font-semibold">
                            <div className="text-slate-900 font-bold">{proj.name}</div>
                            <div className="text-[11px] text-slate-500 font-normal">
                              {selectedContractorName || (proj.contractors?.length
                                ? proj.contractors.map((contractor) => contractor.name).join(', ')
                                : proj.contractor)}
                            </div>
                            <div className="text-[10px] text-blue-700 font-mono mt-0.5">
                              Tiến độ: {formatNumber(proj.completedLengthM)}/{formatNumber(proj.totalLengthM)}m ({Math.round((proj.completedLengthM/proj.totalLengthM)*100)}%)
                            </div>
                          </td>

                          {activeWeek.days.map((d) => {
                            const projectIsActive = isProjectActiveOnDate(proj, d.date);
                            if (!projectIsActive) {
                              return (
                                <td key={d.date} className="p-2 border-r border-slate-200 text-center text-slate-400">
                                  <span className="text-[10px] italic">
                                    {d.date < proj.startDate ? 'Chưa khởi công' : 'Đã kết thúc'}
                                  </span>
                                </td>
                              );
                            }

                            const dayLogs = dailyLogs.filter(
                              (log) =>
                                log.projectId === proj.id &&
                                log.date === d.date &&
                                (selectedContractorKey === 'all' ||
                                  getContractorKey(log.contractorName) === selectedContractorKey)
                            );
                            const log = dayLogs[0];
                            const isToday = d.isToday;
                            const isFuture = d.date > TODAY_STR;

                            if (isToday) {
                              if (!log) {
                                return (
                                  <td
                                    key={d.date}
                                    className={`p-2 border-r border-slate-200 text-center ${
                                      isAdmin ? 'bg-red-50/80 border-x-2 border-amber-400' : ''
                                    }`}
                                  >
                                    {isAdmin ? (
                                      <div className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-2 text-center">
                                        <span className="block text-[10px] font-bold uppercase text-red-700">
                                          Chưa báo cáo
                                        </span>
                                        <button
                                          onClick={() =>
                                            handleActionRequiresAdmin(() => {
                                              onSelectDate(d.date);
                                              setCalendarMonth(d.date.slice(0, 7));
                                              onSelectProjectId(proj.id);
                                              onOpenSupervisorForm(d.date, proj.id, selectedContractorName);
                                            })
                                          }
                                          className="block w-full rounded-lg bg-red-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-700"
                                        >
                                          + Nhập ngay
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                );
                              }

                              const hasViol = log.violationReport?.hasViolation;
                              return (
                                <td
                                  key={d.date}
                                  className="p-2 border-r border-slate-200 bg-amber-50/80 border-x-2 border-amber-400 text-center"
                                >
                                  <button
                                    onClick={() => {
                                      onSelectDate(d.date);
                                      setCalendarMonth(d.date.slice(0, 7));
                                      onSelectProjectId(proj.id);
                                      setViewMode('daily');
                                    }}
                                    className="w-full text-left bg-white p-2 rounded-xl border border-amber-300 shadow-2xs hover:bg-amber-50/40"
                                  >
                                    <div className="flex items-center justify-between text-[10px] font-bold text-amber-900 mb-0.5">
                                      <span>✓ Đã báo cáo</span>
                                      <span className="font-mono text-blue-700">{formatNumber(log.excavationTodayM)}m</span>
                                    </div>
                                    <div className="text-[10px] font-semibold text-slate-800 truncate">
                                      {getResourceDescription(log)}
                                    </div>
                                    {hasViol && (
                                      <span className="mt-1 flex items-center gap-1 bg-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-300">
                                        <Camera className="w-3 h-3 text-red-600" />
                                        <span>Có biên bản & ảnh vi phạm</span>
                                      </span>
                                    )}
                                  </button>
                                </td>
                              );
                            }

                            // Other days of week
                            if (!log) {
                              return (
                                <td key={d.date} className="p-2 border-r border-slate-200 text-center text-slate-300">
                                  {isFuture ? (
                                    <span className="text-[10px] text-slate-400 italic">Chưa đến ngày</span>
                                  ) : (
                                    <span>-</span>
                                  )}
                                </td>
                              );
                            }

                            const isStopped = isStoppedLog(log);
                            const hasViol = log.violationReport?.hasViolation;

                            return (
                              <td key={d.date} className="p-2 border-r border-slate-200 text-center">
                                <button
                                  onClick={() => {
                                    onSelectDate(d.date);
                                    setCalendarMonth(d.date.slice(0, 7));
                                    onSelectProjectId(proj.id);
                                    setViewMode('daily');
                                  }}
                                  className={`w-full text-left p-1.5 rounded-lg border text-[10px] transition-all hover:ring-1 hover:ring-blue-500 ${
                                    hasViol
                                      ? 'bg-red-50 border-red-300 text-red-950 ring-1 ring-red-400'
                                      : isStopped
                                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                                      : 'bg-slate-50 border-slate-200 text-slate-800'
                                  }`}
                                >
                                  <div className="font-semibold truncate">{getResourceDescription(log)}</div>
                                  <div className="font-mono text-[9px] text-slate-500 mt-0.5">
                                    Đào: {formatNumber(log.excavationTodayM)}m • Bể: {formatNumber(log.chambersPouredToday)}
                                  </div>
                                  {hasViol && (
                                    <div className="text-[9px] font-bold text-red-600 mt-0.5 flex items-center gap-1">
                                      <Camera className="w-3 h-3" />
                                      <span>Biên bản vi phạm</span>
                                    </div>
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: BÁO CÁO NGÀY THEO THỜI GIAN DỰ ÁN */}
      {viewMode === 'daily' && (
        <>
          {/* 2. Lịch thi công theo kỳ dự án */}
          <div className="bg-white rounded-2xl p-3 sm:p-5 border border-slate-200/90 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 mb-3 sm:mb-4 pb-2.5 sm:pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center justify-between sm:justify-start gap-2">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth(previousCalendarMonthKey)}
                    disabled={previousCalendarMonthKey < firstScheduleMonth}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    aria-label="Tháng trước"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <h3 className="text-sm sm:text-base font-bold capitalize text-slate-900 flex items-center gap-1.5 sm:gap-2">
                    <CalendarIcon className="w-4 h-4 text-blue-600" />
                    Lịch thi công {calendarMonthLabel}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setCalendarMonth(nextCalendarMonthKey)}
                    disabled={nextCalendarMonthKey > lastScheduleMonth}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    aria-label="Tháng sau"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                  Chọn ngày để xem đúng nội dung thi công và khối lượng đã nhập. Ngày có biên bản vi phạm sai thiết kế được làm nổi bật.
                </p>
              </div>

              {/* Calendar Legend */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] sm:text-[11px] text-slate-600">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500" />
                  <span>Thi công</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-amber-500" />
                  <span className="text-amber-800 font-semibold">Nghỉ</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-600 animate-pulse" />
                  <span className="text-red-700 font-bold">Vi phạm</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-slate-300" />
                  <span>Chưa BC</span>
                </span>
              </div>
            </div>

            {/* Days of week */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[10px] sm:text-[11px] font-bold text-slate-500 mb-1.5 sm:mb-2">
              <div className="text-red-500">CN</div>
              <div>T2</div>
              <div>T3</div>
              <div>T4</div>
              <div>T5</div>
              <div>T6</div>
              <div>T7</div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {calendarCells.map((cell, idx) => {
                if (!cell.day || !cell.dateStr) {
                  return <div key={`empty-${idx}`} className="h-14 sm:h-20 bg-slate-50/40 rounded-lg sm:rounded-xl" />;
                }

                const isSelected = cell.dateStr === selectedDate;
                const dayStatus = getDateStatus(cell.dateStr);
                const isToday = cell.dateStr === TODAY_STR;
                const isFuture = cell.dateStr > TODAY_STR;
                const hasViolation = dayStatus.hasViolation;
                const isInSchedule = isDateInSchedule(cell.dateStr) || dayStatus.count > 0;

                return (
                  <div
                    key={cell.dateStr}
                    role="group"
                    aria-label={`Chọn ngày ${cell.dateStr}`}
                    tabIndex={isInSchedule ? 0 : undefined}
                    onClick={() => {
                      if (isInSchedule) selectCalendarDate(cell.dateStr!);
                    }}
                    onKeyDown={(event) => {
                      if (
                        isInSchedule &&
                        event.target === event.currentTarget &&
                        (event.key === 'Enter' || event.key === ' ')
                      ) {
                        event.preventDefault();
                        selectCalendarDate(cell.dateStr!);
                      }
                    }}
                    className={`relative h-14 sm:h-22 p-1 sm:p-1.5 rounded-lg sm:rounded-xl border transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'ring-2 ring-blue-600 border-blue-600 bg-blue-50/70 shadow-sm'
                        : !isInSchedule
                        ? 'border-slate-200/60 bg-slate-50/40 opacity-60'
                        : hasViolation
                        ? 'border-2 border-red-500 bg-red-100/90 ring-1 sm:ring-2 ring-red-400 shadow-xs'
                        : isToday
                        ? 'border-2 border-amber-500 bg-amber-50/40 shadow-xs'
                        : isFuture
                        ? 'border-slate-200/60 bg-slate-50/40 opacity-80'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    } ${isInSchedule ? 'cursor-pointer' : ''}`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <button
                        type="button"
                        disabled={!isInSchedule}
                        className={`text-[11px] sm:text-xs font-bold font-mono leading-none ${
                          isSelected
                            ? 'text-blue-900 font-black'
                            : !isInSchedule
                            ? 'text-slate-400'
                            : isToday
                            ? 'text-white bg-red-600 px-1 sm:px-1.5 py-0.5 rounded-full font-black text-[10px] sm:text-xs'
                            : hasViolation
                            ? 'text-red-800 font-black'
                            : 'text-slate-700'
                        }`}
                      >
                        {cell.day}
                      </button>

                      {!isInSchedule ? (
                        <span className="text-[8px] text-slate-400">—</span>
                      ) : hasViolation ? (
                        <span
                          className="flex h-4 w-4 sm:h-5 sm:w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-xs"
                          title="CÓ BIÊN BẢN VI PHẠM SAI THIẾT KẾ (KÈM ẢNH CHỤP HIỆN TRƯỜNG)"
                        >
                          <Camera className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        </span>
                      ) : dayStatus.status === 'working' ? (
                        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500" title="Có thi công" />
                      ) : dayStatus.status === 'off' ? (
                        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-amber-500" title={dayStatus.label} />
                      ) : null}
                    </div>

                    {/* Status Text & Direct Update Link */}
                    <div className="text-[8px] sm:text-[10px]">
                      {!isInSchedule ? (
                        <div className="py-0.5 text-center text-[8px] sm:text-[9px] text-slate-400 truncate">
                          <span className="sm:hidden">—</span>
                          <span className="hidden sm:inline">
                            {currentProject && cell.dateStr < currentProject.startDate
                              ? 'Chưa khởi công'
                              : currentProject && cell.dateStr > currentProject.finishDate
                              ? 'Đã kết thúc'
                              : 'Ngoài kỳ'}
                          </span>
                        </div>
                      ) : hasViolation ? (
                        <button
                          type="button"
                          className="flex min-h-4 sm:min-h-7 w-full min-w-0 flex-col items-start justify-center truncate rounded border border-red-300/80 bg-red-200/80 px-1 py-0.5 text-left font-black text-red-950 hover:bg-red-300"
                          title={`${dayStatus.label} · Nhấp để xem biên bản vi phạm và ảnh hiện trường`}
                          aria-label="Xem biên bản vi phạm"
                        >
                          <span className="flex items-center gap-0.5 sm:gap-1">
                            <Camera className="hidden sm:block h-3 w-3 shrink-0 text-red-700" />
                            <span className="truncate text-[8px] sm:text-[9px]">Sai phạm</span>
                          </span>
                          {dayStatus.status !== 'working' && (
                            <span className="hidden w-full truncate text-[8px] font-semibold sm:block">
                              {dayStatus.label}
                            </span>
                          )}
                          {dayStatus.status === 'working' && (
                            <span className="hidden sm:flex w-full min-w-0 flex-col gap-0.5 text-left leading-tight">
                              <span className="text-[8px] font-bold text-emerald-800 sm:text-[9px]">Thi công</span>
                              <span className="line-clamp-2 break-words text-[8px] font-semibold sm:text-[9px]">
                                NL: {dayStatus.resourcesSummary}
                              </span>
                              <span className="truncate text-[8px] font-bold text-emerald-800 sm:text-[9px]">
                                KL: {dayStatus.excavationSummary}
                              </span>
                            </span>
                          )}
                        </button>
                      ) : dayStatus.status === 'working' ? (
                        <button
                          type="button"
                          className="flex min-h-4 sm:min-h-7 w-full min-w-0 flex-col items-start gap-0.5 overflow-hidden text-left leading-tight"
                          title={dayStatus.label}
                          aria-label={dayStatus.label}
                        >
                          <span className="sm:hidden w-full truncate rounded bg-emerald-50 px-1 py-0.5 text-center font-mono text-[8px] font-bold text-emerald-800">
                            {dayStatus.excavationSummary || 'Làm'}
                          </span>
                          <span className="hidden sm:block text-[8px] font-bold text-emerald-800 sm:text-[9px]">Thi công</span>
                          <span className="hidden sm:block line-clamp-2 w-full break-words text-[8px] font-semibold text-emerald-700 sm:text-[9px]">
                            NL: {dayStatus.resourcesSummary}
                          </span>
                          <span className="hidden sm:block w-full truncate text-[8px] font-bold text-emerald-800 sm:text-[9px]">
                            KL: {dayStatus.excavationSummary}
                          </span>
                        </button>
                      ) : dayStatus.status === 'off' ? (
                        <span
                          className="block min-h-4 sm:min-h-7 w-full min-w-0 truncate py-0.5 sm:py-1 text-center font-bold text-amber-700 sm:text-left"
                          title={dayStatus.label}
                          aria-label={dayStatus.label}
                        >
                          <span className="sm:hidden rounded bg-amber-50 px-1 py-0.5 text-[8px]">Nghỉ</span>
                          <span className="hidden sm:inline">{dayStatus.label}</span>
                        </span>
                      ) : dayStatus.status === 'none' ? (
                        isFuture ? (
                          /* CHƯA ĐẾN NGÀY: ẨN ĐI NÚT BÁO CÁO */
                          <div className="text-center text-[9px] sm:text-[10px] text-slate-300 select-none py-0.5">-</div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              handleActionRequiresAdmin(() => {
                                onOpenSupervisorForm(
                                  cell.dateStr!,
                                  selectedProjectId !== 'all' ? selectedProjectId : undefined,
                                  selectedContractorName
                                );
                              });
                            }}
                            className="flex min-h-5 sm:min-h-7 w-full min-w-0 items-center justify-center gap-1 truncate rounded border border-blue-200/60 bg-blue-50/80 px-1 py-0.5 text-center text-blue-600 hover:bg-blue-100 hover:text-blue-800"
                            title="Cập nhật báo cáo cho ngày này đúng nhà thầu đã chọn"
                            aria-label="Thêm báo cáo cho ngày này"
                          >
                            <PlusCircle className="h-3 w-3 shrink-0" />
                            <span className="hidden text-[9px] sm:inline">Báo cáo</span>
                          </button>
                        )
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredLogs.length > 0 && (
              <div className="mt-2.5 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 md:hidden">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-bold text-slate-800">
                    Tóm tắt ngày {selectedDate.split('-').reverse().join('/')} ({filteredLogs.length})
                  </h3>
                  <a
                    href="#daily-quantity-report"
                    className="text-[10px] font-bold text-blue-600 underline"
                  >
                    Xem bảng chi tiết ↓
                  </a>
                </div>
                {filteredLogs.map((log) => {
                  const logProject = projectById.get(log.projectId);
                  return (
                    <div key={log.id} className="rounded-lg border border-slate-200/80 bg-white p-2.5 text-xs shadow-2xs">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        {logProject?.code && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700 border border-blue-200">
                            {logProject.code}
                          </span>
                        )}
                        <span className="break-words text-[11px] font-extrabold text-blue-950">
                          {log.projectName || logProject?.name || 'Dự án'}
                        </span>
                      </div>
                      <p className="mb-1 break-words text-[11px] font-semibold text-slate-600">
                        Nhà thầu: <span className="text-slate-900">{log.contractorName}</span>
                      </p>
                      <p className="break-words text-[11px] font-semibold text-emerald-800">
                        {isStoppedLog(log)
                          ? `Nghỉ: ${getStoppageReason(log) || 'chưa ghi lý do'}`
                          : `Thi công: ${log.resources?.trim() || 'Chưa ghi nguồn lực'}`}
                      </p>
                      {!isStoppedLog(log) && (
                        <p className="mt-0.5 font-mono text-[11px] text-slate-700">
                          Đào phui: <strong>{formatNumber(log.excavationTodayM || 0)} m</strong> · Đổ bể: <strong>{formatNumber(log.chambersPouredToday || 0)} hầm</strong>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Daily Resource Summary Strip */}
          <div className="bg-white rounded-2xl p-3 sm:p-5 border border-slate-200/90 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 border-b border-slate-100 pb-2.5 sm:pb-3 mb-2.5 sm:mb-3">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-xs sm:text-sm font-bold text-slate-900">
                  Chi Tiết Ngày: {selectedDate.split('-').reverse().join('/')}
                </span>
                <span className="text-[11px] sm:text-xs bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-md">
                  {filteredLogs.length} nhật ký
                </span>
                {violationsCountToday > 0 && (
                  <span className="text-[11px] sm:text-xs bg-red-600 text-white font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                    <Camera className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span>{violationsCountToday} Vi phạm (Có ảnh)</span>
                  </span>
                )}
              </div>

              <div className="text-[11px] sm:text-xs text-slate-600 flex items-center gap-2 sm:gap-3">
                <span className="font-semibold text-slate-900">
                  Huy động:{' '}
                  <strong className="text-blue-600 font-mono text-xs sm:text-sm">{totalActiveTeams} đội làm việc</strong>
                </span>
                {stoppedTeams > 0 && (
                  <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {stoppedTeams} đội nghỉ
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
              <span className="col-span-2 sm:col-span-1 text-slate-500 text-[10px] sm:text-xs">Phân loại đội & sản lượng:</span>
              <span className="bg-slate-100 px-2 sm:px-2.5 py-1 rounded-lg text-slate-800 font-medium">
                Đào phui: <strong>{formatNumber(trenchTeams)} đội</strong>
              </span>
              <span className="bg-slate-100 px-2 sm:px-2.5 py-1 rounded-lg text-slate-800 font-medium">
                Khoan HDD: <strong>{formatNumber(drillingTeams)} đội</strong>
              </span>
              <span className="bg-slate-100 px-2 sm:px-2.5 py-1 rounded-lg text-slate-800 font-medium">
                Mét đào: <strong className="font-mono text-blue-700">{formatNumber(totalExcavation)}m</strong>
              </span>
              <span className="bg-slate-100 px-2 sm:px-2.5 py-1 rounded-lg text-slate-800 font-medium">
                Đổ hố ga: <strong className="font-mono text-emerald-700">{formatNumber(totalChambersToday)} bể</strong>
              </span>
            </div>
          </div>

          {/* Báo cáo khối lượng thi công */}
          <div id="daily-quantity-report" className="scroll-mt-4 bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
            <div className="text-center py-3 px-4 sm:py-4 sm:px-6 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50">
              <h2 className="text-sm sm:text-lg font-extrabold text-slate-900 uppercase tracking-tight">
                Báo Cáo Khối Lượng Thi Công
              </h2>
              {currentProject ? (
                <p className="mt-0.5 break-words text-xs font-bold text-blue-800 sm:text-sm">
                  {currentProject.code} — {currentProject.name}
                </p>
              ) : (
                <p className="mt-0.5 text-xs font-semibold text-slate-600">
                  Tất cả dự án ngầm hóa ({projects.length} dự án)
                </p>
              )}
              <div className="mt-1.5 inline-block bg-yellow-300 text-slate-900 font-bold text-xs sm:text-base px-4 sm:px-6 py-0.5 rounded-sm shadow-xs border border-yellow-400">
                Ngày {selectedDate.split('-').reverse().join('/')}
              </div>
            </div>

            <div className="divide-y divide-slate-200 md:hidden">
              {filteredLogs.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-500">
                  {!selectedDateIsInSchedule
                    ? 'Ngày này nằm ngoài thời gian triển khai dự án.'
                    : isSelectedDateFuture
                    ? 'Ngày này chưa đến.'
                    : 'Chưa có nhật ký cho ngày này.'}
                </div>
              ) : (
                filteredLogs.map((row, idx) => {
                  const rowProject = projectById.get(row.projectId);
                  const trenchPercent = row.contractTrenchM > 0
                    ? ((row.cumulativeTrenchM / row.contractTrenchM) * 100).toFixed(1)
                    : '0.0';
                  const violation = row.violationReport;
                  const dailyPhotoUrls = getDailyLogPhotoUrls(row);

                  return (
                    <article key={row.id} className="space-y-2.5 px-3 py-3">
                      {/* Prominent Project Header on Mobile */}
                      <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-blue-700 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                              #{idx + 1}
                            </span>
                            {rowProject?.code && (
                              <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-800 border border-blue-200">
                                {rowProject.code}
                              </span>
                            )}
                            {rowProject && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                                {planTypes.find((type) => type.id === rowProject.planTypeId)?.name || 'Chưa phân loại'}
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[11px] font-extrabold text-blue-700">
                            {trenchPercent}% HĐ
                          </span>
                        </div>
                        <p className="mt-1 break-words text-xs font-extrabold leading-snug text-slate-900">
                          Dự án: {row.projectName || rowProject?.name || 'Chưa rõ tên dự án'}
                        </p>
                        <p className="mt-0.5 break-words text-[11px] font-bold text-slate-700">
                          Nhà thầu: <span className="text-blue-900">{row.contractorName}</span>
                        </p>
                      </div>

                      <p className="break-words rounded-lg bg-slate-50 border border-slate-200/70 px-2.5 py-1.5 text-[11px] font-medium text-slate-800">
                        {getResourceDescription(row)}
                      </p>

                      {dailyPhotoUrls.length > 0 && (
                        <div>
                          <p className="mb-1 text-[10px] font-semibold text-slate-600">
                            Ảnh báo cáo thi công ({dailyPhotoUrls.length})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {dailyPhotoUrls.map((photoUrl, photoIndex) => (
                              <button
                                key={`${photoUrl}-${photoIndex}`}
                                type="button"
                                onClick={() => setExpandedViolationPhoto(photoUrl)}
                                aria-label={`Mở ảnh báo cáo ${photoIndex + 1} toàn màn hình`}
                                className="h-14 w-18 overflow-hidden rounded-lg border border-blue-200 bg-slate-900"
                              >
                                <ViolationPhotoImage
                                  src={photoUrl}
                                  alt={`Ảnh báo cáo ${photoIndex + 1}`}
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <dl className="grid grid-cols-2 gap-1.5 text-xs">
                        <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 border border-slate-100">
                          <dt className="text-[10px] text-slate-500">Đào phui ngày</dt>
                          <dd className="mt-0.5 font-mono text-xs font-bold text-slate-900">{formatNumber(row.excavationTodayM)} m</dd>
                        </div>
                        <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 border border-slate-100">
                          <dt className="text-[10px] text-slate-500">Đổ hố ga ngày</dt>
                          <dd className="mt-0.5 font-mono text-xs font-bold text-slate-900">{formatNumber(row.chambersPouredToday)} hầm</dd>
                        </div>
                        <div className="rounded-lg bg-blue-50/50 px-2.5 py-1.5 border border-blue-100/80">
                          <dt className="text-[10px] text-slate-500">Lũy kế mương cáp</dt>
                          <dd className="mt-0.5 font-mono text-xs font-bold text-blue-700">
                            {formatNumber(row.cumulativeTrenchM)} / {formatNumber(row.contractTrenchM)} m
                          </dd>
                        </div>
                        <div className="rounded-lg bg-emerald-50/50 px-2.5 py-1.5 border border-emerald-100/80">
                          <dt className="text-[10px] text-slate-500">Lũy kế hố ga</dt>
                          <dd className="mt-0.5 font-mono text-xs font-bold text-emerald-700">
                            {formatNumber(row.cumulativeChambers)} / {formatNumber(row.contractChambers)} hầm
                          </dd>
                        </div>
                      </dl>

                      {violation?.hasViolation && (
                        <button
                          type="button"
                          onClick={() => setSelectedViolationDetail(violation)}
                          className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-left text-[11px] font-semibold text-red-800"
                        >
                          <Camera className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 break-words">{violation.code}: {violation.violationTypeLabel}</span>
                        </button>
                      )}

                      {(row.notes || row.stoppageReason) && (
                        <p className="break-words text-[11px] leading-relaxed text-slate-600">
                          {row.stoppageReason || row.notes}
                        </p>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-1">
                        {isAdmin ? (
                          <>
                            <button
                              type="button"
                              onClick={() => onEditLog(row)}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Edit3 className="h-3.5 w-3.5" /> Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteLog(row.id)}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-red-200 px-2.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Xóa
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] italic text-slate-400">Chỉ xem</span>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 text-center">
                    <th rowSpan={2} className="py-2.5 px-2 border-r border-slate-300 w-12">
                      STT
                    </th>
                    <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-300 min-w-[120px]">
                      Nhà Thầu
                    </th>
                    <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-300 min-w-[130px]">
                      Dự Án Ngầm
                    </th>
                    <th rowSpan={2} className="py-2.5 px-4 border-r border-slate-300 min-w-[200px]">
                      Nguồn Lực & Hình Ảnh Báo Cáo
                    </th>
                    <th rowSpan={2} className="py-2.5 px-2 border-r border-slate-300 w-24">
                      KL Đào Phui / Ngày (Mét)
                    </th>
                    <th rowSpan={2} className="py-2.5 px-2 border-r border-slate-300 w-24">
                      Khối Lượng Đổ Hố Ga / Ngày
                    </th>
                    <th colSpan={3} className="py-2 px-2 border-r border-slate-300 bg-slate-200">
                      Khối Lượng Mương Cáp (Lắp ống)
                    </th>
                    <th colSpan={2} className="py-2 px-2 border-r border-slate-300 bg-slate-200">
                      Khối Lượng Bể Cáp
                    </th>
                    <th rowSpan={2} className="py-2.5 px-2 w-20 text-center">
                      Thao tác
                    </th>
                  </tr>

                  <tr className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-300 text-center">
                    <th className="py-1.5 px-2.5 border-r border-slate-300 w-20">Lũy Kế (m)</th>
                    <th className="py-1.5 px-2.5 border-r border-slate-300 w-20">KLHĐ (m)</th>
                    <th className="py-1.5 px-2.5 border-r border-slate-300 w-24">Tỉ lệ Hoàn Thành</th>
                    <th className="py-1.5 px-2.5 border-r border-slate-300 w-24">Khối Lượng Bể Cáp</th>
                    <th className="py-1.5 px-2.5 border-r border-slate-300 w-20">KLHĐ (hầm)</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200 font-medium">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-10 text-slate-400">
                        Chưa có nhật ký cho ngày này.{' '}
                        {!selectedDateIsInSchedule ? (
                          <span className="text-slate-400 italic">
                            {currentProject && selectedDate < currentProject.startDate
                              ? 'Dự án chưa bắt đầu trong ngày này.'
                              : currentProject && selectedDate > currentProject.finishDate
                              ? 'Dự án đã kết thúc trong ngày này.'
                              : 'Ngày này ngoài thời gian triển khai.'}
                          </span>
                        ) : isSelectedDateFuture ? (
                          <span className="text-slate-400 italic">
                            (Ngày tương lai chưa đến thời điểm thi công)
                          </span>
                        ) : isAdmin ? (
                          <button
                            onClick={() =>
                              onOpenSupervisorForm(
                                selectedDate,
                                selectedProjectId !== 'all' ? selectedProjectId : undefined,
                                selectedContractorName
                              )
                            }
                            className="text-blue-600 font-bold underline ml-1 hover:text-blue-800"
                          >
                            + Nhập nhật ký ngay (ADMIN)
                          </button>
                        ) : (
                          <button
                            onClick={onOpenLogin}
                            className="text-blue-600 font-bold underline ml-1 hover:text-blue-800"
                          >
                            🔒 Đăng nhập Admin để nhập nhật ký
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((row, idx) => {
                      const trenchPercent =
                        row.contractTrenchM > 0
                          ? ((row.cumulativeTrenchM / row.contractTrenchM) * 100).toFixed(1)
                          : '0.0';
                      const isStopped = isStoppedLog(row);
                      const viol = row.violationReport;
                      const violationPhotoUrls = getViolationPhotoUrls(viol);
                      const dailyPhotoUrls = getDailyLogPhotoUrls(row);

                      return (
                        <tr
                          key={row.id}
                          className={`hover:bg-blue-50/30 transition-colors ${
                            viol?.hasViolation
                              ? 'bg-red-50/60 text-red-950'
                              : isStopped
                              ? 'bg-amber-50/40 text-amber-900'
                              : ''
                          }`}
                        >
                          <td className="py-2.5 px-2 text-center border-r border-slate-200 font-mono text-slate-500">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200 font-semibold text-slate-900">
                            {row.contractorName}
                          </td>
                          <td className="py-2.5 px-3 border-r border-slate-200 text-slate-800">
                            {row.projectName}
                          </td>
                          <td className="py-2.5 px-4 border-r border-slate-200 space-y-1.5">
                            <div>
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs ${
                                  isStopped
                                    ? 'bg-amber-100 text-amber-900 font-semibold'
                                    : 'text-slate-800'
                                }`}
                              >
                                {getResourceDescription(row)}
                              </span>
                            </div>

                            {dailyPhotoUrls.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="text-[9px] font-semibold text-blue-800">
                                  Ảnh báo cáo:
                                </span>
                                {dailyPhotoUrls.map((photoUrl, photoIndex) => (
                                  <button
                                    key={`${photoUrl}-${photoIndex}`}
                                    type="button"
                                    onClick={() => setExpandedViolationPhoto(photoUrl)}
                                    aria-label={`Mở ảnh báo cáo ${photoIndex + 1} toàn màn hình`}
                                    className="h-10 w-12 overflow-hidden rounded-md border border-blue-300 bg-slate-900"
                                  >
                                    <ViolationPhotoImage
                                      src={photoUrl}
                                      alt={`Ảnh báo cáo ${photoIndex + 1}`}
                                      className="h-full w-full object-cover"
                                    />
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Violation Alert Badge in Table with Photo Thumbnail */}
                            {viol?.hasViolation && (
                              <div className="pt-1 space-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedViolationDetail(viol)}
                                  className="w-full text-left bg-red-100 hover:bg-red-200 border border-red-300 text-red-900 p-2 rounded-xl flex items-start justify-between gap-2 transition-colors shadow-2xs"
                                >
                                  <div className="flex items-start gap-1.5 min-w-0">
                                    <FileWarning className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                    <div className="truncate">
                                      <div className="font-bold font-mono text-[10px] flex items-center gap-1">
                                        <span>{viol.code}:</span>
                                        <span className="text-red-700 uppercase font-black">Biên bản sai phạm</span>
                                      </div>
                                      <div className="text-[10px] text-red-800 font-medium truncate">
                                        {viol.violationTypeLabel}
                                      </div>
                                      <div className="text-[9px] text-red-600 italic truncate mt-0.5">
                                        {viol.description}
                                      </div>
                                    </div>
                                  </div>

                                  {violationPhotoUrls.length > 0 && (
                                    <div className="shrink-0 relative group">
                                      <ViolationPhotoImage
                                        src={violationPhotoUrls[0]}
                                        alt="Ảnh sai phạm"
                                        className="w-12 h-10 object-cover rounded-lg border-2 border-red-400 group-hover:scale-105 transition-transform"
                                      />
                                      <span className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full p-0.5 shadow-xs">
                                        {violationPhotoUrls.length > 1
                                          ? <span className="px-1 text-[9px]">{violationPhotoUrls.length}</span>
                                          : <Camera className="w-2.5 h-2.5" />}
                                      </span>
                                    </div>
                                  )}
                                </button>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedViolationDetail(viol)}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 hover:text-red-900 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded border border-red-200 transition-colors"
                                  >
                                    <Camera className="w-3 h-3 text-red-600" />
                                    <span>Xem ảnh hiện trường vi phạm</span>
                                  </button>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => onEditLog(row)}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 transition-colors"
                                    >
                                      <Edit3 className="w-3 h-3 text-blue-600" />
                                      <span>Sửa/Bổ sung ảnh</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {row.notes && !viol?.hasViolation && (
                              <div className="text-[10px] text-slate-400">{row.notes}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center border-r border-slate-200 font-mono">
                            {row.excavationTodayM > 0 ? (
                              <span className="font-bold text-slate-900">{formatNumber(row.excavationTodayM)}</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center border-r border-slate-200 font-mono">
                            {row.chambersPouredToday > 0 ? (
                              <span className="font-bold text-slate-900">{formatNumber(row.chambersPouredToday)}</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2.5 text-right border-r border-slate-200 font-mono text-slate-700">
                            {formatNumber(row.cumulativeTrenchM)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right border-r border-slate-200 font-mono text-slate-700">
                            {formatNumber(row.contractTrenchM)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right border-r border-slate-200 font-mono font-bold text-blue-700">
                            {trenchPercent}%
                          </td>
                          <td className="py-2.5 px-2.5 text-right border-r border-slate-200 font-mono text-slate-700">
                            {formatNumber(row.cumulativeChambers)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right border-r border-slate-200 font-mono text-slate-700">
                            {formatNumber(row.contractChambers)}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {isAdmin ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => onEditLog(row)}
                                  className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
                                  title="Chỉnh sửa dòng này"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => onDeleteLog(row.id)}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                                  title="Xóa dòng này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-300 text-[10px] italic">Chỉ xem</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* Totals Row */}
                {filteredLogs.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                      <td colSpan={4} className="py-2.5 px-4 text-center border-r border-slate-300 uppercase">
                        TỔNG CỘNG
                      </td>
                      <td className="py-2.5 px-2 text-center border-r border-slate-300 font-mono">
                        {formatNumber(totalExcavation)}
                      </td>
                      <td className="py-2.5 px-2 text-center border-r border-slate-300 font-mono">
                        {formatNumber(totalChambersToday)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right border-r border-slate-300 font-mono">
                        {formatNumber(totalCumTrench)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right border-r border-slate-300 font-mono">
                        {formatNumber(totalContractTrench)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right border-r border-slate-300 font-mono text-blue-700">
                        {trenchRate}%
                      </td>
                      <td className="py-2.5 px-2.5 text-right border-r border-slate-300 font-mono">
                        {formatNumber(totalCumChambers)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right border-r border-slate-300 font-mono">
                        {formatNumber(totalContractChambers)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {/* MODAL CHI TIẾT BIÊN BẢN VI PHẠM THIẾT KẾ HIỆN TRƯỜNG */}
      {selectedViolationDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-red-200 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-red-100 mb-4">
              <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
                <FileWarning className="w-5 h-5" />
                <span>BIÊN BẢN XỬ LÝ VI PHẠM THIẾT KẾ</span>
              </div>
              <button
                onClick={() => setSelectedViolationDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="bg-red-50 p-3 rounded-xl border border-red-200 space-y-1">
                <div className="flex items-center justify-between font-mono font-bold text-red-900">
                  <span>Mã: {selectedViolationDetail.code}</span>
                  <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded font-sans">
                    Hạn xử lý: {selectedViolationDetail.deadlineHours}h
                  </span>
                </div>
                <div className="font-bold text-slate-900 text-sm">
                  {selectedViolationDetail.violationTypeLabel}
                </div>
              </div>

              <div>
                <strong className="text-slate-700 block mb-1">Mô tả vi phạm chi tiết:</strong>
                <p className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-800 leading-relaxed">
                  {selectedViolationDetail.description}
                </p>
              </div>

              <div>
                <strong className="text-slate-700 block mb-1">Yêu cầu biện pháp khắc phục:</strong>
                <p className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-800 leading-relaxed font-semibold">
                  {selectedViolationDetail.correctiveAction}
                </p>
              </div>

              {getViolationPhotoUrls(selectedViolationDetail).length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <strong className="text-slate-700 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-red-600" />
                      <span>Ảnh chụp hiện trường vi phạm ({getViolationPhotoUrls(selectedViolationDetail).length}):</span>
                    </strong>
                    <span className="text-[10px] text-slate-400 italic">Chụp bởi KS. Giám sát</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {getViolationPhotoUrls(selectedViolationDetail).map((photoUrl, index) => (
                      <button
                        key={`${photoUrl}-${index}`}
                        type="button"
                        onClick={() => setExpandedViolationPhoto(photoUrl)}
                        aria-label={`Mở ảnh hiện trường ${index + 1} toàn màn hình`}
                        className="group relative h-36 overflow-hidden rounded-xl border border-slate-300 bg-slate-900 text-left shadow-xs"
                      >
                        <ViolationPhotoImage
                          src={photoUrl}
                          alt={`Hiện trường vi phạm ${index + 1}`}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                        <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-2 text-[11px] font-semibold text-white">
                          <span>Ảnh {index + 1}</span>
                          <span className="flex items-center gap-1 underline">
                            <Eye className="h-3 w-3" />
                            <span>Xem</span>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <span>Người lập: <strong>{selectedViolationDetail.supervisorSign}</strong></span>
                <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  {selectedViolationDetail.status === 'pending_fix' ? 'Đang chờ khắc phục' : 'Đã nghiệm thu lại'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
      {expandedViolationPhoto &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 p-2 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Ảnh báo cáo toàn màn hình"
            onClick={() => setExpandedViolationPhoto(null)}
          >
            <button
              type="button"
              aria-label="Đóng ảnh toàn màn hình"
              onClick={() => setExpandedViolationPhoto(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
            >
              <X className="h-6 w-6" />
            </button>
            <div onClick={(event) => event.stopPropagation()}>
              <ViolationPhotoImage
                src={expandedViolationPhoto}
                alt="Ảnh hiện trường vi phạm toàn màn hình"
                className="h-auto max-h-[96vh] w-auto max-w-[98vw] object-contain"
                width={4096}
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
