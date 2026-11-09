import { DailyLogEntry, UndergroundProject } from '../types/undergrounding';

type ProgressGroup = Pick<DailyLogEntry, 'projectId' | 'contractorName'>;

interface IndexedLog {
  index: number;
  log: DailyLogEntry;
}

export function getDailyTrenchOutput(log: Pick<DailyLogEntry, 'excavationTodayM' | 'pipeLaidTodayM'>): number {
  const excavation = log.excavationTodayM || 0;
  return excavation > 0 ? excavation : log.pipeLaidTodayM || 0;
}

export function getContractorKey(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  return normalized.includes('minhngoc') ? 'minhngoc' : normalized;
}

function sameProgressGroup(left: ProgressGroup, right: ProgressGroup): boolean {
  return left.projectId === right.projectId && getContractorKey(left.contractorName) === getContractorKey(right.contractorName);
}

function compareLogOrder(left: DailyLogEntry, right: DailyLogEntry): number {
  return left.date.localeCompare(right.date) || left.stt - right.stt || left.id.localeCompare(right.id);
}

function getGroupLogs(logs: DailyLogEntry[], group: ProgressGroup): IndexedLog[] {
  return logs
    .map((log, index) => ({ log, index }))
    .filter(({ log }) => sameProgressGroup(log, group))
    .sort((left, right) => compareLogOrder(left.log, right.log));
}

function shiftLogs(
  logs: DailyLogEntry[],
  groupLogs: IndexedLog[],
  startIndex: number,
  trenchDelta: number,
  chamberDelta: number
): DailyLogEntry[] {
  const updatedLogs = [...logs];

  for (let index = startIndex; index < groupLogs.length; index += 1) {
    const { index: logIndex, log } = groupLogs[index];
    updatedLogs[logIndex] = {
      ...log,
      cumulativeTrenchM: log.cumulativeTrenchM + trenchDelta,
      cumulativeChambers: log.cumulativeChambers + chamberDelta,
    };
  }

  return updatedLogs;
}

function removeLogAndShiftLater(logs: DailyLogEntry[], logToRemove: DailyLogEntry): DailyLogEntry[] {
  const groupLogs = getGroupLogs(logs, logToRemove);
  const removedIndex = groupLogs.findIndex(({ log }) => log.id === logToRemove.id);
  if (removedIndex < 0) return logs;

  const removed = groupLogs[removedIndex].log;
  const previous = groupLogs[removedIndex - 1]?.log;
  const previousTrench = previous?.cumulativeTrenchM ?? removed.cumulativeTrenchM - getDailyTrenchOutput(removed);
  const previousChambers = previous?.cumulativeChambers ?? removed.cumulativeChambers - removed.chambersPouredToday;
  const trenchDelta = removed.cumulativeTrenchM - previousTrench;
  const chamberDelta = removed.cumulativeChambers - previousChambers;
  const shiftedLogs = shiftLogs(logs, groupLogs, removedIndex + 1, -trenchDelta, -chamberDelta);

  return shiftedLogs.filter((log) => log.id !== removed.id);
}

function insertLogAndShiftLater(logs: DailyLogEntry[], newLog: DailyLogEntry): DailyLogEntry[] {
  const groupLogs = getGroupLogs(logs, newLog);
  const insertionIndex = groupLogs.findIndex(({ log }) => compareLogOrder(log, newLog) > 0);
  const targetIndex = insertionIndex < 0 ? groupLogs.length : insertionIndex;
  const previous = groupLogs[targetIndex - 1]?.log;
  const next = groupLogs[targetIndex]?.log;
  const previousTrench = previous?.cumulativeTrenchM ?? (next ? next.cumulativeTrenchM - getDailyTrenchOutput(next) : 0);
  const previousChambers = previous?.cumulativeChambers ?? (next ? next.cumulativeChambers - next.chambersPouredToday : 0);
  const trenchOutput = getDailyTrenchOutput(newLog);
  const chamberOutput = newLog.chambersPouredToday || 0;
  const insertedLog = {
    ...newLog,
    cumulativeTrenchM: previousTrench + trenchOutput,
    cumulativeChambers: previousChambers + chamberOutput,
  };
  const shiftedLogs = shiftLogs(logs, groupLogs, targetIndex, trenchOutput, chamberOutput);

  return [...shiftedLogs, insertedLog];
}

function updateLogAndShiftLater(
  logs: DailyLogEntry[],
  previousLog: DailyLogEntry,
  updatedLog: DailyLogEntry
): DailyLogEntry[] {
  const groupLogs = getGroupLogs(logs, previousLog);
  const currentIndex = groupLogs.findIndex(({ log }) => log.id === previousLog.id);
  if (currentIndex < 0) return insertLogAndShiftLater(logs, updatedLog);

  const current = groupLogs[currentIndex].log;
  const previous = groupLogs[currentIndex - 1]?.log;
  const previousTrench = previous?.cumulativeTrenchM ?? current.cumulativeTrenchM - getDailyTrenchOutput(current);
  const previousChambers = previous?.cumulativeChambers ?? current.cumulativeChambers - current.chambersPouredToday;
  const trenchResidual = Math.max(0, current.cumulativeTrenchM - previousTrench - getDailyTrenchOutput(current));
  const chamberResidual = Math.max(0, current.cumulativeChambers - previousChambers - current.chambersPouredToday);
  const updatedWithProgress = {
    ...updatedLog,
    cumulativeTrenchM: previousTrench + trenchResidual + getDailyTrenchOutput(updatedLog),
    cumulativeChambers: previousChambers + chamberResidual + updatedLog.chambersPouredToday,
  };
  const trenchDelta = updatedWithProgress.cumulativeTrenchM - current.cumulativeTrenchM;
  const chamberDelta = updatedWithProgress.cumulativeChambers - current.cumulativeChambers;
  const shiftedLogs = shiftLogs(logs, groupLogs, currentIndex + 1, trenchDelta, chamberDelta);

  return shiftedLogs.map((log) => (log.id === current.id ? updatedWithProgress : log));
}

