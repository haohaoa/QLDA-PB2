import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { DailyLogEntry, ProjectContractor, UndergroundProject } from '../types/undergrounding';
import { getContractorKey } from '../utils/progressUtils';
import { FormattedNumberInput } from './FormattedNumberInput';
import { formatNumber } from '../utils/numberFormat';
import { ProjectContractorRoutePicker } from './ProjectContractorRoutePicker';
import { getContractorAssessment } from '../utils/contractorAssessment';
import { getCurrentDateKey } from '../utils/scheduleUtils';

const CONTRACTOR_COLORS = [
  '#2563eb',
  '#e11d48',
  '#16a34a',
  '#9333ea',
  '#ea580c',
  '#0891b2',
  '#ca8a04',
  '#4f46e5',
];

interface ProjectContractorsPanelProps {
  project: UndergroundProject;
  dailyLogs: DailyLogEntry[];
  isAdmin: boolean;
  onUpdateProject: (project: UndergroundProject) => boolean;
}

export const ProjectContractorsPanel: React.FC<ProjectContractorsPanelProps> = ({
  project,
  dailyLogs,
  isAdmin,
  onUpdateProject,
}) => {
  const contractors = project.contractors || [];
  const today = getCurrentDateKey();
  const [workingPoints, setWorkingPoints] = useState(project.points);
  const routePoints = workingPoints.filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)
  );
  const lastAssignedContractor = contractors
    .map((contractor) => ({
      contractor,
      endIndex: routePoints.findIndex((point) => point.id === contractor.endPointId),
    }))
    .filter(({ endIndex }) => endIndex >= 0)
    .sort((left, right) => right.endIndex - left.endIndex)[0]?.contractor;
  const [endpointMode, setEndpointMode] = useState<'start' | 'end'>(
    lastAssignedContractor ? 'end' : 'start'
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [startPointId, setStartPointId] = useState(lastAssignedContractor?.endPointId || '');
  const [endPointId, setEndPointId] = useState('');
  const [totalLengthM, setTotalLengthM] = useState(0);
  const [totalChambers, setTotalChambers] = useState(0);
  const [contractValueVND, setContractValueVND] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWorkingPoints(project.points);
  }, [project.points]);

  useEffect(() => {
    if (!editingId) {
      setStartPointId(lastAssignedContractor?.endPointId || '');
      setEndpointMode(lastAssignedContractor ? 'end' : 'start');
    }
  }, [editingId, lastAssignedContractor?.id, lastAssignedContractor?.endPointId]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setStartPointId(lastAssignedContractor?.endPointId || '');
    setEndPointId('');
    setEndpointMode(lastAssignedContractor ? 'end' : 'start');
    setTotalLengthM(0);
    setTotalChambers(0);
    setContractValueVND(0);
    setError(null);
  };

  const handleEdit = (contractor: ProjectContractor) => {
    setEditingId(contractor.id);
    setName(contractor.name);
    setStartPointId(contractor.startPointId);
    setEndPointId(contractor.endPointId);
    setEndpointMode('start');
    setTotalLengthM(contractor.totalLengthM);
    setTotalChambers(contractor.totalChambers);
    setContractValueVND(contractor.contractValueVND);
    setError(null);
  };

  const handleSelectRoutePoint = (pointId: string) => {
    const pointIndex = routePoints.findIndex((point) => point.id === pointId);
    const startIndex = routePoints.findIndex((point) => point.id === startPointId);
    if (endpointMode === 'start') {
      if (!editingId && lastAssignedContractor) return;
      setStartPointId(pointId);
      setEndPointId('');
    } else {
      if (startIndex < 0 || pointIndex <= startIndex) return;
      setEndPointId(pointId);
    }
    setError(null);
  };

  const handleInsertRoutePoint = (afterIndex: number, lat: number, lng: number) => {
    const startIndex = routePoints.findIndex((point) => point.id === startPointId);
    if (
      endpointMode === 'end' &&
      afterIndex < startIndex
    ) return;
    if (
      endpointMode === 'start' &&
      !editingId &&
      lastAssignedContractor
    ) return;
    if (endpointMode === 'end' && afterIndex + 1 <= startIndex) return;

    const newPoint = {
      id: `contractor-split-${Date.now()}`,
      name: `Mốc phân đoạn ${routePoints.length - 1}`,
      type: 'turn' as const,
      lat,
      lng,
    };
    setWorkingPoints((current) => [
      ...current.slice(0, afterIndex + 1),
      newPoint,
      ...current.slice(afterIndex + 1),
    ]);
    if (endpointMode === 'start') {
      setStartPointId(newPoint.id);
      setEndPointId('');
    } else {
      setEndPointId(newPoint.id);
    }
    setError(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const startIndex = routePoints.findIndex((point) => point.id === startPointId);
    const endIndex = routePoints.findIndex((point) => point.id === endPointId);
    if (!trimmedName || startIndex < 0 || endIndex <= startIndex) {
      setError('Hãy chọn điểm đầu và điểm cuối theo đúng thứ tự trên tuyến tổng thể.');
      return;
    }
    if (!editingId && lastAssignedContractor && startPointId !== lastAssignedContractor.endPointId) {
      setError(`Đoạn mới phải bắt đầu tại điểm kết thúc của nhà thầu ${lastAssignedContractor.name}.`);
      return;
    }

    const duplicateName = contractors.some(
      (contractor) =>
        contractor.id !== editingId &&
        getContractorKey(contractor.name) === getContractorKey(trimmedName)
    );
    if (duplicateName) {
      setError('Nhà thầu này đã được thêm vào dự án.');
      return;
    }

    const occupiedRouteIndices = new Set<number>();
    contractors
      .filter((contractor) => contractor.id !== editingId)
      .forEach((contractor) => {
        const from = routePoints.findIndex((point) => point.id === contractor.startPointId);
        const to = routePoints.findIndex((point) => point.id === contractor.endPointId);
        if (from >= 0 && to > from) {
          for (let index = from; index < to; index += 1) occupiedRouteIndices.add(index);
        }
      });
    for (let index = startIndex; index < endIndex; index += 1) {
      if (occupiedRouteIndices.has(index)) {
        setError('Đoạn tuyến này đã giao cho nhà thầu khác. Hãy chọn một đoạn chưa phân công.');
        return;
      }
    }

    const previousContractor = contractors.find((contractor) => contractor.id === editingId);
    const hasHistory = dailyLogs.some(
      (log) =>
        log.projectId === project.id &&
        previousContractor &&
        getContractorKey(log.contractorName) === getContractorKey(previousContractor.name)
    );
    if (hasHistory && previousContractor && getContractorKey(previousContractor.name) !== getContractorKey(trimmedName)) {
      setError('Không thể đổi tên nhà thầu đã có nhật ký để giữ nguyên liên kết lịch sử.');
      return;
    }
    if (
      hasHistory &&
      previousContractor &&
      (previousContractor.startPointId !== startPointId ||
        previousContractor.endPointId !== endPointId)
    ) {
      setError('Không thể đổi đoạn tuyến sau khi đã có nhật ký thi công cho nhà thầu này.');
      return;
    }

    const newContractor: ProjectContractor = {
      id: editingId || `contractor-${Date.now()}`,
      name: trimmedName,
      color: previousContractor?.color || CONTRACTOR_COLORS[contractors.length % CONTRACTOR_COLORS.length],
      startPointId,
      endPointId,
      routePoints: routePoints.slice(startIndex, endIndex + 1),
      totalLengthM: Number(totalLengthM),
      totalChambers: Number(totalChambers),
      contractValueVND: Number(contractValueVND),
    };
    const updatedExistingContractors = contractors.map((contractor) => {
      const from = routePoints.findIndex((point) => point.id === contractor.startPointId);
      const to = routePoints.findIndex((point) => point.id === contractor.endPointId);
      return {
        ...contractor,
        routePoints: from >= 0 && to > from
          ? routePoints.slice(from, to + 1)
          : contractor.routePoints,
      };
    });
    const nextContractors = editingId
      ? updatedExistingContractors.map((contractor) =>
          contractor.id === editingId ? newContractor : contractor
        )
      : [...updatedExistingContractors, newContractor];

    if (onUpdateProject({
      ...project,
      points: workingPoints,
      contractors: nextContractors,
      contractor: nextContractors.map((item) => item.name).join(', ') || 'Chưa phân công',
      totalLengthM: nextContractors.reduce((sum, item) => sum + item.totalLengthM, 0),
      totalChambers: nextContractors.reduce((sum, item) => sum + item.totalChambers, 0),
    })) resetForm();
  };

  const handleRemove = (contractor: ProjectContractor) => {
    const hasHistory = dailyLogs.some(
      (log) =>
        log.projectId === project.id &&
        getContractorKey(log.contractorName) === getContractorKey(contractor.name)
    );
    if (hasHistory) {
      window.alert('Không thể xóa nhà thầu đã có nhật ký. Hãy giữ nhà thầu để bảo toàn số liệu lịch sử.');
      return;
    }
    if (!window.confirm(`Xóa nhà thầu “${contractor.name}” khỏi dự án?`)) return;
    const remainingContractors = contractors.filter((item) => item.id !== contractor.id);
    if (onUpdateProject({
      ...project,
      contractors: remainingContractors,
      contractor: remainingContractors.map((item) => item.name).join(', ') || 'Chưa phân công',
      totalLengthM: remainingContractors.reduce((sum, item) => sum + item.totalLengthM, 0),
      totalChambers: remainingContractors.reduce((sum, item) => sum + item.totalChambers, 0),
    })) {
      if (editingId === contractor.id) resetForm();
    }
  };

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Nhà thầu & đoạn tuyến được giao</h4>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
            Chọn hai mốc trên tuyến tổng thể. Đoạn giữa các mốc sẽ tự khớp theo đường tuyến đã vẽ.
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600">
          {contractors.length} nhà thầu
        </span>
      </div>

      {contractors.length > 0 ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          {contractors.map((contractor) => {
            const assessment = getContractorAssessment(project, contractor, dailyLogs, today);
            const latestLog = dailyLogs
              .filter(
                (log) =>
                  log.projectId === project.id &&
                  getContractorKey(log.contractorName) === getContractorKey(contractor.name) &&
                  log.date <= today
              )
              .sort((left, right) => right.date.localeCompare(left.date) || right.stt - left.stt)[0];
            const startName = routePoints.find((point) => point.id === contractor.startPointId)?.name;
            const endName = routePoints.find((point) => point.id === contractor.endPointId)?.name;
            const scheduleStatusLabel = {
              complete: 'Đã hoàn thành',
              on_schedule: 'Đúng tiến độ',
              behind_schedule: 'Có nguy cơ trễ',
              overdue: 'Đã quá hạn',
              insufficient_data: 'Chưa đủ dữ liệu',
            }[assessment.status];
            const scheduleStatusClasses = {
              complete: 'bg-emerald-100 text-emerald-800',
              on_schedule: 'bg-emerald-100 text-emerald-800',
              behind_schedule: 'bg-amber-100 text-amber-800',
              overdue: 'bg-red-100 text-red-800',
              insufficient_data: 'bg-slate-100 text-slate-700',
            }[assessment.status];
            return (
              <article key={contractor.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: contractor.color }} />
                    <div className="min-w-0">
                      <p className="break-words text-xs font-bold text-slate-900">{contractor.name}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{startName} → {endName}</p>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(contractor)}
                        aria-label={`Sửa ${contractor.name}`}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(contractor)}
                        aria-label={`Xóa ${contractor.name}`}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                  <p className="rounded-md bg-slate-50 px-2 py-1.5 text-slate-600">
                    Tuyến: <strong className="font-mono text-slate-900">{formatNumber(contractor.totalLengthM)} m</strong>
                  </p>
                  <p className="rounded-md bg-slate-50 px-2 py-1.5 text-slate-600">
                    Hố ga: <strong className="font-mono text-slate-900">{formatNumber(contractor.totalChambers)}</strong>
                  </p>
                  <p className="rounded-md bg-blue-50 px-2 py-1.5 text-blue-800">
                    Lũy kế: <strong className="font-mono">{formatNumber(latestLog?.cumulativeTrenchM || 0)} m</strong>
                  </p>
                  <p className="rounded-md bg-emerald-50 px-2 py-1.5 text-emerald-800">
                    Hố ga: <strong className="font-mono">{formatNumber(latestLog?.cumulativeChambers || 0)} / {formatNumber(contractor.totalChambers)}</strong>
                  </p>
                  <p className="col-span-2 rounded-md bg-indigo-50 px-2 py-1.5 text-indigo-800">
                    Hợp đồng: <strong className="font-mono">{formatNumber(contractor.contractValueVND / 1_000_000_000, 2)} tỷ VNĐ</strong>
                  </p>
                </div>
                <section className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5" aria-label={`Đánh giá tiến độ ${contractor.name}`}>
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <h5 className="text-[11px] font-bold text-slate-800">Đánh giá thi công</h5>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${scheduleStatusClasses}`}>
                      {scheduleStatusLabel}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] sm:grid-cols-4">
                    <p className="rounded-md bg-white px-2 py-1.5 text-slate-600">
                      Ngày làm: <strong className="font-mono text-slate-900">{formatNumber(assessment.workDays)}</strong>
                    </p>
                    <p className="rounded-md bg-white px-2 py-1.5 text-slate-600">
                      Ngày nghỉ: <strong className="font-mono text-slate-900">{formatNumber(assessment.restDays)}</strong>
                    </p>
                    <p className="rounded-md bg-white px-2 py-1.5 text-slate-600">
                      Đào phui: <strong className="font-mono text-slate-900">{formatNumber(assessment.excavationTotalM)} m</strong>
                    </p>
                    <p className="rounded-md bg-white px-2 py-1.5 text-slate-600">
                      Còn lại: <strong className="font-mono text-slate-900">{formatNumber(assessment.remainingM)} m</strong>
                    </p>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-blue-50 px-2.5 py-2 text-[10px] text-blue-900">
                      <p className="font-bold">Khối lượng trung bình thi công (KLTB)</p>
                      <p className="mt-1">
                        KLTB:{' '}
                        <strong className="font-mono">
                          {assessment.averagePerWorkdayM === null
                            ? '—'
                            : `${formatNumber(assessment.averagePerWorkdayM)} m/ngày`}
                        </strong>
                      </p>
                      <p>
                        KLTB:{' '}
                        <strong className="font-mono">
                          {assessment.averagePerWeekM === null ? '—' : `${formatNumber(assessment.averagePerWeekM)} m/tuần`}
                        </strong>
                      </p>
                      <p>
                        KLTB:{' '}
                        <strong className="font-mono">
                          {assessment.averagePerMonthM === null ? '—' : `${formatNumber(assessment.averagePerMonthM)} m/tháng`}
                        </strong>
                      </p>
                    </div>
                    <div className="rounded-md bg-white px-2.5 py-2 text-[10px] text-slate-700">
                      <p className="font-bold">Tốc độ cần đạt đến {project.finishDate}</p>
                      {assessment.status === 'complete' ? (
                        <p className="mt-1 text-emerald-700">Đã hoàn thành khối lượng hợp đồng.</p>
                      ) : assessment.status === 'overdue' ? (
                        <p className="mt-1 text-red-700">
                          {assessment.daysUntilFinish === 0
                            ? 'Hạn hoàn thành là hôm nay; không còn ngày dự kiến để thi công.'
                            : `Đã quá hạn ${formatNumber(Math.abs(assessment.daysUntilFinish || 0))} ngày; không còn thời gian dự kiến theo tiến độ.`}
                        </p>
                      ) : assessment.requiredPerDayM !== null ? (
                        <>
                          <p className="mt-1">
                            KLTB cần đạt: <strong className="font-mono">{formatNumber(assessment.requiredPerDayM)} m/ngày</strong>
                            {' · '}<strong className="font-mono">{formatNumber(assessment.requiredPerWeekM || 0)} m/tuần</strong>
                            {' · '}<strong className="font-mono">{formatNumber(assessment.requiredPerMonthM || 0)} m/tháng</strong>
                          </p>
                          {assessment.status === 'behind_schedule' ? (
                            <p className="mt-1 font-semibold text-amber-800">
                              Cần tăng thêm {formatNumber(assessment.additionalPerDayM || 0)} m/ngày.
                            </p>
                          ) : assessment.status === 'on_schedule' ? (
                            <p className="mt-1 font-semibold text-emerald-700">Tốc độ hiện tại đáp ứng hạn hoàn thành.</p>
                          ) : (
                            <p className="mt-1 text-slate-500">Chưa có nhật ký để xác định tốc độ hiện tại.</p>
                          )}
                        </>
                      ) : (
                        <p className="mt-1 text-slate-500">Chưa đủ dữ liệu ngày hoàn thành hoặc khối lượng hợp đồng.</p>
                      )}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[9px] leading-relaxed text-slate-500">
                    Tốc độ lịch tính từ ngày có nhật ký đầu tiên đến hôm nay; tuần = 7 ngày, tháng = 30 ngày. Ngày nghỉ chỉ tính khi nhật ký ghi rõ nghỉ/tạm dừng.
                  </p>
                </section>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mb-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">
          Chưa phân công nhà thầu. Tuyến tổng thể sẽ hiển thị nét đứt trên bản đồ.
        </p>
      )}

      {isAdmin && routePoints.length > 1 && (
        <form onSubmit={handleSubmit} className="space-y-2.5 rounded-lg border border-blue-100 bg-white p-3">
          <p className="text-xs font-bold text-slate-800">{editingId ? 'Cập nhật phân công' : 'Bước 2 · Thêm nhà thầu thi công'}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[10px] font-semibold text-slate-600">
              Tên nhà thầu
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                placeholder="Tên công ty thi công"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-900"
              />
            </label>
            <label className="text-[10px] font-semibold text-slate-600">
              Màu hiển thị
              <span className="mt-1 flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-2.5">
                <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: contractors.find((item) => item.id === editingId)?.color || CONTRACTOR_COLORS[contractors.length % CONTRACTOR_COLORS.length] }} />
                <span className="text-xs text-slate-700">Tự chọn theo thứ tự nhà thầu</span>
              </span>
            </label>
            <div className="space-y-2 sm:col-span-2">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Chọn loại mốc tuyến">
                <span className="text-[10px] font-semibold text-slate-600">Đang chọn:</span>
                {([
                  ['start', 'Điểm đầu'],
                  ['end', 'Điểm cuối'],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setEndpointMode(mode)}
                    aria-pressed={endpointMode === mode}
                    disabled={
                      (mode === 'start' && !editingId && !!lastAssignedContractor) ||
                      (mode === 'end' && !startPointId)
                    }
                    className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      endpointMode === mode
                        ? mode === 'start'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-rose-600 bg-rose-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500">
                {!editingId && lastAssignedContractor
                  ? `Đoạn đã giao cho ${lastAssignedContractor.name} được hiển thị trên bản đồ. Điểm đầu cố định tại điểm cuối đoạn đó; chỉ chọn điểm cuối tiếp theo.`
                  : 'Chọn nút Điểm đầu hoặc Điểm cuối, sau đó chạm mốc hoặc tuyến trên bản đồ. Đoạn nhà thầu tự nối theo tuyến tổng.'}
              </p>
              <ProjectContractorRoutePicker
                points={workingPoints}
                contractors={contractors}
                startPointId={startPointId}
                endPointId={endPointId}
                endpointMode={endpointMode}
                lockedStartPointId={!editingId ? lastAssignedContractor?.endPointId : undefined}
                onSelectPoint={handleSelectRoutePoint}
                onInsertPoint={handleInsertRoutePoint}
              />
            </div>
            <label className="text-[10px] font-semibold text-slate-600">
              Khối lượng hợp đồng đoạn tuyến (m)
              <FormattedNumberInput min={0} value={totalLengthM} onValueChange={(value) => setTotalLengthM(value === '' ? 0 : value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono" required />
            </label>
            <label className="text-[10px] font-semibold text-slate-600">
              Số hố ga / hầm
              <FormattedNumberInput min={0} value={totalChambers} onValueChange={(value) => setTotalChambers(value === '' ? 0 : value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono" required />
            </label>
            <label className="text-[10px] font-semibold text-slate-600 sm:col-span-2">
              Giá trị hợp đồng nhà thầu (VNĐ)
              <FormattedNumberInput min={0} value={contractValueVND} onValueChange={(value) => setContractValueVND(value === '' ? 0 : value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono" required />
            </label>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
              {editingId ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {editingId ? 'Lưu phân công' : 'Thêm nhà thầu'}
            </button>
            {editingId && <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600">Hủy sửa</button>}
          </div>
        </form>
      )}
    </section>
  );
};
