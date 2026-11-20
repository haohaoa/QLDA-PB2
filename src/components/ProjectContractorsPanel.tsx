import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, Pencil, Plus, Save, Trash2, UsersRound, X } from 'lucide-react';
import {
  ContractorRouteSpan,
  DailyLogEntry,
  ProjectContractor,
  UndergroundProject,
} from '../types/undergrounding';
import { getContractorKey } from '../utils/progressUtils';
import { FormattedNumberInput } from './FormattedNumberInput';
import { formatNumber } from '../utils/numberFormat';
import {
  ContractorDraftSpan,
  ProjectContractorRoutePicker,
} from './ProjectContractorRoutePicker';
import { getContractorAssessment } from '../utils/contractorAssessment';
import { getCurrentDateKey } from '../utils/scheduleUtils';
import { useAppDialog } from './AppDialogProvider';

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
  onUpdateProject: (project: UndergroundProject) => Promise<boolean>;
}

export const ProjectContractorsPanel: React.FC<ProjectContractorsPanelProps> = ({
  project,
  dailyLogs,
  isAdmin,
  onUpdateProject,
}) => {
  const { showAlert, showConfirm } = useAppDialog();
  const contractors = project.contractors || [];
  const today = getCurrentDateKey();
  const [workingPoints, setWorkingPoints] = useState(project.points);
  const [workingSegments, setWorkingSegments] = useState(project.routeSegments);
  const routePoints = workingPoints.filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)
  );
  const [endpointMode, setEndpointMode] = useState<'start' | 'end'>('start');
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(
    isAdmin && contractors.length === 0 && routePoints.length > 1
  );
  const [expandedContractorId, setExpandedContractorId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = React.useRef(false);
  const [name, setName] = useState('');
  const createEmptySpan = (): ContractorDraftSpan => ({
    id: `span-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    startPointId: '',
    endPointId: '',
  });
  const [draftSegments, setDraftSegments] = useState<ContractorDraftSpan[]>(() => [
    createEmptySpan(),
  ]);
  const [activeDraftSegmentId, setActiveDraftSegmentId] = useState<string>('');
  const resolvedActiveDraftId = draftSegments.some((s) => s.id === activeDraftSegmentId)
    ? activeDraftSegmentId
    : draftSegments[0]?.id || '';
  const activeDraftSpan =
    draftSegments.find((s) => s.id === resolvedActiveDraftId) || draftSegments[0];
  const startPointId = activeDraftSpan?.startPointId || '';
  const endPointId = activeDraftSpan?.endPointId || '';

  const setActiveSpanEndpoints = (nextStartId: string, nextEndId: string) => {
    setDraftSegments((prev) =>
      prev.map((seg) =>
        seg.id === resolvedActiveDraftId
          ? { ...seg, startPointId: nextStartId, endPointId: nextEndId }
          : seg
      )
    );
  };
  const [totalLengthM, setTotalLengthM] = useState(0);
  const [totalChambers, setTotalChambers] = useState(0);
  const [contractValueVND, setContractValueVND] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWorkingPoints(project.points);
    setWorkingSegments(project.routeSegments);
  }, [project.points, project.routeSegments]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    const fresh = createEmptySpan();
    setDraftSegments([fresh]);
    setActiveDraftSegmentId(fresh.id);
    setEndpointMode('start');
    setTotalLengthM(0);
    setTotalChambers(0);
    setContractValueVND(0);
    setError(null);
  };

  const handleOpenAddModal = () => {
    resetForm();
    setWorkingPoints(project.points);
    setWorkingSegments(project.routeSegments);
    setIsFormModalOpen(true);
  };

  const handleEdit = (contractor: ProjectContractor) => {
    setEditingId(contractor.id);
    setName(contractor.name);
    const existingSpans: ContractorDraftSpan[] =
      contractor.segments && contractor.segments.length > 0
        ? contractor.segments.map((s) => ({
            id: s.id,
            startPointId: s.startPointId,
            endPointId: s.endPointId,
          }))
        : [
            {
              id: `span-${contractor.id}-1`,
              startPointId: contractor.startPointId,
              endPointId: contractor.endPointId,
            },
          ];
    setDraftSegments(existingSpans);
    setActiveDraftSegmentId(existingSpans[0]?.id || '');
    setEndpointMode('start');
    setTotalLengthM(contractor.totalLengthM);
    setTotalChambers(contractor.totalChambers);
    setContractValueVND(contractor.contractValueVND);
    setError(null);
    setIsFormModalOpen(true);
  };

  const getOccupiedEdges = () => {
    const occupied = new Set<number>();
    contractors
      .filter((c) => c.id !== editingId)
      .forEach((c) => {
        const cSpans =
          c.segments && c.segments.length > 0
            ? c.segments
            : [{ startPointId: c.startPointId, endPointId: c.endPointId }];
        cSpans.forEach((cSpan) => {
          const from = routePoints.findIndex((p) => p.id === cSpan.startPointId);
          const to = routePoints.findIndex((p) => p.id === cSpan.endPointId);
          if (from >= 0 && to > from) {
            for (let idx = from; idx < to; idx += 1) occupied.add(idx);
          }
        });
      });
    draftSegments
      .filter((d) => d.id !== resolvedActiveDraftId)
      .forEach((d) => {
        const from = routePoints.findIndex((p) => p.id === d.startPointId);
        const to = routePoints.findIndex((p) => p.id === d.endPointId);
        if (from >= 0 && to > from) {
          for (let idx = from; idx < to; idx += 1) occupied.add(idx);
        }
      });
    return occupied;
  };

  const getSegmentBoundsForPoint = (
    pointId: string
  ): { segStartIdx: number; segEndIdx: number; segId?: string } => {
    if (workingSegments && workingSegments.length > 0) {
      const seg = workingSegments.find((s) => s.points.some((p) => p.id === pointId));
      if (seg && seg.points.length > 0) {
        const firstIdx = routePoints.findIndex((p) => p.id === seg.points[0].id);
        const lastIdx = routePoints.findIndex(
          (p) => p.id === seg.points[seg.points.length - 1].id
        );
        if (firstIdx >= 0 && lastIdx >= firstIdx) {
          return { segStartIdx: firstIdx, segEndIdx: lastIdx, segId: seg.id };
        }
      }
    }
    return { segStartIdx: 0, segEndIdx: routePoints.length - 1 };
  };

  const handleSelectRoutePoint = (pointId: string) => {
    const pointIndex = routePoints.findIndex((point) => point.id === pointId);
    const startIndex = routePoints.findIndex((point) => point.id === startPointId);
    if (pointIndex < 0) return;

    const occupiedEdges = getOccupiedEdges();

    if (endpointMode === 'start') {
      const { segStartIdx, segEndIdx } = getSegmentBoundsForPoint(pointId);
      // If user clicked on a point whose outgoing edge is already occupied by another contractor
      if (occupiedEdges.has(pointIndex)) {
        let furthestOccupiedEnd = -1;
        for (let i = segStartIdx; i < segEndIdx; i += 1) {
          if (occupiedEdges.has(i)) {
            furthestOccupiedEnd = i + 1;
          }
        }
        if (furthestOccupiedEnd >= segEndIdx) {
          setError('Tuyến này đã được phân công hết cho nhà thầu khác, không thể chọn thêm.');
          return;
        }
        if (furthestOccupiedEnd > segStartIdx && routePoints[furthestOccupiedEnd]) {
          setActiveSpanEndpoints(routePoints[furthestOccupiedEnd].id, '');
          setEndpointMode('end');
          setError(null);
          return;
        }
      }
      if (pointIndex >= segEndIdx) {
        setError('Điểm đầu không thể là điểm cuối cùng của tuyến.');
        return;
      }
      setActiveSpanEndpoints(pointId, '');
      setEndpointMode('end');
    } else {
      if (startIndex < 0 || pointIndex <= startIndex) return;
      if (workingSegments && workingSegments.length > 1) {
        const startSeg = workingSegments.find((s) =>
          s.points.some((p) => p.id === startPointId)
        );
        const endSeg = workingSegments.find((s) =>
          s.points.some((p) => p.id === pointId)
        );
        if (startSeg && endSeg && startSeg.id !== endSeg.id) {
          setError('Điểm đầu và Điểm cuối phải nằm trên cùng một tuyến.');
          return;
        }
      }
      for (let i = startIndex; i < pointIndex; i += 1) {
        if (occupiedEdges.has(i)) {
          setError(
            'Đoạn vừa chọn chồng lên phần đã giao cho nhà thầu khác. Vui lòng chọn lại.'
          );
          return;
        }
      }
      setActiveSpanEndpoints(startPointId, pointId);
    }
    setError(null);
  };

  const handleInsertRoutePoint = (afterIndex: number, lat: number, lng: number) => {
    const startIndex = routePoints.findIndex((point) => point.id === startPointId);
    if (endpointMode === 'end' && afterIndex < startIndex) return;
    if (endpointMode === 'end' && afterIndex + 1 <= startIndex) return;

    const occupiedEdges = getOccupiedEdges();
    if (occupiedEdges.has(afterIndex)) {
      const anchorPointId = routePoints[afterIndex]?.id;
      if (anchorPointId) {
        const { segStartIdx, segEndIdx } = getSegmentBoundsForPoint(anchorPointId);
        let furthestOccupiedEnd = -1;
        for (let i = segStartIdx; i < segEndIdx; i += 1) {
          if (occupiedEdges.has(i)) {
            furthestOccupiedEnd = i + 1;
          }
        }
        if (furthestOccupiedEnd >= segEndIdx) {
          setError('Tuyến này đã được phân công hết cho nhà thầu khác, không thể chọn thêm.');
          return;
        }
        if (endpointMode === 'start' && furthestOccupiedEnd > segStartIdx && routePoints[furthestOccupiedEnd]) {
          setActiveSpanEndpoints(routePoints[furthestOccupiedEnd].id, '');
          setEndpointMode('end');
          setError(null);
          return;
        }
      }
      setError('Đoạn này đã giao cho nhà thầu khác, không thể chèn điểm tại đây.');
      return;
    }

    const newPoint = {
      id: `contractor-split-${Date.now()}`,
      name: `Mốc phân đoạn ${routePoints.length - 1}`,
      type: 'turn' as const,
      lat,
      lng,
    };
    const anchorId = routePoints[afterIndex]?.id;
    setWorkingPoints((current) => [
      ...current.slice(0, afterIndex + 1),
      newPoint,
      ...current.slice(afterIndex + 1),
    ]);
    if (anchorId) {
      setWorkingSegments((current) =>
        current?.map((seg) => {
          const idx = seg.points.findIndex((p) => p.id === anchorId);
          if (idx < 0) return seg;
          return {
            ...seg,
            points: [
              ...seg.points.slice(0, idx + 1),
              newPoint,
              ...seg.points.slice(idx + 1),
            ],
          };
        })
      );
    }
    if (endpointMode === 'start') {
      setActiveSpanEndpoints(newPoint.id, '');
      setEndpointMode('end');
    } else {
      setActiveSpanEndpoints(startPointId, newPoint.id);
    }
    setError(null);
  };

  const handleAddDraftSegment = () => {
    const fresh = createEmptySpan();
    setDraftSegments((prev) => [...prev, fresh]);
    setActiveDraftSegmentId(fresh.id);
    setEndpointMode('start');
    setError(null);
  };

  const handleDeleteDraftSegment = (segmentId: string) => {
    setDraftSegments((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((s) => s.id !== segmentId);
      if (resolvedActiveDraftId === segmentId) {
        setActiveDraftSegmentId(next[0]?.id || '');
        setEndpointMode('start');
      }
      return next;
    });
  };

  const handleClearActiveEndpoints = () => {
    setActiveSpanEndpoints('', '');
    setEndpointMode('start');
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    const trimmedName = name.trim();
    const validSpans: ContractorRouteSpan[] = [];
    for (const seg of draftSegments) {
      const sIdx = routePoints.findIndex((p) => p.id === seg.startPointId);
      const eIdx = routePoints.findIndex((p) => p.id === seg.endPointId);
      if (sIdx < 0 || eIdx <= sIdx) continue;
      validSpans.push({
        id: seg.id,
        startPointId: seg.startPointId,
        endPointId: seg.endPointId,
        routePoints: routePoints.slice(sIdx, eIdx + 1),
      });
    }
    if (!trimmedName || validSpans.length === 0) {
      setError('Hãy nhập tên nhà thầu và chọn ít nhất 1 tuyến (Điểm đầu, Điểm cuối) trên bản đồ.');
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
        const cSpans =
          contractor.segments && contractor.segments.length > 0
            ? contractor.segments
            : [{ startPointId: contractor.startPointId, endPointId: contractor.endPointId }];
        cSpans.forEach((cSpan) => {
          const from = routePoints.findIndex((point) => point.id === cSpan.startPointId);
          const to = routePoints.findIndex((point) => point.id === cSpan.endPointId);
          if (from >= 0 && to > from) {
            for (let index = from; index < to; index += 1) occupiedRouteIndices.add(index);
          }
        });
      });

    for (const span of validSpans) {
      const sIdx = routePoints.findIndex((p) => p.id === span.startPointId);
      const eIdx = routePoints.findIndex((p) => p.id === span.endPointId);
      for (let index = sIdx; index < eIdx; index += 1) {
        if (occupiedRouteIndices.has(index)) {
          setError('Đoạn tuyến này đã giao cho nhà thầu khác. Hãy chọn một đoạn chưa phân công.');
          return;
        }
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

    const primarySpan = validSpans[0];
    const newContractor: ProjectContractor = {
      id: editingId || `contractor-${Date.now()}`,
      name: trimmedName,
      color: previousContractor?.color || CONTRACTOR_COLORS[contractors.length % CONTRACTOR_COLORS.length],
      startPointId: primarySpan.startPointId,
      endPointId: primarySpan.endPointId,
      routePoints: validSpans.flatMap((s) => s.routePoints),
      segments: validSpans,
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

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (await onUpdateProject({
        ...project,
        points: workingPoints,
        routeSegments: workingSegments,
        contractors: nextContractors,
        contractor: nextContractors.map((item) => item.name).join(', ') || 'Chưa phân công',
        totalLengthM: nextContractors.reduce((sum, item) => sum + item.totalLengthM, 0),
        totalChambers: nextContractors.reduce((sum, item) => sum + item.totalChambers, 0),
      })) {
        resetForm();
        setIsFormModalOpen(false);
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (contractor: ProjectContractor) => {
    const hasHistory = dailyLogs.some(
      (log) =>
        log.projectId === project.id &&
        getContractorKey(log.contractorName) === getContractorKey(contractor.name)
    );
    if (hasHistory) {
      await showAlert('Không thể xóa nhà thầu đã có nhật ký. Hãy giữ nhà thầu để bảo toàn số liệu lịch sử.');
      return;
    }
    if (!(await showConfirm(`Xóa nhà thầu “${contractor.name}” khỏi dự án?`, 'Xác nhận xóa nhà thầu', 'Xóa'))) return;
    const remainingContractors = contractors.filter((item) => item.id !== contractor.id);
    if (await onUpdateProject({
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
    <section className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 sm:p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <UsersRound className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
          <h4 className="truncate text-xs font-bold text-slate-900">
            Nhà thầu & đoạn tuyến ({contractors.length})
          </h4>
        </div>
        {isAdmin && routePoints.length > 1 && (
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xs hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Thêm nhà thầu</span>
          </button>
        )}
      </div>

      {contractors.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
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
              complete: 'Hoàn thành',
              on_schedule: 'Đúng tiến độ',
              behind_schedule: 'Nguy cơ trễ',
              overdue: 'Quá hạn',
              insufficient_data: 'Chưa đủ DL',
            }[assessment.overallStatus];
            const scheduleStatusClasses = {
              complete: 'bg-emerald-100 text-emerald-800',
              on_schedule: 'bg-emerald-100 text-emerald-800',
              behind_schedule: 'bg-amber-100 text-amber-800',
              overdue: 'bg-red-100 text-red-800',
              insufficient_data: 'bg-slate-100 text-slate-600',
            }[assessment.overallStatus];
            const isExpanded = expandedContractorId === contractor.id;

            return (
              <article key={contractor.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: contractor.color }}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="break-words text-xs font-bold text-slate-900">
                          {contractor.name}
                        </p>
                        <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${scheduleStatusClasses}`}>
                          {scheduleStatusLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">
                        {startName} → {endName}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedContractorId((curr) =>
                          curr === contractor.id ? null : contractor.id
                        )
                      }
                      title="Xem chi tiết đánh giá KLTB"
                      className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEdit(contractor)}
                          aria-label={`Sửa ${contractor.name}`}
                          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-blue-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(contractor)}
                          aria-label={`Xóa ${contractor.name}`}
                          className="rounded-md p-1 text-slate-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Compact 3-column summary row */}
                <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
                  <div className="rounded-lg bg-slate-50 px-2 py-1 text-slate-600">
                    <span className="block text-[9px] text-slate-400">Đoạn tuyến</span>
                    <strong className="font-mono text-slate-900">
                      {formatNumber(latestLog?.cumulativeTrenchM || 0)}/{formatNumber(contractor.totalLengthM)}m
                    </strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2 py-1 text-slate-600">
                    <span className="block text-[9px] text-slate-400">Hố ga</span>
                    <strong className="font-mono text-slate-900">
                      {formatNumber(latestLog?.cumulativeChambers || 0)}/{formatNumber(contractor.totalChambers)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-indigo-50/70 px-2 py-1 text-indigo-900">
                    <span className="block text-[9px] text-indigo-500">Hợp đồng</span>
                    <strong className="font-mono">
                      {formatNumber(contractor.contractValueVND)} VNĐ
                    </strong>
                  </div>
                </div>

                {isExpanded && (
                  <section
                    className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-2 text-[10px]"
                    aria-label={`Đánh giá tiến độ ${contractor.name}`}
                  >
                    <div className="grid grid-cols-4 gap-1 text-center">
                      <div className="rounded bg-white px-1.5 py-1">
                        <span className="block text-[9px] text-slate-400">Làm</span>
                        <strong className="font-mono text-slate-900">{formatNumber(assessment.workDays)}d</strong>
                      </div>
                      <div className="rounded bg-white px-1.5 py-1">
                        <span className="block text-[9px] text-slate-400">Nghỉ</span>
                        <strong className="font-mono text-slate-900">{formatNumber(assessment.restDays)}d</strong>
                      </div>
                      <div className="rounded bg-white px-1.5 py-1">
                        <span className="block text-[9px] text-slate-400">Đã đào</span>
                        <strong className="font-mono text-slate-900">{formatNumber(assessment.excavationTotalM)}m</strong>
                      </div>
                      <div className="rounded bg-white px-1.5 py-1">
                        <span className="block text-[9px] text-slate-400">Còn lại</span>
                        <strong className="font-mono text-slate-900">{formatNumber(assessment.remainingM)}m</strong>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 rounded bg-blue-50 px-2 py-1 text-blue-900">
                      <span>
                        KLTB:{' '}
                        <strong className="font-mono">
                          {assessment.averagePerWorkdayM === null
                            ? '—'
                            : `${formatNumber(assessment.averagePerWorkdayM)} m/ngày`}
                        </strong>
                      </span>
                      {assessment.requiredPerDayM !== null && (
                        <span>
                          Cần đạt:{' '}
                          <strong className="font-mono">
                            {formatNumber(assessment.requiredPerDayM)} m/ngày
                          </strong>
                        </span>
                      )}
                    </div>
                  </section>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2.5 text-center text-[11px] text-slate-400">
          Chưa có nhà thầu nào được phân công đoạn tuyến.
        </p>
      )}

      {/* Full-Screen Contractor & Route Assignment Modal (Maximized Map Space) */}
      {isAdmin &&
        isFormModalOpen &&
        routePoints.length > 1 &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/80 backdrop-blur-xs sm:p-2">
            <form
              onSubmit={handleSubmit}
              className="flex h-dvh w-full flex-col overflow-hidden bg-white sm:h-[calc(100dvh-1rem)] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl"
            >
              {/* Compact Header */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-900 px-3 py-2 text-white sm:px-4">
                <div className="min-w-0">
                  <h3 className="truncate text-xs font-extrabold sm:text-sm">
                    {editingId ? 'Cập Nhật Nhà Thầu & Đoạn Tuyến' : 'Thêm Nhà Thầu & Chọn Đoạn Tuyến'}
                  </h3>
                  <p className="truncate text-[10px] text-slate-300">{project.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsFormModalOpen(false);
                  }}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                  aria-label="Đóng"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {error && (
                <div
                  role="alert"
                  className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-700"
                >
                  {error}
                </div>
              )}

              {/* Compact Input Bar (Doesn't steal map height) */}
              <div className="grid grid-cols-2 gap-1.5 border-b border-slate-200 bg-slate-50 px-2.5 py-2 sm:grid-cols-4 sm:gap-2 sm:px-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[10px] font-bold text-slate-600">
                    Tên nhà thầu <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    placeholder="Nhập tên công ty..."
                    className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600">
                    Chiều dài (m) <span className="text-red-500">*</span>
                  </label>
                  <FormattedNumberInput
                    min={0}
                    placeholder="0 m"
                    value={totalLengthM > 0 ? totalLengthM : ''}
                    onValueChange={(value) => setTotalLengthM(value === '' ? 0 : value)}
                    className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600">
                    Số hố ga <span className="text-red-500">*</span>
                  </label>
                  <FormattedNumberInput
                    min={0}
                    placeholder="0 hầm"
                    value={totalChambers > 0 ? totalChambers : ''}
                    onValueChange={(value) => setTotalChambers(value === '' ? 0 : value)}
                    className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-[10px] font-bold text-slate-600">
                    Giá trị HĐ (VNĐ)
                  </label>
                  <FormattedNumberInput
                    min={0}
                    placeholder="0 VNĐ"
                    value={contractValueVND > 0 ? contractValueVND : ''}
                    onValueChange={(value) => setContractValueVND(value === '' ? 0 : value)}
                    className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Large Map Area (Takes remaining screen space) */}
              <div className="flex flex-1 min-h-0 flex-col bg-slate-100 p-1.5 sm:p-2">
                <ProjectContractorRoutePicker
                  isFullHeight={true}
                  points={workingPoints}
                  routeSegments={workingSegments}
                  contractors={contractors.filter((contractor) => contractor.id !== editingId)}
                  startPointId={startPointId}
                  endPointId={endPointId}
                  draftSegments={draftSegments}
                  activeDraftSegmentId={resolvedActiveDraftId}
                  onSelectDraftSegment={(id) => {
                    setActiveDraftSegmentId(id);
                    setEndpointMode('start');
                  }}
                  onAddDraftSegment={handleAddDraftSegment}
                  onDeleteDraftSegment={handleDeleteDraftSegment}
                  onClearEndpoints={handleClearActiveEndpoints}
                  endpointMode={endpointMode}
                  onEndpointModeChange={setEndpointMode}
                  onSelectPoint={handleSelectRoutePoint}
                  onInsertPoint={handleInsertRoutePoint}
                />
              </div>

              {/* Compact Bottom Action Bar */}
              <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsFormModalOpen(false);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-60"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>
                    {isSubmitting
                      ? 'Đang lưu...'
                      : editingId
                      ? 'Lưu cập nhật nhà thầu'
                      : 'Lưu nhà thầu & đoạn tuyến'}
                  </span>
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </section>
  );
};
