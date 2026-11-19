import { DailyLogEntry, ProjectContractor, UndergroundProject } from '../types/undergrounding';
import { getContractorKey } from './progressUtils';

export type ContractorScheduleStatus =
  | 'complete'
  | 'on_schedule'
  | 'behind_schedule'
  | 'overdue'
  | 'insufficient_data';

export type ChamberScheduleStatus = ContractorScheduleStatus | 'not_applicable';

export interface ContractorAssessment {
  workDays: number;
  restDays: number;
  excavationTotalM: number;
  averagePerWorkdayM: number | null;
  averagePerCalendarDayM: number | null;
  averagePerWeekM: number | null;
  averagePerMonthM: number | null;
  remainingM: number;
  daysUntilFinish: number | null;
  requiredPerDayM: number | null;
  requiredPerWeekM: number | null;
  requiredPerMonthM: number | null;
  additionalPerDayM: number | null;
  additionalPerWeekM: number | null;
  additionalPerMonthM: number | null;
  status: ContractorScheduleStatus;
  remainingChambers: number;
  chamberAvgPerWeek: number | null;
  chamberRequiredPerWeek: number | null;
  chamberAdditionalPerWeek: number | null;
  chamberStatus: ChamberScheduleStatus;
  overallStatus: ContractorScheduleStatus;
}

