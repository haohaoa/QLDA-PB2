/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Sidebar, MainNavTab } from './components/Sidebar';
import { OverviewDashboard } from './components/OverviewDashboard';
import { ProjectDailyReport } from './components/ProjectDailyReport';
import { GisMap } from './components/GisMap';
import { BulletinsBoard } from './components/BulletinsBoard';
import { ProjectManagement } from './components/ProjectManagement';
import { SupervisorFormModal } from './components/SupervisorFormModal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { useAppDialog } from './components/AppDialogProvider';
import {
  INITIAL_PROJECTS,
  INITIAL_DAILY_LOGS,
  INITIAL_BULLETINS,
  INITIAL_PLAN_TYPES,
} from './data/initialData';
import { UndergroundProject, DailyLogDraft, DailyLogEntry, PlanType, SiteBulletin } from './types/undergrounding';
import {
  applyDailyLogProgressChange,
  applyDailyLogProgressChanges,
  getContractorKey,
  getLatestProgressLogs,
  removeDailyLogProgress,
  synchronizeProjectProgress,
} from './utils/progressUtils';
import {
  deleteRow,
  fetchDatabase,
  findLegacyAppData,
  isGoogleAppsScript,
  isRemoteDatabaseConfigured,
  migrateInlineDailyLogImages,
  migrateOldJsonToSql,
  saveBatch,
  saveRow,
  verifyEditPassword,
} from './utils/appDataStorage';
import { getCurrentDateKey, isProjectActiveOnDate } from './utils/scheduleUtils';
import { ImportedDailyLog } from './utils/dailyLogExcel';
import { exportDataBackupToExcel, importDataBackupFromExcel } from './utils/dataBackupExcel';
import { hasAssignedProjectContractor } from './utils/projectContractors';

const UNCLASSIFIED_PLAN_TYPE: PlanType = {
  id: 'plan-type-unclassified',
  name: 'Chưa phân loại',
};

const normalizeProjectPlanTypes = (
  projects: UndergroundProject[],
  planTypes: PlanType[]
): UndergroundProject[] =>
  projects.map((project) =>
    planTypes.some((planType) => planType.id === project.planTypeId)
      ? project
      : { ...project, planTypeId: UNCLASSIFIED_PLAN_TYPE.id }
  );

const includeUnclassifiedPlanType = (
  planTypes: PlanType[],
  projects: UndergroundProject[]
): PlanType[] =>
  projects.some((project) => !planTypes.some((planType) => planType.id === project.planTypeId))
    ? [...planTypes.filter((planType) => planType.id !== UNCLASSIFIED_PLAN_TYPE.id), UNCLASSIFIED_PLAN_TYPE]
    : planTypes.filter((planType) => planType.id !== UNCLASSIFIED_PLAN_TYPE.id);

