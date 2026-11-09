import React from 'react';
import { DailyLogEntry, UndergroundProject } from '../types/undergrounding';
import { getDailyTrenchOutput, getLatestProgressLogs } from '../utils/progressUtils';
import { formatNumber } from '../utils/numberFormat';
import { BarChart3, TrendingUp } from 'lucide-react';

interface ProjectProgressChartProps {
  project: UndergroundProject;
  dailyLogs: DailyLogEntry[];
  throughDate: string;
}

interface ChartDay {
  date: string;
  dailyOutput: number;
  chambers: number;
  cumulative: number;
}

function enumerateDates(startDate: string, endDate: string): string[] {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  const cursor = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);
  const dates: string[] = [];

  while (cursor <= end) {
    dates.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
        cursor.getDate()
      ).padStart(2, '0')}`
    );
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export const ProjectProgressChart: React.FC<ProjectProgressChartProps> = ({
  project,
  dailyLogs,
  throughDate,
}) => {
  if (throughDate < project.startDate) return null;

  const chartEndDate = throughDate < project.finishDate ? throughDate : project.finishDate;
  const projectLogs = dailyLogs.filter(
    (log) =>
      log.projectId === project.id &&
      log.date >= project.startDate &&
      log.date <= chartEndDate
  );
  const logsByDate = new Map<string, DailyLogEntry[]>();
  for (const log of projectLogs) {
    const dateLogs = logsByDate.get(log.date) || [];
    dateLogs.push(log);
    logsByDate.set(log.date, dateLogs);
  }

  const dates = enumerateDates(project.startDate, chartEndDate);
  const chartDays: ChartDay[] = dates.map((date) => {
    const dateLogs = logsByDate.get(date) || [];
    const latestLogs = getLatestProgressLogs(projectLogs, date).filter(
      (log) => log.projectId === project.id
    );
    return {
      date,
      dailyOutput: dateLogs.reduce((total, log) => total + getDailyTrenchOutput(log), 0),
      chambers: dateLogs.reduce((total, log) => total + (log.chambersPouredToday || 0), 0),
      cumulative: latestLogs.reduce((total, log) => total + log.cumulativeTrenchM, 0),
    };
  });

  const maxDailyOutput = Math.max(1, ...chartDays.map((day) => day.dailyOutput));
  const maxCumulative = Math.max(project.totalLengthM, ...chartDays.map((day) => day.cumulative), 1);
  const totalDailyOutput = chartDays.reduce((total, day) => total + day.dailyOutput, 0);
  const totalChambers = chartDays.reduce((total, day) => total + day.chambers, 0);
  const activeDays = chartDays.filter((day) => day.dailyOutput > 0 || day.chambers > 0).length;
  const latestCumulative = chartDays[chartDays.length - 1]?.cumulative || 0;
  const chartWidth = 760;
  const chartHeight = 180;
  const left = 12;
  const right = 12;
  const top = 12;
  const bottom = 28;
  const plotWidth = chartWidth - left - right;
  const plotHeight = chartHeight - top - bottom;
  const barStep = plotWidth / Math.max(chartDays.length, 1);
  const barWidth = Math.max(2, Math.min(12, barStep * 0.62));
  const cumulativePoints = chartDays
    .map((day, index) => {
      const x = left + (chartDays.length <= 1 ? plotWidth / 2 : index * barStep + barStep / 2);
      const y = top + plotHeight - (day.cumulative / maxCumulative) * plotHeight;
      return `${x},${y}`;
    })
    .join(' ');
  const contractY = top + plotHeight - (project.totalLengthM / maxCumulative) * plotHeight;
  const labelIndexes = [...new Set([0, Math.floor((chartDays.length - 1) / 2), chartDays.length - 1])];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <BarChart3 className="h-4 w-4 text-teal-700" />
            Biểu đồ khối lượng thi công
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {project.name} · {project.startDate.split('-').reverse().join('/')} - {chartEndDate.split('-').reverse().join('/')}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          <span className="font-semibold text-teal-800">Mét trong kỳ: {formatNumber(totalDailyOutput)} m</span>
          <span className="font-semibold text-slate-700">Lũy kế: {formatNumber(latestCumulative)} / {formatNumber(project.totalLengthM)} m</span>
          <span className="text-slate-600">Hố ga: {formatNumber(totalChambers)} · {formatNumber(activeDays)} ngày hoạt động</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold text-slate-600">Khối lượng hoàn thành mỗi ngày (m)</div>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-40 w-full" role="img" aria-label="Biểu đồ khối lượng hoàn thành theo ngày">
            <line x1={left} y1={top + plotHeight} x2={chartWidth - right} y2={top + plotHeight} stroke="#cbd5e1" />
            {chartDays.map((day, index) => {
              const barHeight = (day.dailyOutput / maxDailyOutput) * plotHeight;
              const x = left + index * barStep + (barStep - barWidth) / 2;
              return (
                <rect
                  key={day.date}
                  x={x}
                  y={top + plotHeight - barHeight}
                  width={barWidth}
                  height={Math.max(barHeight, day.dailyOutput > 0 ? 1 : 0)}
                  rx="1"
                  fill={day.dailyOutput > 0 ? '#087e8b' : 'transparent'}
                >
                  <title>{`${day.date}: ${formatNumber(day.dailyOutput)} m`}</title>
                </rect>
              );
            })}
            {labelIndexes.map((index) => {
              const day = chartDays[index];
              if (!day) return null;
              const x = left + index * barStep + barStep / 2;
              return (
                <text key={day.date} x={x} y={chartHeight - 7} textAnchor="middle" fill="#64748b" fontSize="10">
                  {day.date.slice(5).replace('-', '/')}
                </text>
              );
            })}
          </svg>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-slate-600">
            <span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-teal-700" /> Lũy kế mương cáp (m)</span>
            <span className="text-slate-400">Đường gạch: khối lượng hợp đồng</span>
          </div>
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-40 w-full" role="img" aria-label="Biểu đồ lũy kế và khối lượng hợp đồng">
            <line x1={left} y1={contractY} x2={chartWidth - right} y2={contractY} stroke="#dc6b5b" strokeDasharray="5 4" />
            <line x1={left} y1={top + plotHeight} x2={chartWidth - right} y2={top + plotHeight} stroke="#cbd5e1" />
            {cumulativePoints && (
              <polyline points={cumulativePoints} fill="none" stroke="#087e8b" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            )}
            {labelIndexes.map((index) => {
              const day = chartDays[index];
              if (!day) return null;
              const x = left + index * barStep + barStep / 2;
              return (
                <text key={day.date} x={x} y={chartHeight - 7} textAnchor="middle" fill="#64748b" fontSize="10">
                  {day.date.slice(5).replace('-', '/')}
                </text>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
};