function parseDateKey(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

function hasProduction(log: DailyLogEntry): boolean {
  return (
    log.excavationTodayM > 0 ||
    (log.pipeLaidTodayM || 0) > 0 ||
    (log.restoredTodayM || 0) > 0 ||
    log.chambersPouredToday > 0
  );
}

function isMarkedRestDay(log: DailyLogEntry): boolean {
  return !!log.stoppageReason?.trim() || log.resources.toLocaleLowerCase().includes('nghỉ');
}

function isWorkingDay(log: DailyLogEntry): boolean {
  return hasProduction(log) || (!isMarkedRestDay(log) && !!log.resources.trim());
}

function roundRate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getContractorAssessment(
  project: UndergroundProject,
  contractor: Pick<ProjectContractor, 'name' | 'totalLengthM'> & {
    totalChambers?: number;
  },
  dailyLogs: DailyLogEntry[],
  today: string
): ContractorAssessment {
  const todayTimestamp = parseDateKey(today);
  const logs = dailyLogs
    .map((log) => ({ log, dateTimestamp: parseDateKey(log.date) }))
    .filter(
      ({ log, dateTimestamp }) =>
        log.projectId === project.id &&
        getContractorKey(log.contractorName) === getContractorKey(contractor.name) &&
        dateTimestamp !== null &&
        (todayTimestamp === null || dateTimestamp <= todayTimestamp)
    )
    .map(({ log }) => log)
    .sort((left, right) => left.date.localeCompare(right.date) || left.stt - right.stt);

  const activityByDate = new Map<string, { worked: boolean; rested: boolean }>();
  for (const log of logs) {
    const activity = activityByDate.get(log.date) || { worked: false, rested: false };
    activity.worked ||= isWorkingDay(log);
    activity.rested ||= isMarkedRestDay(log);
    activityByDate.set(log.date, activity);
  }

  const workDays = [...activityByDate.values()].filter((activity) => activity.worked).length;
  const restDays = [...activityByDate.values()].filter(
    (activity) => !activity.worked && activity.rested
  ).length;
  const excavationTotalM = logs.reduce(
    (total, log) => total + Math.max(0, log.excavationTodayM || 0),
    0
  );
  const firstLogTimestamp = logs.length ? parseDateKey(logs[0].date) : null;
  const elapsedCalendarDays =
    firstLogTimestamp !== null && todayTimestamp !== null
      ? Math.floor((todayTimestamp - firstLogTimestamp) / 86400000) + 1
      : null;
  const averagePerWorkdayM =
    workDays > 0 ? roundRate(excavationTotalM / workDays) : null;
  const averagePerCalendarDayM =
    elapsedCalendarDays && elapsedCalendarDays > 0
      ? roundRate(excavationTotalM / elapsedCalendarDays)
      : null;
  const averagePerWeekM =
    averagePerWorkdayM === null ? null : roundRate(averagePerWorkdayM * 7);
  const averagePerMonthM =
    averagePerWorkdayM === null ? null : roundRate(averagePerWorkdayM * 30);

  const latestLog = logs[logs.length - 1];
  const completedM = latestLog?.cumulativeTrenchM || 0;
  const remainingM = Math.max(0, contractor.totalLengthM - completedM);
  const targetChambers = Math.max(0, contractor.totalChambers || 0);
  const completedChambers = latestLog?.cumulativeChambers || 0;
  const remainingChambers = Math.max(0, targetChambers - completedChambers);
  const chamberTotal = logs.reduce(
    (total, log) => total + Math.max(0, log.chambersPouredToday || 0),
    0
  );
  const chamberAvgPerWeek =
    elapsedCalendarDays && elapsedCalendarDays > 0
      ? roundRate((chamberTotal / elapsedCalendarDays) * 7)
      : null;
  const finishTimestamp = parseDateKey(project.finishDate);
  const daysUntilFinish =
    todayTimestamp !== null && finishTimestamp !== null
      ? Math.floor((finishTimestamp - todayTimestamp) / 86400000)
      : null;

  let status: ContractorScheduleStatus = 'insufficient_data';
  let requiredPerDayM: number | null = null;
  let requiredPerWeekM: number | null = null;
  let requiredPerMonthM: number | null = null;
  let additionalPerDayM: number | null = null;
  let additionalPerWeekM: number | null = null;
  let additionalPerMonthM: number | null = null;

  if (contractor.totalLengthM > 0 && remainingM === 0) {
    status = 'complete';
  } else if (contractor.totalLengthM > 0 && daysUntilFinish !== null && daysUntilFinish < 0) {
    status = 'overdue';
  } else if (
    contractor.totalLengthM > 0 &&
    daysUntilFinish !== null &&
    daysUntilFinish >= 0
  ) {
    const remainingCalendarDays = daysUntilFinish + 1;
    requiredPerDayM = roundRate(remainingM / remainingCalendarDays);
    requiredPerWeekM = roundRate(requiredPerDayM * 7);
    requiredPerMonthM = roundRate(requiredPerDayM * 30);
    if (averagePerCalendarDayM !== null) {
      status =
        averagePerCalendarDayM >= requiredPerDayM
          ? 'on_schedule'
          : 'behind_schedule';
      additionalPerDayM = roundRate(Math.max(0, requiredPerDayM - averagePerCalendarDayM));
      additionalPerWeekM = roundRate(additionalPerDayM * 7);
      additionalPerMonthM = roundRate(additionalPerDayM * 30);
    }
  }

  let chamberStatus: ChamberScheduleStatus =
    targetChambers > 0 ? 'insufficient_data' : 'not_applicable';
  let chamberRequiredPerWeek: number | null = null;
  let chamberAdditionalPerWeek: number | null = null;

  if (targetChambers > 0) {
    if (remainingChambers === 0) {
      chamberStatus = 'complete';
    } else if (daysUntilFinish !== null && daysUntilFinish < 0) {
      chamberStatus = 'overdue';
    } else if (daysUntilFinish !== null && daysUntilFinish >= 0) {
      const remainingCalendarDays = daysUntilFinish + 1;
      chamberRequiredPerWeek = roundRate((remainingChambers / remainingCalendarDays) * 7);
      if (chamberAvgPerWeek !== null) {
        chamberStatus =
          chamberAvgPerWeek >= chamberRequiredPerWeek
            ? 'on_schedule'
            : 'behind_schedule';
        chamberAdditionalPerWeek = roundRate(
          Math.max(0, chamberRequiredPerWeek - chamberAvgPerWeek)
        );
      }
    }
  }

  const activeStatuses: ContractorScheduleStatus[] = [];
  if (contractor.totalLengthM > 0 || chamberStatus === 'not_applicable') {
    activeStatuses.push(status);
  }
  if (chamberStatus !== 'not_applicable') {
    activeStatuses.push(chamberStatus);
  }
  const overallStatus: ContractorScheduleStatus = activeStatuses.includes('overdue')
    ? 'overdue'
    : activeStatuses.includes('behind_schedule')
    ? 'behind_schedule'
    : activeStatuses.every((s) => s === 'complete')
    ? 'complete'
    : activeStatuses.every((s) => s === 'complete' || s === 'on_schedule')
    ? 'on_schedule'
    : 'insufficient_data';

  return {
    workDays,
    restDays,
    excavationTotalM: roundRate(excavationTotalM),
    averagePerWorkdayM,
    averagePerCalendarDayM,
    averagePerWeekM,
    averagePerMonthM,
    remainingM: roundRate(remainingM),
    daysUntilFinish,
    requiredPerDayM,
    requiredPerWeekM,
    requiredPerMonthM,
    additionalPerDayM,
    additionalPerWeekM,
    additionalPerMonthM,
    status,
    remainingChambers,
    chamberAvgPerWeek,
    chamberRequiredPerWeek,
    chamberAdditionalPerWeek,
    chamberStatus,
    overallStatus,
  };
}