export default function App() {
  const { showAlert, showConfirm } = useAppDialog();
  const shouldReduceMotion = useReducedMotion();
  const isAppsScript = isGoogleAppsScript();
  const usesRemoteDatabase = isAppsScript || isRemoteDatabaseConfigured();
  const today = getCurrentDateKey();

  const [currentTab, setCurrentTab] = useState<MainNavTab>('overview');
  const [dailyReportViewMode, setDailyReportViewMode] = useState<'daily' | 'weekly'>('daily');
  const [showDailyProjectPicker, setShowDailyProjectPicker] = useState(false);
  const [showMapProjectPicker, setShowMapProjectPicker] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedReportContractorKey, setSelectedReportContractorKey] = useState('all');
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    usesRemoteDatabase ? localStorage.getItem('qlda-edit-session') : null
  );
  const [canWriteData, setCanWriteData] = useState(false);
  const isAdmin = !usesRemoteDatabase || canWriteData;
  const [isDataLoaded, setIsDataLoaded] = useState(!usesRemoteDatabase);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [dataSaveError, setDataSaveError] = useState<string | null>(null);
  const [dataSyncNotice, setDataSyncNotice] = useState<string | null>(null);
  const [dataReload, setDataReload] = useState(0);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Core Data States
  const [projects, setProjects] = useState<UndergroundProject[]>(() =>
    synchronizeProjectProgress(
      normalizeProjectPlanTypes(INITIAL_PROJECTS, INITIAL_PLAN_TYPES),
      INITIAL_DAILY_LOGS
    )
  );
  const [dailyLogs, setDailyLogs] = useState<DailyLogEntry[]>(INITIAL_DAILY_LOGS);
  const [bulletins, setBulletins] = useState<SiteBulletin[]>(INITIAL_BULLETINS);
  const [planTypes, setPlanTypes] = useState<PlanType[]>(() =>
    includeUnclassifiedPlanType(INITIAL_PLAN_TYPES, INITIAL_PROJECTS)
  );
  useEffect(() => {
    if (!usesRemoteDatabase) return;

    let isMounted = true;
    fetchDatabase(sessionToken || undefined)
      .then(async (loadedData) => {
        if (!isMounted) return;
        setDataLoadError(null);
        setDataSaveError(null);
        const hasRows = [
          loadedData.projects,
          loadedData.dailyLogs,
          loadedData.bulletins,
          loadedData.planTypes,
        ].some((rows) => rows.length > 0);
        const legacyData = hasRows ? null : findLegacyAppData();
        let data = loadedData;
        if (hasRows && loadedData.canWrite && sessionToken) {
          const migration = await migrateInlineDailyLogImages(sessionToken);
          if (migration.migrated > 0) data = await fetchDatabase(sessionToken);
        }
        if (legacyData && loadedData.canWrite && sessionToken) {
          await migrateOldJsonToSql(legacyData, sessionToken);
          data = await fetchDatabase(sessionToken);
          setDataSyncNotice('Đã chuyển dữ liệu JSON cũ sang các bảng Google Sheets.');
        } else if (legacyData && !loadedData.canWrite) {
          setDataSyncNotice('Đã tìm thấy dữ liệu cũ trên trình duyệt. Đăng nhập Admin để chuyển dữ liệu lên Google Sheets.');
        }

        if (
          !hasRows &&
          !legacyData &&
          !loadedData.isInitialized &&
          loadedData.canWrite &&
          sessionToken
        ) {
          await Promise.all([
            saveBatch('projects', INITIAL_PROJECTS, sessionToken),
            saveBatch('dailyLogs', INITIAL_DAILY_LOGS, sessionToken),
            saveBatch('bulletins', INITIAL_BULLETINS, sessionToken),
            saveBatch('planTypes', INITIAL_PLAN_TYPES, sessionToken),
          ]);
          data = await fetchDatabase(sessionToken);
        }

        const hasDatabaseRows = [
          data.projects,
          data.dailyLogs,
          data.bulletins,
          data.planTypes,
        ].some((rows) => rows.length > 0);
        const useInitialData = !data.isInitialized && !hasDatabaseRows;
        const loadedProjects = useInitialData ? INITIAL_PROJECTS : data.projects;
        const loadedDailyLogs = useInitialData ? INITIAL_DAILY_LOGS : data.dailyLogs;
        const loadedPlanTypes = useInitialData
          ? INITIAL_PLAN_TYPES
          : data.planTypes;
        const normalizedProjects = normalizeProjectPlanTypes(loadedProjects, loadedPlanTypes);
        setDailyLogs(loadedDailyLogs);
        setProjects(synchronizeProjectProgress(normalizedProjects, loadedDailyLogs));
        setBulletins(useInitialData ? INITIAL_BULLETINS : data.bulletins);
        setPlanTypes(includeUnclassifiedPlanType(loadedPlanTypes, normalizedProjects));
        setCanWriteData(data.canWrite);
        if (!data.canWrite && sessionToken) {
          localStorage.removeItem('qlda-edit-session');
          setSessionToken(null);
        }
        setIsDataLoaded(true);
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setDataLoadError(
          error instanceof Error ? error.message : 'Không thể tải dữ liệu từ Google Sheets.'
        );
      });

    return () => {
      isMounted = false;
    };
  }, [usesRemoteDatabase, sessionToken, dataReload]);

  const confirmChange = (action: string) => showConfirm(`Bạn có chắc chắn muốn ${action} không?`);
  const withDataWrite = async <T,>(write: () => Promise<T>): Promise<T> => {
    try {
      const result = await write();
      setDataSaveError(null);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Phiên chỉnh sửa đã hết hạn')) {
        localStorage.removeItem('qlda-edit-session');
        setSessionToken(null);
        setCanWriteData(false);
      }
      setDataSaveError(
        error instanceof Error ? error.message : 'Không thể lưu dữ liệu vào Google Sheets.'
      );
      throw error;
    }
  };
  const persistRows = async <T extends { id: string },>(
    table: 'projects' | 'dailyLogs' | 'bulletins' | 'planTypes',
    rows: T[]
  ) => {
    if (!usesRemoteDatabase || rows.length === 0) return;
    if (!sessionToken) throw new Error('Hãy đăng nhập Admin trước khi lưu dữ liệu.');
    await withDataWrite(() => saveBatch(table, rows, sessionToken));
  };
  const persistRow = async <T extends { id: string },>(
    table: 'projects' | 'dailyLogs' | 'bulletins' | 'planTypes',
    row: T
  ) => {
    if (!usesRemoteDatabase) return;
    if (!sessionToken) throw new Error('Hãy đăng nhập Admin trước khi lưu dữ liệu.');
    await withDataWrite(() => saveRow(table, row, sessionToken));
  };
  const persistDelete = async (
    table: 'projects' | 'dailyLogs' | 'bulletins' | 'planTypes',
    id: string
  ) => {
    if (!usesRemoteDatabase) return;
    if (!sessionToken) throw new Error('Hãy đăng nhập Admin trước khi xóa dữ liệu.');
    await withDataWrite(() => deleteRow(table, id, sessionToken));
  };

  // Calculate today unsubmitted project count
  const activeProjectsToday = projects.filter((project) => isProjectActiveOnDate(project, today));
  const activeProjectIdsToday = new Set(activeProjectsToday.map((project) => project.id));
  const todayLogs = dailyLogs.filter(
    (log) => log.date === today && activeProjectIdsToday.has(log.projectId)
  );
  const unsubmittedTodayCount = activeProjectsToday.reduce((missingCount, project) => {
    const contractors = project.contractors || [];
    if (contractors.length === 0) {
      return missingCount + (todayLogs.some((log) => log.projectId === project.id) ? 0 : 1);
    }

    const projectLogs = todayLogs.filter((log) => log.projectId === project.id);
    return missingCount + contractors.filter(
      (contractor) =>
        !projectLogs.some(
          (log) => getContractorKey(log.contractorName) === getContractorKey(contractor.name)
        )
    ).length;
  }, 0);
  const activeBulletinsCount = bulletins.filter((b) => b.isActive).length;

  // Supervisor / Admin Field Form Modal
  const [isSupervisorModalOpen, setIsSupervisorModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<DailyLogEntry | null>(null);
  const [prefilledContractorName, setPrefilledContractorName] = useState<string | undefined>();
  const [supervisorFormRequestId, setSupervisorFormRequestId] = useState(0);

  // Daily Log Handlers
  const handleSaveLog = async (entryData: DailyLogDraft): Promise<boolean> => {
    const serverData = usesRemoteDatabase ? await fetchDatabase(sessionToken || undefined) : null;
    const hasServerRows = !!serverData && [
      serverData.projects,
      serverData.dailyLogs,
      serverData.bulletins,
      serverData.planTypes,
    ].some((rows) => rows.length > 0);
    const useServerData = !!serverData && (serverData.isInitialized || hasServerRows);
    const serverProjects = useServerData ? serverData.projects : projects;
    const serverDailyLogs = useServerData ? serverData.dailyLogs : dailyLogs;
    const serverPlanTypes = useServerData ? serverData.planTypes : planTypes;
    const freshProjects = synchronizeProjectProgress(
      normalizeProjectPlanTypes(serverProjects, serverPlanTypes),
      serverDailyLogs
    );
    const freshPlanTypes = includeUnclassifiedPlanType(serverPlanTypes, freshProjects);
    const contractorKey = getContractorKey(entryData.contractorName);
    const duplicate = serverDailyLogs.find(
      (log) =>
        log.id !== editingLog?.id &&
        log.date === entryData.date &&
        log.projectId === entryData.projectId &&
        getContractorKey(log.contractorName) === contractorKey
    );
    const currentEditingLog = editingLog
      ? serverDailyLogs.find((log) => log.id === editingLog.id)
      : undefined;
    const editingLogChanged =
      !!editingLog &&
      (!currentEditingLog ||
        JSON.stringify(currentEditingLog) !== JSON.stringify(editingLog));

    if (duplicate || editingLogChanged) {
      setProjects(freshProjects);
      setDailyLogs(serverDailyLogs);
      setPlanTypes(freshPlanTypes);
      setDataSyncNotice(
        duplicate
          ? `Báo cáo ngày ${entryData.date} của nhà thầu này đã được người khác lưu. Vui lòng kiểm tra báo cáo mới nhất trước khi nhập tiếp.`
          : 'Báo cáo đang chỉnh sửa đã được người khác thay đổi hoặc xóa. Đã tải dữ liệu mới nhất; vui lòng mở lại báo cáo.'
      );
      throw new Error(
        duplicate
          ? `Đã có báo cáo ngày ${entryData.date} cho nhà thầu ${entryData.contractorName} trong dự án ${entryData.projectName}. Hệ thống đã chặn lưu trùng.`
          : 'Báo cáo này đã được người khác cập nhật hoặc xóa. Hệ thống đã chặn ghi đè.'
      );
    }

    const reportProject = freshProjects.find((project) => project.id === entryData.projectId);
    if (!editingLog && reportProject && !hasAssignedProjectContractor(reportProject)) {
      throw new Error(
        'Dự án chưa được phân công nhà thầu thi công. Vui lòng phân công nhà thầu trước khi báo cáo tiến độ.'
      );
    }

    const sameDayProjectLogs = serverDailyLogs.filter(
      (log) => log.date === entryData.date && log.projectId === entryData.projectId
    );
    const previousLog = currentEditingLog;
    if (
      !(await confirmChange(
        `${previousLog ? 'cập nhật' : 'thêm'} báo cáo ngày ${entryData.date} của dự án ${entryData.projectName}`
      ))
    ) {
      return false;
    }

    const logsWithoutEdited = previousLog
      ? serverDailyLogs.filter((log) => log.id !== previousLog.id)
      : serverDailyLogs;
    const latestProjectLogs = getLatestProgressLogs(logsWithoutEdited).filter(
      (log) => log.projectId === entryData.projectId
    );
    const existingContractLog = latestProjectLogs.find(
      (log) => getContractorKey(log.contractorName) === contractorKey
    );
    const otherContractLogs = latestProjectLogs.filter(
      (log) => getContractorKey(log.contractorName) !== contractorKey
    );
    const assignedContractor = reportProject?.contractors?.find(
      (contractor) => getContractorKey(contractor.name) === contractorKey
    );
    const updatedEntry: DailyLogEntry = {
      ...entryData,
      id: previousLog?.id || `log-${crypto.randomUUID()}`,
      stt: previousLog?.stt ?? Math.max(0, ...sameDayProjectLogs.map((log) => log.stt)) + 1,
      contractTrenchM:
        existingContractLog?.contractTrenchM ??
        assignedContractor?.totalLengthM ??
        Math.max(
          0,
          (reportProject?.totalLengthM ?? entryData.contractTrenchM) -
            otherContractLogs.reduce((total, log) => total + log.contractTrenchM, 0)
        ),
      contractChambers:
        existingContractLog?.contractChambers ??
        assignedContractor?.totalChambers ??
        Math.max(
          0,
          (reportProject?.totalChambers ?? entryData.contractChambers) -
            otherContractLogs.reduce((total, log) => total + log.contractChambers, 0)
        ),
      cumulativeTrenchM: previousLog?.cumulativeTrenchM ?? 0,
      cumulativeChambers: previousLog?.cumulativeChambers ?? 0,
    };
    const nextDailyLogs = applyDailyLogProgressChange(serverDailyLogs, updatedEntry, previousLog);
    const nextProjects = synchronizeProjectProgress(freshProjects, nextDailyLogs);
    const changedProjects = nextProjects.filter(
      (project) =>
        JSON.stringify(project) !==
        JSON.stringify(freshProjects.find((item) => item.id === project.id))
    );
    setDailyLogs(nextDailyLogs);
    setProjects(nextProjects);
    setPlanTypes(freshPlanTypes);
    try {
      await Promise.all([
        persistRow('dailyLogs', updatedEntry),
        persistRows('projects', changedProjects),
      ]);
    } catch (error) {
      setDailyLogs(serverDailyLogs);
      setProjects(freshProjects);
      throw error;
    }
    if (editingLog) setEditingLog(null);
    return true;
  };

  const handleAddPlanType = async (planType: PlanType): Promise<boolean> => {
    if (planTypes.some((item) => item.name.trim().toLocaleLowerCase() === planType.name.trim().toLocaleLowerCase())) {
      await showAlert('Loại kế hoạch này đã tồn tại.');
      return false;
    }
    if (!(await confirmChange(`thêm loại kế hoạch “${planType.name}”`))) return false;
    const previous = planTypes;
    setPlanTypes((prev) => [...prev, planType]);
    try {
      await persistRow('planTypes', planType);
    } catch (error) {
      setPlanTypes(previous);
      throw error;
    }
    return true;
  };

  const handleUpdatePlanType = async (updatedPlanType: PlanType): Promise<boolean> => {
    if (
      planTypes.some(
        (item) =>
          item.id !== updatedPlanType.id &&
          item.name.trim().toLocaleLowerCase() === updatedPlanType.name.trim().toLocaleLowerCase()
      )
    ) {
      await showAlert('Loại kế hoạch này đã tồn tại.');
      return false;
    }
    if (!(await confirmChange(`đổi tên loại kế hoạch thành “${updatedPlanType.name}”`))) return false;
    const previous = planTypes;
    setPlanTypes((prev) => prev.map((item) => (item.id === updatedPlanType.id ? updatedPlanType : item)));
    try {
      await persistRow('planTypes', updatedPlanType);
    } catch (error) {
      setPlanTypes(previous);
      throw error;
    }
    return true;
  };

  const handleDeletePlanType = async (planTypeId: string): Promise<boolean> => {
    const planType = planTypes.find((item) => item.id === planTypeId);
    if (!planType || planTypeId === UNCLASSIFIED_PLAN_TYPE.id || planTypes.length <= 1) return false;
    if (!(await confirmChange(`xóa loại kế hoạch “${planType.name}”`))) return false;
    const previous = planTypes;
    setPlanTypes((prev) => prev.filter((item) => item.id !== planTypeId));
    try {
      await persistDelete('planTypes', planTypeId);
    } catch (error) {
      setPlanTypes(previous);
      throw error;
    }
    return true;
  };

  const handleDeleteLog = async (id: string) => {
    const log = dailyLogs.find((item) => item.id === id);
    if (!log || !(await confirmChange(`xóa báo cáo ngày ${log.date} của dự án ${log.projectName}`))) return;
    const previousLogs = dailyLogs;
    const previousProjects = projects;
    const nextDailyLogs = removeDailyLogProgress(dailyLogs, log);
    const nextProjects = synchronizeProjectProgress(projects, nextDailyLogs);
    const changedProjects = nextProjects.filter(
      (project) =>
        JSON.stringify(project) !==
        JSON.stringify(projects.find((item) => item.id === project.id))
    );
    setDailyLogs(nextDailyLogs);
    setProjects(nextProjects);
    try {
      await Promise.all([
        persistDelete('dailyLogs', id),
        persistRows('projects', changedProjects),
      ]);
    } catch (error) {
      setDailyLogs(previousLogs);
      setProjects(previousProjects);
      setDataReload((current) => current + 1);
      throw error;
    }
  };

  const handleImportDailyLogs = async (importedLogs: ImportedDailyLog[]) => {
    if (!isAdmin) throw new Error('Bạn cần đăng nhập Admin để nhập báo cáo Excel.');
    const projectsWithoutContractors = new Set(
      importedLogs
        .map((entry) => entry.projectId)
        .filter((projectId) => {
          const project = projects.find((item) => item.id === projectId);
          return !!project && !hasAssignedProjectContractor(project);
        })
    );
    if (projectsWithoutContractors.size > 0) {
      const projectNames = projects
        .filter((project) => projectsWithoutContractors.has(project.id))
        .map((project) => project.name)
        .join(', ');
      await showAlert(
        `Không thể nhập báo cáo vì dự án chưa được phân công nhà thầu thi công: ${projectNames}. Vui lòng phân công nhà thầu trước.`
      );
      return null;
    }

    const makeGroupKey = (projectId: string, contractorName: string) =>
      `${projectId}:${getContractorKey(contractorName)}`;
    const makeRecordKey = (date: string, projectId: string, contractorName: string) =>
      `${date}:${makeGroupKey(projectId, contractorName)}`;
    const existingByRecordKey = new Map(
      dailyLogs.map((log) => [makeRecordKey(log.date, log.projectId, log.contractorName), log])
    );
    const addedCount = importedLogs.filter(
      (entry) =>
        !existingByRecordKey.has(makeRecordKey(entry.date, entry.projectId, entry.contractorName))
    ).length;
    const updatedCount = importedLogs.length - addedCount;
    if (
      !(await confirmChange(
        `nhập ${importedLogs.length} báo cáo Excel (${addedCount} mới, ${updatedCount} cập nhật; bản ghi trùng ngày/dự án/nhà thầu sẽ được cập nhật)`
      ))
    ) {
      return null;
    }

    const maxSttByProjectDate = new Map<string, number>();
    for (const log of dailyLogs) {
      const key = `${log.date}:${log.projectId}`;
      maxSttByProjectDate.set(key, Math.max(maxSttByProjectDate.get(key) || 0, log.stt));
    }

    const latestContractByGroup = new Map<
      string,
      { contractTrenchM: number; contractChambers: number }
    >();
    const allocatedContractsByProject = new Map<
      string,
      { contractTrenchM: number; contractChambers: number }
    >();
    for (const log of getLatestProgressLogs(dailyLogs)) {
      const groupKey = makeGroupKey(log.projectId, log.contractorName);
      latestContractByGroup.set(groupKey, {
        contractTrenchM: log.contractTrenchM,
        contractChambers: log.contractChambers,
      });
      const allocated = allocatedContractsByProject.get(log.projectId) || {
        contractTrenchM: 0,
        contractChambers: 0,
      };
      allocatedContractsByProject.set(log.projectId, {
        contractTrenchM: allocated.contractTrenchM + log.contractTrenchM,
        contractChambers: allocated.contractChambers + log.contractChambers,
      });
    }

    const changes: DailyLogEntry[] = [];
    const projectById = new Map(projects.map((project) => [project.id, project]));
    for (const entry of [...importedLogs].sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.projectId.localeCompare(right.projectId) ||
        getContractorKey(left.contractorName).localeCompare(getContractorKey(right.contractorName))
    )) {
      const recordKey = makeRecordKey(entry.date, entry.projectId, entry.contractorName);
      const groupKey = makeGroupKey(entry.projectId, entry.contractorName);
      const existingLog = existingByRecordKey.get(recordKey);
      const sameContractorLatest = latestContractByGroup.get(groupKey);
      const allocated = allocatedContractsByProject.get(entry.projectId) || {
        contractTrenchM: 0,
        contractChambers: 0,
      };
      const project = projectById.get(entry.projectId);
      const contractTrenchM =
        entry.contractTrenchM ??
        sameContractorLatest?.contractTrenchM ??
        Math.max(0, (project?.totalLengthM ?? 0) - allocated.contractTrenchM);
      const contractChambers =
        entry.contractChambers ??
        sameContractorLatest?.contractChambers ??
        Math.max(0, (project?.totalChambers ?? 0) - allocated.contractChambers);
      const dayKey = `${entry.date}:${entry.projectId}`;
      const stt = existingLog?.stt ?? (maxSttByProjectDate.get(dayKey) || 0) + 1;
      const importedEntry: DailyLogEntry = {
        ...existingLog,
        ...entry,
        id: existingLog?.id || `log-${crypto.randomUUID()}`,
        stt,
        contractTrenchM,
        contractChambers,
        cumulativeTrenchM: existingLog?.cumulativeTrenchM ?? 0,
        cumulativeChambers: existingLog?.cumulativeChambers ?? 0,
      };

      if (!existingLog) {
        existingByRecordKey.set(recordKey, importedEntry);
        maxSttByProjectDate.set(dayKey, stt);
      }
      const priorContract = latestContractByGroup.get(groupKey);
      allocatedContractsByProject.set(entry.projectId, {
        contractTrenchM:
          allocated.contractTrenchM + contractTrenchM - (priorContract?.contractTrenchM || 0),
        contractChambers:
          allocated.contractChambers + contractChambers - (priorContract?.contractChambers || 0),
      });
      latestContractByGroup.set(groupKey, { contractTrenchM, contractChambers });
      changes.push(importedEntry);
    }

    const nextDailyLogs = applyDailyLogProgressChanges(dailyLogs, changes);
    const nextProjects = synchronizeProjectProgress(projects, nextDailyLogs);
    const changedProjects = nextProjects.filter(
      (project) =>
        JSON.stringify(project) !==
        JSON.stringify(projects.find((item) => item.id === project.id))
    );
    setDailyLogs(nextDailyLogs);
    setProjects(nextProjects);
    try {
      await Promise.all([
        persistRows('dailyLogs', changes),
        persistRows('projects', changedProjects),
      ]);
    } catch (error) {
      setDataReload((current) => current + 1);
      throw error;
    }
    return { added: addedCount, updated: updatedCount };
  };

  const handleExportBackup = () =>
    exportDataBackupToExcel({ projects, dailyLogs, bulletins, planTypes });

  const handleImportBackup = async (file: File) => {
    if (!isAdmin) throw new Error('Bạn cần đăng nhập Admin để khôi phục dữ liệu.');
    const backup = await importDataBackupFromExcel(file);
    const normalizedProjects = normalizeProjectPlanTypes(backup.projects, backup.planTypes);
    const restoredPlanTypes = includeUnclassifiedPlanType(backup.planTypes, normalizedProjects);
    const restoredProjects = synchronizeProjectProgress(normalizedProjects, backup.dailyLogs);
    const previousData = { projects, dailyLogs, bulletins, planTypes };
    setProjects(restoredProjects);
    setDailyLogs(backup.dailyLogs);
    setBulletins(backup.bulletins);
    setPlanTypes(restoredPlanTypes);
    setSelectedProjectId('all');
    const replaceTable = async <T extends { id: string },>(
      table: 'projects' | 'dailyLogs' | 'bulletins' | 'planTypes',
      previousRows: T[],
      nextRows: T[]
    ) => {
      await Promise.all(
        previousRows
          .filter((row) => !nextRows.some((nextRow) => nextRow.id === row.id))
          .map((row) => persistDelete(table, row.id))
      );
      await persistRows(table, nextRows);
    };
    try {
      await Promise.all([
        replaceTable('projects', previousData.projects, restoredProjects),
        replaceTable('dailyLogs', previousData.dailyLogs, backup.dailyLogs),
        replaceTable('bulletins', previousData.bulletins, backup.bulletins),
        replaceTable('planTypes', previousData.planTypes, restoredPlanTypes),
      ]);
    } catch (error) {
      setDataReload((current) => current + 1);
      throw error;
    }
    return {
      projects: restoredProjects.length,
      dailyLogs: backup.dailyLogs.length,
      bulletins: backup.bulletins.length,
      planTypes: restoredPlanTypes.length,
    };
  };

  const handleEditLog = (log: DailyLogEntry) => {
    setEditingLog(log);
    setSupervisorFormRequestId((current) => current + 1);
    setIsSupervisorModalOpen(true);
  };

  const handleOpenSupervisorForm = (
    prefillDate?: string,
    prefillProjectId?: string,
    contractorName?: string
  ) => {
    if (prefillProjectId) {
      const project = projects.find((item) => item.id === prefillProjectId);
      if (project && !hasAssignedProjectContractor(project)) {
        void showAlert(
          'Dự án chưa được phân công nhà thầu thi công. Vui lòng phân công nhà thầu trước khi báo cáo tiến độ.'
        );
        return;
      }
    }
    if (prefillDate) setSelectedDate(prefillDate);
    if (prefillProjectId && prefillProjectId !== 'all') setSelectedProjectId(prefillProjectId);
    setPrefilledContractorName(contractorName);
    setEditingLog(null);
    setSupervisorFormRequestId((current) => current + 1);
    setIsSupervisorModalOpen(true);
  };

  // Bulletin Handlers
  const handleAddBulletin = async (newB: SiteBulletin): Promise<boolean> => {
    if (!(await confirmChange(`thêm thông báo “${newB.title}”`))) return false;
    const previous = bulletins;
    setBulletins((prev) => [newB, ...prev]);
    try {
      await persistRow('bulletins', newB);
    } catch (error) {
      setBulletins(previous);
      throw error;
    }
    return true;
  };

  const handleUpdateBulletin = async (updB: SiteBulletin): Promise<boolean> => {
    if (!(await confirmChange(`cập nhật thông báo “${updB.title}”`))) return false;
    const previous = bulletins;
    setBulletins((prev) => prev.map((b) => (b.id === updB.id ? updB : b)));
    try {
      await persistRow('bulletins', updB);
    } catch (error) {
      setBulletins(previous);
      throw error;
    }
    return true;
  };

  const handleDeleteBulletin = async (id: string) => {
    const bulletin = bulletins.find((item) => item.id === id);
    if (!bulletin || !(await confirmChange(`xóa thông báo “${bulletin.title}”`))) return;
    const previous = bulletins;
    setBulletins((prev) => prev.filter((b) => b.id !== id));
    try {
      await persistDelete('bulletins', id);
    } catch (error) {
      setBulletins(previous);
      throw error;
    }
  };

  // Project Handlers
  const handleAddProject = async (newProject: UndergroundProject): Promise<boolean> => {
    if (!(await confirmChange(`thêm dự án “${newProject.name}”`))) return false;
    const previous = projects;
    setProjects((prev) => [newProject, ...prev]);
    try {
      await persistRow('projects', newProject);
    } catch (error) {
      setProjects(previous);
      throw error;
    }
    return true;
  };

  const handleUpdateProject = async (updatedProject: UndergroundProject): Promise<boolean> => {
    if (!(await confirmChange(`cập nhật dự án “${updatedProject.name}”`))) return false;
    const previous = projects;
    setProjects((prev) =>
      prev.map((p) => (p.id === updatedProject.id ? updatedProject : p))
    );
    try {
      await persistRow('projects', updatedProject);
    } catch (error) {
      setProjects(previous);
      throw error;
    }
    return true;
  };

  const handleDeleteProject = async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project || !(await confirmChange(`xóa dự án “${project.name}”`))) return;
    const previous = projects;
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    try {
      await persistDelete('projects', projectId);
    } catch (error) {
      setProjects(previous);
      throw error;
    }
    if (selectedProjectId === projectId) {
      setSelectedProjectId('all');
    }
  };

  const activeProject = projects.find((p) => p.id === selectedProjectId);
  const contentTransitionKey = `${currentTab}:${
    currentTab === 'daily-report'
      ? showDailyProjectPicker
      : currentTab === 'gis-map'
      ? showMapProjectPicker
      : 'content'
  }`;

  if (usesRemoteDatabase && !isDataLoaded && !dataLoadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-600">
        Đang tải dữ liệu từ Google Sheets...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-900 font-sans flex flex-col lg:flex-row antialiased">
      {/* 1. Left Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'daily-report') {
            setSelectedProjectId('all');
            setSelectedReportContractorKey('all');
            setDailyReportViewMode('daily');
            setShowDailyProjectPicker(true);
            setShowMapProjectPicker(false);
          } else if (tab === 'gis-map') {
            setShowDailyProjectPicker(false);
            setShowMapProjectPicker(true);
          } else {
            setShowDailyProjectPicker(false);
            setShowMapProjectPicker(false);
          }
          setCurrentTab(tab);
        }}
        activeProjectName={activeProject?.name}
        totalProjects={projects.length}
        isAdmin={isAdmin}
        requiresLogin={usesRemoteDatabase}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        onOpenQuickEntry={() => handleOpenSupervisorForm(today)}
        unsubmittedTodayCount={unsubmittedTodayCount}
        bulletinsCount={activeBulletinsCount}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onLogout={() => {
          localStorage.removeItem('qlda-edit-session');
          setSessionToken(null);
          setCanWriteData(false);
          setDataSaveError(null);
        }}
      />

      {/* 2. Main Content Viewport */}
      <div className="flex-1 lg:pl-72 flex flex-col min-w-0">
        {/* Viewport Body */}
        <main className="flex-1 max-w-7xl w-full min-w-0 mx-auto overflow-x-hidden p-2.5 pb-20 sm:p-6 sm:pb-24 lg:p-8 lg:pb-8">
          {dataSyncNotice && (
            <div
              role="status"
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <span>{dataSyncNotice}</span>
              <button
                type="button"
                onClick={() => setDataSyncNotice(null)}
                className="rounded-lg border border-amber-300 px-3 py-1.5 font-semibold hover:bg-amber-100"
              >
                Đã hiểu
              </button>
            </div>
          )}
          {(dataLoadError || dataSaveError) && (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <span>
                {dataLoadError
                  ? `Không thể kết nối hoặc đọc dữ liệu Google Sheets: ${dataLoadError}`
                  : `Không thể lưu dữ liệu Google Sheets: ${dataSaveError}`}
              </span>
              {dataSaveError && (
                <button
                  type="button"
                  onClick={() => setDataReload((current) => current + 1)}
                  className="rounded-lg border border-red-300 px-3 py-1.5 font-semibold hover:bg-red-100"
                >
                  Tải lại dữ liệu
                </button>
              )}
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={contentTransitionKey}
            initial={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, filter: 'blur(8px)', x: 12 }
            }
            animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, filter: 'blur(6px)', x: -8 }
            }
            transition={{
              duration: shouldReduceMotion ? 0 : 0.32,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
          {/* TAB 1: TỔNG QUAN */}
          {currentTab === 'overview' && (
            <OverviewDashboard
              projects={projects}
              planTypes={planTypes}
              dailyLogs={dailyLogs}
              bulletins={bulletins}
              currentDate={today}
              onGoToMap={(projectId) => {
                setSelectedProjectId(projectId);
                setShowMapProjectPicker(false);
                setCurrentTab('gis-map');
              }}
              onGoToBulletins={(projectId) => {
                if (projectId) setSelectedProjectId(projectId);
                setCurrentTab('bulletins');
              }}
            />
          )}

          {/* TAB 2: BÁO CÁO NGÀY & TUẦN (Danh sách các tuần tra cứu lịch sử, Lịch tháng 10, nổi bật ngày 16, bảng Excel) */}
          {currentTab === 'daily-report' && (
            <ProjectDailyReport
              projects={projects}
              planTypes={planTypes}
              dailyLogs={dailyLogs}
              bulletins={bulletins}
              selectedProjectId={selectedProjectId}
              onSelectProjectId={(projectId) => {
                setSelectedProjectId(projectId);
                setSelectedReportContractorKey('all');
              }}
              selectedContractorKey={selectedReportContractorKey}
              onSelectContractorKey={setSelectedReportContractorKey}
              showProjectPicker={showDailyProjectPicker}
              onChooseProject={(projectId, contractorKey) => {
                setSelectedProjectId(projectId);
                setSelectedReportContractorKey(contractorKey || 'all');
                setShowDailyProjectPicker(false);
                setShowMapProjectPicker(false);
              }}
              onShowProjectPicker={() => {
                setSelectedProjectId('all');
                setSelectedReportContractorKey('all');
                setShowDailyProjectPicker(true);
                setShowMapProjectPicker(false);
              }}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              initialViewMode={dailyReportViewMode}
              isAdmin={isAdmin}
              onOpenSupervisorForm={handleOpenSupervisorForm}
              onEditLog={handleEditLog}
              onDeleteLog={handleDeleteLog}
              onImportDailyLogs={handleImportDailyLogs}
              onGoToBulletins={(projectId) => {
                if (projectId) setSelectedProjectId(projectId);
                setCurrentTab('bulletins');
              }}
              onOpenLogin={() => setIsLoginModalOpen(true)}
            />
          )}

          {/* TAB 3: BẢN ĐỒ TUYẾN & ĐIỂM CUA UỐN (Leaflet Map, mốc bắt đầu, góc cua, kết thúc) */}
          {currentTab === 'gis-map' && (
            <div className="space-y-2.5 sm:space-y-4">
              <div className="hidden sm:block rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
                <h2 className="text-lg font-bold tracking-tight text-slate-900">Bản đồ tuyến ngầm</h2>
              </div>

              <GisMap
                projects={projects}
                planTypes={planTypes}
                selectedProjectId={selectedProjectId !== 'all' ? selectedProjectId : undefined}
                onSelectProject={(id) => setSelectedProjectId(id)}
                showProjectPicker={showMapProjectPicker}
                onChooseProject={(projectId) => {
                  setSelectedProjectId(projectId);
                  setShowMapProjectPicker(false);
                }}
                onShowProjectPicker={() => {
                  setShowMapProjectPicker(true);
                }}
              />
            </div>
          )}

          {/* TAB 4: THÔNG BÁO & CẢNH BÁO HỒ SƠ PHÁP LÝ (Tin tức mưa bão, tạm dừng thi công, giấy phép Sở GTVT) */}
          {currentTab === 'bulletins' && (
            <BulletinsBoard
              bulletins={bulletins}
              projects={projects}
              onAddBulletin={handleAddBulletin}
              onUpdateBulletin={handleUpdateBulletin}
              onDeleteBulletin={handleDeleteBulletin}
              onSelectProjectDetail={(projectId) => {
                setSelectedProjectId(projectId);
                setCurrentTab('daily-report');
              }}
              isAdmin={isAdmin}
              filterInitialProjectId={selectedProjectId}
              onOpenLogin={() => setIsLoginModalOpen(true)}
            />
          )}

          {/* TAB 5: TẠO & QUẢN LÝ DỰ ÁN NGẦM HÓA (Đã bỏ gói thầu & liên danh nhà thầu, phân quyền Admin) */}
          {currentTab === 'project-management' && (
            <ProjectManagement
              projects={projects}
              dailyLogs={dailyLogs}
              planTypes={planTypes}
              onExportBackup={handleExportBackup}
              onImportBackup={handleImportBackup}
              onAddPlanType={handleAddPlanType}
              onUpdatePlanType={handleUpdatePlanType}
              onDeletePlanType={handleDeletePlanType}
              onAddProject={handleAddProject}
              onUpdateProject={handleUpdateProject}
              onDeleteProject={handleDeleteProject}
              onSelectProjectOnMap={(projectId) => {
                setSelectedProjectId(projectId);
                setShowMapProjectPicker(false);
                setCurrentTab('gis-map');
              }}
              isAdmin={isAdmin}
              onOpenLogin={() => setIsLoginModalOpen(true)}
            />
          )}
          </motion.div>
          </AnimatePresence>
        </main>

        {/* Supervisor / Admin Daily Entry Modal with Violation Report */}
        <SupervisorFormModal
          key={supervisorFormRequestId}
          isOpen={isSupervisorModalOpen}
          onClose={() => {
            setIsSupervisorModalOpen(false);
            setEditingLog(null);
            setPrefilledContractorName(undefined);
          }}
          onSave={handleSaveLog}
          projects={projects}
          editingLog={editingLog}
          defaultDate={selectedDate}
          defaultProjectId={selectedProjectId !== 'all' ? selectedProjectId : undefined}
          defaultContractorName={prefilledContractorName}
          sessionToken={sessionToken || undefined}
        />

        <AdminLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          isAuthenticated={isAdmin}
          onLogin={async (password) => {
            if (usesRemoteDatabase) {
              const { token } = await verifyEditPassword(password);
              localStorage.setItem('qlda-edit-session', token);
              setIsDataLoaded(false);
              setCanWriteData(true);
              setSessionToken(token);
            } else {
              throw new Error('Đăng nhập chỉnh sửa chỉ hoạt động trong ứng dụng đã triển khai lên Google Apps Script.');
            }
            setDataSaveError(null);
          }}
          onLogout={() => {
            localStorage.removeItem('qlda-edit-session');
            setSessionToken(null);
            setCanWriteData(false);
            setDataSaveError(null);
            setIsLoginModalOpen(false);
          }}
        />
      </div>
    </div>
  );
}
