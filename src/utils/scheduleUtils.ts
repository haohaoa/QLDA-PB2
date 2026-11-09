import { UndergroundProject } from '../types/undergrounding';

export interface ScheduleBounds {
  startDate: string;
  finishDate: string;
}

export interface ScheduleDay {
  label: string;
  date: string;
  isToday?: boolean;
}

export interface ScheduleWeek {
  id: string;
  name: string;
  shortLabel: string;
  isCurrent: boolean;
  days: ScheduleDay[];
}

function parseDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentDateKey(): string {
  return toDateKey(new Date());
}

function formatShortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

export function getScheduleBounds(
  projects: UndergroundProject[],
  selectedProjectId: string
): ScheduleBounds | null {
  const activeProjects =
    selectedProjectId === 'all'
      ? projects
      : projects.filter((project) => project.id === selectedProjectId);
  if (activeProjects.length === 0) return null;

  return {
    startDate: activeProjects.reduce(
      (start, project) => (project.startDate < start ? project.startDate : start),
      activeProjects[0].startDate
    ),
    finishDate: activeProjects.reduce(
      (finish, project) => (project.finishDate > finish ? project.finishDate : finish),
      activeProjects[0].finishDate
    ),
  };
}

export function isProjectActiveOnDate(project: UndergroundProject, date: string): boolean {
  return date >= project.startDate && date <= project.finishDate;
}

export function buildScheduleWeeks(
  bounds: ScheduleBounds | null,
  today: string
): ScheduleWeek[] {
  if (!bounds) return [];

  const rangeStart = parseDate(bounds.startDate);
  const rangeEnd = parseDate(bounds.finishDate);
  const firstMonday = new Date(rangeStart);
  firstMonday.setDate(firstMonday.getDate() - ((firstMonday.getDay() + 6) % 7));

  const weeks: ScheduleWeek[] = [];
  let weekStart = firstMonday;

  while (weekStart <= rangeEnd) {
    const days: ScheduleDay[] = [];
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + dayOffset);
      const dateKey = toDateKey(date);
      if (dateKey < bounds.startDate || dateKey > bounds.finishDate) continue;

      days.push({
        label: `${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][dayOffset]} (${formatShortDate(dateKey)})`,
        date: dateKey,
        isToday: dateKey === today,
      });
    }

    if (days.length > 0) {
      const firstDay = days[0].date;
      const lastDay = days[days.length - 1].date;
      const weekNumber = weeks.length + 1;
      const dateRange = `${formatShortDate(firstDay)} - ${formatShortDate(lastDay)}`;
      weeks.push({
        id: toDateKey(weekStart),
        name: `Tuần ${weekNumber}: ${dateRange}`,
        shortLabel: `Tuần ${weekNumber} (${dateRange})`,
        isCurrent: days.some((day) => day.isToday),
        days,
      });
    }

    weekStart = new Date(weekStart);
    weekStart.setDate(weekStart.getDate() + 7);
  }

  return weeks;
}