export function applyDailyLogProgressChange(
  logs: DailyLogEntry[],
  updatedLog: DailyLogEntry,
  previousLog?: DailyLogEntry
): DailyLogEntry[] {
  if (!previousLog) return insertLogAndShiftLater(logs, updatedLog);

  if (
    sameProgressGroup(previousLog, updatedLog) &&
    previousLog.date === updatedLog.date &&
    previousLog.stt === updatedLog.stt
  ) {
    return updateLogAndShiftLater(logs, previousLog, updatedLog);
  }

  const withoutPrevious = removeLogAndShiftLater(logs, previousLog);
  return insertLogAndShiftLater(withoutPrevious, updatedLog);
}

export function applyDailyLogProgressChanges(
  logs: DailyLogEntry[],
  changes: DailyLogEntry[]
): DailyLogEntry[] {
  if (changes.length === 0) return logs;

  const originalById = new Map(logs.map((log) => [log.id, log]));
  const indexById = new Map(logs.map((log, index) => [log.id, index]));
  const nextLogs = [...logs];
  const affectedGroups = new Set<string>();

  for (const change of changes) {
    const index = indexById.get(change.id);
    if (index === undefined) {
      indexById.set(change.id, nextLogs.length);
      nextLogs.push(change);
    } else {
      const original = originalById.get(change.id);
      if (original) {
        affectedGroups.add(`${original.projectId}:${getContractorKey(original.contractorName)}`);
      }
      nextLogs[index] = change;
    }
    affectedGroups.add(`${change.projectId}:${getContractorKey(change.contractorName)}`);
  }

  const indexedGroups = new Map<string, IndexedLog[]>();
  nextLogs.forEach((log, index) => {
    const key = `${log.projectId}:${getContractorKey(log.contractorName)}`;
    if (!affectedGroups.has(key)) return;
    const group = indexedGroups.get(key) || [];
    group.push({ index, log });
    indexedGroups.set(key, group);
  });

  for (const group of indexedGroups.values()) {
    group.sort((left, right) => compareLogOrder(left.log, right.log));
    let previousNewTrench = 0;
    let previousNewChambers = 0;
    let previousOriginalTrench = 0;
    let previousOriginalChambers = 0;

    for (const { index, log } of group) {
      const original = originalById.get(log.id);
      let trenchResidual = 0;
      let chamberResidual = 0;
      if (original) {
        trenchResidual = Math.max(
          0,
          original.cumulativeTrenchM -
            previousOriginalTrench -
            getDailyTrenchOutput(original)
        );
        chamberResidual = Math.max(
          0,
          original.cumulativeChambers -
            previousOriginalChambers -
            original.chambersPouredToday
        );
        previousOriginalTrench = original.cumulativeTrenchM;
        previousOriginalChambers = original.cumulativeChambers;
      }

      const updatedLog = {
        ...log,
        cumulativeTrenchM: previousNewTrench + trenchResidual + getDailyTrenchOutput(log),
        cumulativeChambers: previousNewChambers + chamberResidual + log.chambersPouredToday,
      };
      nextLogs[index] = updatedLog;
      previousNewTrench = updatedLog.cumulativeTrenchM;
      previousNewChambers = updatedLog.cumulativeChambers;
    }
  }

  return nextLogs;
}

export function removeDailyLogProgress(logs: DailyLogEntry[], logToRemove: DailyLogEntry): DailyLogEntry[] {
  return removeLogAndShiftLater(logs, logToRemove);
}

export function getLatestProgressLogs(logs: DailyLogEntry[], throughDate?: string): DailyLogEntry[] {
  const latestLogs = new Map<string, DailyLogEntry>();

  for (const log of logs) {
    if (throughDate && log.date > throughDate) continue;

    const key = `${log.projectId}:${getContractorKey(log.contractorName)}`;
    const current = latestLogs.get(key);
    if (!current || compareLogOrder(current, log) < 0) latestLogs.set(key, log);
  }

  return [...latestLogs.values()];
}

export function synchronizeProjectProgress(
  projects: UndergroundProject[],
  logs: DailyLogEntry[]
): UndergroundProject[] {
  const progressByProject = new Map<string, DailyLogEntry[]>();

  for (const log of getLatestProgressLogs(logs)) {
    const projectLogs = progressByProject.get(log.projectId) || [];
    projectLogs.push(log);
    progressByProject.set(log.projectId, projectLogs);
  }

  return projects.map((project) => {
    const latestLogs = progressByProject.get(project.id) || [];
    return {
      ...project,
      completedLengthM: latestLogs.reduce((total, log) => total + log.cumulativeTrenchM, 0),
      completedChambers: latestLogs.reduce((total, log) => total + log.cumulativeChambers, 0),
    };
  });
}