import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  DailyLogEntry,
  UndergroundProject,
  PlanType,
  ProjectStatus,
  RouteCoordinatePoint,
} from '../types/undergrounding';
import { FormattedNumberInput } from './FormattedNumberInput';
import { RouteCoordinatePicker } from './RouteCoordinatePicker';
import { ProjectContractorsPanel } from './ProjectContractorsPanel';
import { useAppDialog } from './AppDialogProvider';
import { formatNumber } from '../utils/numberFormat';
import { generateProjectCode } from '../utils/projectCode';
import {
  FolderPlus,
  Plus,
  Trash2,
  Save,
  Check,
  Database,
  Layers,
  UsersRound,
  Navigation,
  Lock,
  Pencil,
  Download,
  Upload,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  X,
} from 'lucide-react';

interface ProjectManagementProps {
  projects: UndergroundProject[];
  dailyLogs: DailyLogEntry[];
  planTypes: PlanType[];
  onExportBackup: () => Promise<void>;
  onImportBackup: (file: File) => Promise<{
    projects: number;
    dailyLogs: number;
    bulletins: number;
    planTypes: number;
  }>;
  onAddPlanType: (planType: PlanType) => Promise<boolean>;
  onUpdatePlanType: (planType: PlanType) => Promise<boolean>;
  onDeletePlanType: (planTypeId: string) => Promise<boolean>;
  onAddProject: (project: UndergroundProject) => Promise<boolean>;
  onUpdateProject: (project: UndergroundProject) => Promise<boolean>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onSelectProjectOnMap: (projectId: string) => void;
  isAdmin: boolean;
  onOpenLogin?: () => void;
}

export const ProjectManagement: React.FC<ProjectManagementProps> = ({
  projects,
  dailyLogs,
  planTypes,
  onExportBackup,
  onImportBackup,
  onAddPlanType,
  onUpdatePlanType,
  onDeletePlanType,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
  onSelectProjectOnMap,
  isAdmin,
  onOpenLogin,
}) => {
  const { showAlert, showConfirm } = useAppDialog();
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingPlanTypeId, setEditingPlanTypeId] = useState<string | null>(null);
  const [planTypeName, setPlanTypeName] = useState('');
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupStatusIsError, setBackupStatusIsError] = useState(false);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [projectStatusFilter, setProjectStatusFilter] = useState<'all' | ProjectStatus>('in_progress');
  const [contractorPanelProjectId, setContractorPanelProjectId] = useState<string | null>(null);
  const [openStatusMenuProjectId, setOpenStatusMenuProjectId] = useState<string | null>(null);
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [isPlanTypeModalOpen, setIsPlanTypeModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [formError, setFormError] = useState<string | null>(null);

  // Form State — Empty by default so user chooses everything from scratch
  const [name, setName] = useState('');
  const [planTypeId, setPlanTypeId] = useState(planTypes[0]?.id || '');
  const [investor, setInvestor] = useState('');
  const [contractValueVND, setContractValueVND] = useState<number>(0);
  const [startDate, setStartDate] = useState('');
  const [finishDate, setFinishDate] = useState('');
  const [startPointName, setStartPointName] = useState('');
  const [endPointName, setEndPointName] = useState('');

  // Coordinates: Start, Turn points, End — Empty by default (no sample points)
  const [startPoint, setStartPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [endPoint, setEndPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [turnPoints, setTurnPoints] = useState<
    Array<{ id: string; name: string; lat: number; lng: number }>
  >([]);

  const handlePlaceRoutePoint = (
    mode: 'start' | 'turn' | 'end',
    lat: number,
    lng: number,
    placeName?: string
  ) => {
    setFormError(null);
    if (mode === 'start') {
      setStartPoint({ lat, lng });
      if (placeName) setStartPointName(placeName);
    } else if (mode === 'end') {
      setEndPoint({ lat, lng });
      if (placeName) setEndPointName(placeName);
    } else {
      setTurnPoints((current) => [
        ...current,
        {
          id: `tp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: placeName
            ? `Điểm cua ${current.length + 1}: ${placeName}`
            : `Điểm cua ${current.length + 1}`,
          lat,
          lng,
        },
      ]);
    }
  };

  const handleRemoveTurnPoint = (id: string) => {
    setTurnPoints((current) => current.filter((p) => p.id !== id));
  };

  const handleProjectStatusChange = async (
    project: UndergroundProject,
    status: ProjectStatus
  ) => {
    if ((project.status || 'in_progress') === status) return;
    await onUpdateProject({ ...project, status });
  };

  const handleUpdateTurnPointName = (id: string, nextName: string) => {
    setTurnPoints((current) =>
      current.map((point) => (point.id === id ? { ...point, name: nextName } : point))
    );
  };

  const resetForm = () => {
    setName('');
    setPlanTypeId(planTypes[0]?.id || '');
    setInvestor('');
    setContractValueVND(0);
    setStartDate('');
    setFinishDate('');
    setStartPointName('');
    setEndPointName('');
    setStartPoint(null);
    setEndPoint(null);
    setTurnPoints([]);
    setEditingProjectId(null);
    setFormStep(1);
    setFormError(null);
  };

  const closeProjectForm = () => {
    resetForm();
    setIsProjectFormOpen(false);
  };

  const validateStep1 = (): boolean => {
    if (!name.trim()) {
      setFormError('Vui lòng nhập Tên Dự Án Ngầm.');
      return false;
    }
    if (!planTypeId) {
      setFormError('Vui lòng chọn Loại kế hoạch.');
      return false;
    }
    if (!investor.trim()) {
      setFormError('Vui lòng nhập Chủ đầu tư.');
      return false;
    }
    if (!startDate || !finishDate) {
      setFormError('Vui lòng chọn Ngày bắt đầu và Ngày hoàn tất.');
      return false;
    }
    if (finishDate < startDate) {
      setFormError('Ngày hoàn tất phải sau hoặc bằng Ngày bắt đầu.');
      return false;
    }
    setFormError(null);
    return true;
  };

  const handleGoToStep2 = () => {
    if (validateStep1()) {
      setFormStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep1()) {
      setFormStep(1);
      return;
    }
    if (!startPoint || !endPoint) {
      setFormError('Vui lòng chấm đủ Điểm đầu và Điểm cuối trên bản đồ.');
      setFormStep(2);
      return;
    }

    const resolvedStartName =
      startPointName.trim() ||
      `Điểm đầu (${startPoint.lat.toFixed(5)}, ${startPoint.lng.toFixed(5)})`;
    const resolvedEndName =
      endPointName.trim() ||
      `Điểm cuối (${endPoint.lat.toFixed(5)}, ${endPoint.lng.toFixed(5)})`;

    const existingProject = editingProjectId
      ? projects.find((project) => project.id === editingProjectId)
      : undefined;

    const points: RouteCoordinatePoint[] = [
      {
        id:
          existingProject?.points.find((point) => point.type === 'start')?.id ||
          `pt-start-${Date.now()}`,
        name: resolvedStartName.startsWith('Điểm bắt đầu:')
          ? resolvedStartName
          : `Điểm bắt đầu: ${resolvedStartName}`,
        type: 'start',
        lat: Number(startPoint.lat),
        lng: Number(startPoint.lng),
      },
      ...turnPoints.map((tp) => ({
        id: tp.id,
        name: tp.name,
        type: 'turn' as const,
        lat: Number(tp.lat),
        lng: Number(tp.lng),
      })),
      {
        id:
          existingProject?.points.find((point) => point.type === 'end')?.id ||
          `pt-end-${Date.now()}`,
        name: resolvedEndName.startsWith('Điểm kết thúc:')
          ? resolvedEndName
          : `Điểm kết thúc: ${resolvedEndName}`,
        type: 'end',
        lat: Number(endPoint.lat),
        lng: Number(endPoint.lng),
      },
    ];

    if (editingProjectId) {
      const existing = existingProject;
      if (existing) {
        const updatedContractors = (existing.contractors || []).map((contractor) => {
          const startIndex = points.findIndex((point) => point.id === contractor.startPointId);
          const endIndex = points.findIndex((point) => point.id === contractor.endPointId);
          return {
            ...contractor,
            routePoints:
              startIndex >= 0 && endIndex > startIndex
                ? points.slice(startIndex, endIndex + 1)
                : contractor.routePoints,
          };
        });
        if (
          updatedContractors.some((contractor) => {
            const startIndex = points.findIndex((point) => point.id === contractor.startPointId);
            const endIndex = points.findIndex((point) => point.id === contractor.endPointId);
            return startIndex < 0 || endIndex <= startIndex;
          })
        ) {
          void showAlert(
            'Không thể xóa hoặc đảo thứ tự mốc đang được nhà thầu sử dụng làm điểm đầu/cuối đoạn tuyến.'
          );
          return;
        }
        const updated: UndergroundProject = {
          ...existing,
          name: name.trim(),
          planTypeId,
          investor: investor.trim(),
          contractor: updatedContractors.length
            ? updatedContractors.map((item) => item.name).join(', ')
            : existing.contractor,
          contractValueVND: Number(contractValueVND) || 0,
          startDate,
          finishDate,
          totalLengthM: updatedContractors.length
            ? updatedContractors.reduce((sum, item) => sum + item.totalLengthM, 0)
            : existing.totalLengthM,
          totalChambers: updatedContractors.length
            ? updatedContractors.reduce((sum, item) => sum + item.totalChambers, 0)
            : existing.totalChambers,
          startPointName: resolvedStartName,
          endPointName: resolvedEndName,
          points,
          contractors: updatedContractors,
        };
        if (!(await onUpdateProject(updated))) return;
        setSavedNotice(`Đã cập nhật dự án: ${name}`);
      }
    } else {
      const code = generateProjectCode(name.trim());
      const newProject: UndergroundProject = {
        id: `prj-${Date.now()}`,
        status: 'in_progress',
        name: name.trim(),
        code,
        planTypeId,
        investor: investor.trim(),
        contractor: 'Chưa phân công',
        contractValueVND: Number(contractValueVND) || 0,
        startDate,
        finishDate,
        totalLengthM: 0,
        totalChambers: 0,
        startPointName: resolvedStartName,
        endPointName: resolvedEndName,
        currentWorkLocation: '',
        completedLengthM: 0,
        completedChambers: 0,
        points,
        chambers: [
          {
            id: `cb-${Date.now()}-1`,
            code: `BC-${code}-01`,
            type: 'Bể cáp kéo tiêu chuẩn (B1)',
            dimensions: '1.8m x 1.2m x 1.4m',
            position: [Number(startPoint.lat), Number(startPoint.lng)],
            locationDescription: resolvedStartName,
            status: 'planned',
            depthMeters: 1.4,
            manholeCoverType: 'Gang cầu tải trọng 25T',
          },
        ],
        photos: [],
      };

      if (!(await onAddProject(newProject))) return;
      setContractorPanelProjectId(newProject.id);
      setSavedNotice(`Đã tạo thành công Dự án ngầm: ${name}`);
    }

    resetForm();
    setIsProjectFormOpen(false);
    setTimeout(() => setSavedNotice(null), 3000);
  };

  const handleEdit = (project: UndergroundProject) => {
    setEditingProjectId(project.id);
    setName(project.name);
    setPlanTypeId(
      project.planTypeId ||
        (planTypes.some((type) => type.id === 'plan-type-unclassified')
          ? 'plan-type-unclassified'
          : planTypes[0]?.id || '')
    );
    setInvestor(project.investor);
    setContractValueVND(project.contractValueVND);
    setStartDate(project.startDate);
    setFinishDate(project.finishDate);
    setStartPointName(project.startPointName);
    setEndPointName(project.endPointName);

    const startPt = project.points.find((p) => p.type === 'start') || project.points[0];
    const endPt =
      project.points.find((p) => p.type === 'end') ||
      (project.points.length > 1 ? project.points[project.points.length - 1] : undefined);
    const turns = project.points.filter((p) => p.type === 'turn');

    setStartPoint(startPt ? { lat: startPt.lat, lng: startPt.lng } : null);
    setEndPoint(endPt ? { lat: endPt.lat, lng: endPt.lng } : null);
    setTurnPoints(
      turns.map((t) => ({
        id: t.id,
        name: t.name,
        lat: t.lat,
        lng: t.lng,
      }))
    );
    setFormStep(1);
    setFormError(null);
    setIsProjectFormOpen(true);
  };

  const handleSavePlanType = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = planTypeName.trim();
    if (!trimmedName) return;

    const saved = await (editingPlanTypeId
      ? onUpdatePlanType({ id: editingPlanTypeId, name: trimmedName })
      : onAddPlanType({ id: `plan-type-${Date.now()}`, name: trimmedName }));
    if (saved) {
      setPlanTypeName('');
      setEditingPlanTypeId(null);
    }
  };

  const handleRemovePlanType = async (planType: PlanType) => {
    if (planTypes.length <= 1) {
      await showAlert('Cần giữ lại ít nhất một loại kế hoạch.');
      return;
    }
    if (
      projects.some(
        (project) => (project.planTypeId || 'plan-type-unclassified') === planType.id
      )
    ) {
      await showAlert(
        `Không thể xóa “${planType.name}” vì đang được sử dụng bởi dự án.`
      );
      return;
    }
    await onDeletePlanType(planType.id);
  };

  const handleExportBackup = async () => {
    setIsBackupBusy(true);
    setBackupStatus(null);
    try {
      await onExportBackup();
      setBackupStatus('Đã tải xuống tệp sao lưu đầy đủ dữ liệu QLDA.');
      setBackupStatusIsError(false);
    } catch (error) {
      setBackupStatus(
        error instanceof Error ? error.message : 'Không thể tạo tệp sao lưu Excel.'
      );
      setBackupStatusIsError(true);
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleBackupFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !(await showConfirm(
        'Khôi phục sẽ thay thế toàn bộ dữ liệu hiện tại bằng dữ liệu trong tệp. Bạn có muốn tiếp tục không?',
        'Xác nhận khôi phục dữ liệu',
        'Khôi phục'
      ))
    ) {
      event.target.value = '';
      return;
    }

    setIsBackupBusy(true);
    setBackupStatus(null);
    try {
      const restored = await onImportBackup(file);
      setBackupStatus(
        `Đã khôi phục ${restored.projects} dự án, ${restored.dailyLogs} nhật ký, ${restored.bulletins} thông báo và ${restored.planTypes} loại kế hoạch.`
      );
      setBackupStatusIsError(false);
    } catch (error) {
      setBackupStatus(
        error instanceof Error ? error.message : 'Không thể khôi phục dữ liệu từ tệp Excel.'
      );
      setBackupStatusIsError(true);
    } finally {
      setIsBackupBusy(false);
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-2.5 sm:space-y-4 pb-8">
      {/* Compact Mobile-App Style Header & Filter Bar */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-2.5 sm:p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FolderPlus className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-sm sm:text-lg font-extrabold text-slate-900">
                  Quản Lý Dự Án
                </h2>
                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-700 border border-blue-200/60">
                  {projects.length} DA
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-500">
                Thiết lập tuyến ngầm GIS, phân công nhà thầu và theo dõi tiến độ hợp đồng
              </p>
            </div>
          </div>

          {/* Action Icons (Loại kế hoạch, Sao lưu) + Primary Create Button */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsPlanTypeModalOpen(true)}
              title={`Quản lý Loại kế hoạch (${planTypes.length})`}
              aria-label="Mở cửa sổ Loại kế hoạch"
              className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 hover:text-blue-700"
            >
              <Layers className="h-4 w-4 text-blue-600" />
              <span className="hidden md:inline">Loại KH ({planTypes.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setBackupStatus(null);
                setIsBackupModalOpen(true);
              }}
              title="Sao lưu & Khôi phục dữ liệu Excel"
              aria-label="Mở cửa sổ Sao lưu và khôi phục"
              className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 hover:text-blue-700"
            >
              <Database className="h-4 w-4 text-indigo-600" />
              <span className="hidden md:inline">Sao lưu</span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsProjectFormOpen(true);
              }}
              aria-expanded={isProjectFormOpen}
              className="inline-flex h-8 sm:h-9 items-center justify-center gap-1 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white shadow-2xs transition hover:bg-blue-700 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              <span>Tạo dự án</span>
            </button>
          </div>
        </div>

        {/* Single-row Horizontal Scrollable Filter Pills */}
        <div
          className="mt-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-slate-100 pt-2"
          aria-label="Lọc dự án theo trạng thái"
        >
          {(
            [
              ['in_progress', 'Đang thực hiện'],
              ['paused', 'Tạm ngưng'],
              ['completed', 'Hoàn tất'],
              ['all', 'Tất cả'],
            ] as const
          ).map(([status, label]) => {
            const count =
              status === 'all'
                ? projects.length
                : projects.filter((project) => (project.status || 'in_progress') === status)
                    .length;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setProjectStatusFilter(status)}
                aria-pressed={projectStatusFilter === status}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  projectStatusFilter === status
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>

        {savedNotice && (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{savedNotice}</span>
          </div>
        )}
      </div>

      {/* Modal 1: Quản lý Loại kế hoạch (Opened from Header Icon) */}
      {isPlanTypeModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Loại kế hoạch ({planTypes.length})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Phân loại danh mục kế hoạch cho các dự án
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingPlanTypeId(null);
                    setPlanTypeName('');
                    setIsPlanTypeModalOpen(false);
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {isAdmin && (
                <form onSubmit={handleSavePlanType} className="mt-3 flex gap-1.5">
                  <input
                    value={planTypeName}
                    onChange={(event) => setPlanTypeName(event.target.value)}
                    placeholder={
                      editingPlanTypeId ? 'Tên loại kế hoạch mới...' : 'Nhập tên loại kế hoạch...'
                    }
                    aria-label="Tên loại kế hoạch"
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-blue-600 focus:bg-white"
                    required
                  />
                  <button
                    type="submit"
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {editingPlanTypeId ? 'Lưu' : 'Thêm'}
                  </button>
                  {editingPlanTypeId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlanTypeId(null);
                        setPlanTypeName('');
                      }}
                      className="rounded-xl border border-slate-300 px-2.5 py-2 text-xs font-semibold text-slate-600"
                    >
                      Hủy
                    </button>
                  )}
                </form>
              )}

              <div className="mt-3 flex max-h-64 flex-wrap gap-1.5 overflow-y-auto py-1">
                {planTypes.map((planType) => (
                  <div
                    key={planType.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800"
                  >
                    <span>{planType.name}</span>
                    {isAdmin && planType.id !== 'plan-type-unclassified' && (
                      <>
                        <button
                          type="button"
                          aria-label={`Sửa loại ${planType.name}`}
                          onClick={() => {
                            setEditingPlanTypeId(planType.id);
                            setPlanTypeName(planType.name);
                          }}
                          className="rounded-full p-0.5 text-blue-600 hover:bg-blue-100"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Xóa loại ${planType.name}`}
                          onClick={() => handleRemovePlanType(planType)}
                          className="rounded-full p-0.5 text-slate-500 hover:bg-red-100 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal 2: Sao lưu & Khôi phục dữ liệu (Opened from Header Icon) */}
      {isBackupModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Database className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Sao lưu & Khôi phục dữ liệu
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Xuất hoặc nhập tệp dữ liệu Excel (.xlsx) toàn hệ thống
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBackupModalOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-600">
                Tệp sao lưu bao gồm toàn bộ dự án, tọa độ tuyến, nhật ký thi công, thông báo và loại kế hoạch.
              </p>

              <div className="mt-3.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  disabled={isBackupBusy}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  <span>Xuất sao lưu</span>
                </button>
                {isAdmin ? (
                  <label
                    className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-800 ${
                      isBackupBusy ? 'pointer-events-none opacity-60' : ''
                    }`}
                  >
                    <input
                      type="file"
                      accept=".xlsx"
                      onChange={handleBackupFileChange}
                      disabled={isBackupBusy}
                      className="sr-only"
                    />
                    <Upload className="h-4 w-4" />
                    <span>Nhập sao lưu</span>
                  </label>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsBackupModalOpen(false);
                      onOpenLogin?.();
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-700"
                  >
                    <Lock className="h-3.5 w-3.5 text-amber-400" />
                    <span>Mở khóa</span>
                  </button>
                )}
              </div>

              {backupStatus && (
                <p
                  role={backupStatusIsError ? 'alert' : 'status'}
                  className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${
                    backupStatusIsError
                      ? 'border border-red-200 bg-red-50 text-red-800'
                      : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                  }`}
                >
                  {backupStatus}
                </p>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Full-Screen 2-Step Project & GIS Route Wizard */}
      {isProjectFormOpen &&
        createPortal(
          <div className="fixed inset-0 z-[90] flex flex-col bg-slate-950/80 backdrop-blur-xs sm:p-2">
            <form
              onSubmit={handleSubmit}
              className="flex h-dvh w-full flex-col overflow-hidden bg-white sm:h-[calc(100dvh-1rem)] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl"
            >
              {/* Single-Row Ultra-Compact Top Wizard Header */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-900 px-2.5 py-2 text-white sm:px-4">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="hidden sm:flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                    <FolderPlus className="h-3.5 w-3.5" />
                  </div>
                  <h3 className="truncate text-xs font-extrabold sm:text-sm">
                    {editingProjectId ? 'Cập Nhật Dự Án' : 'Tạo Dự Án Mới'}
                  </h3>
                </div>

                {/* Compact Step Switcher Pills */}
                <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-800 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setFormStep(1);
                    }}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-bold transition-all ${
                      formStep === 1
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <span>1. Thông tin</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGoToStep2}
                    className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-bold transition-all ${
                      formStep === 2
                        ? 'bg-teal-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <span>2. Bản đồ tuyến</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={closeProjectForm}
                  aria-label="Đóng"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Error Banner */}
              {formError && (
                <div
                  role="alert"
                  className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-800"
                >
                  {formError}
                </div>
              )}

              {/* STEP 1: THÔNG TIN DỰ ÁN CƠ BẢN */}
              {formStep === 1 && (
                <div className="flex-1 overflow-y-auto bg-slate-50/60 p-3 sm:p-6">
                  <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs sm:p-6">
                    <div className="mb-3.5 border-b border-slate-100 pb-2.5">
                      <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                        Bước 1 / 2
                      </span>
                      <h4 className="mt-0.5 text-sm font-extrabold text-slate-900 sm:text-base">
                        Thông tin dự án ngầm hóa
                      </h4>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        <div className="sm:col-span-2">
                          <label className="mb-1 block font-bold text-slate-700">
                            Tên Dự Án Ngầm <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="Nhập tên dự án ngầm hóa..."
                            value={name}
                            onChange={(e) => {
                              setName(e.target.value);
                              setFormError(null);
                            }}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-bold text-slate-700">
                            Mã Dự Án (tự động)
                          </label>
                          <input
                            type="text"
                            value={
                              editingProjectId
                                ? projects.find((project) => project.id === editingProjectId)
                                    ?.code || ''
                                : name.trim()
                                ? generateProjectCode(name.trim())
                                : ''
                            }
                            placeholder="Tự động tạo"
                            readOnly
                            className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-xs font-bold text-blue-800"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block font-bold text-slate-700">
                            Loại kế hoạch <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={planTypeId}
                            onChange={(event) => {
                              setPlanTypeId(event.target.value);
                              setFormError(null);
                            }}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 outline-none focus:border-blue-600"
                          >
                            <option value="" disabled>
                              Chọn loại kế hoạch
                            </option>
                            {planTypes.map((type) => (
                              <option key={type.id} value={type.id}>
                                {type.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="mb-1 block font-bold text-slate-700">
                            Chủ Đầu Tư <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="Nhập tên chủ đầu tư..."
                            value={investor}
                            onChange={(e) => {
                              setInvestor(e.target.value);
                              setFormError(null);
                            }}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 outline-none focus:border-blue-600"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="font-bold text-slate-700">
                            Giá Trị Hợp Đồng (VNĐ)
                          </label>
                          {contractValueVND > 0 && (
                            <span className="font-mono text-[11px] font-bold text-blue-600">
                              ≈ {formatNumber(contractValueVND / 1000000000, 2)} Tỷ VNĐ
                            </span>
                          )}
                        </div>
                        <FormattedNumberInput
                          min={0}
                          placeholder="Nhập giá trị hợp đồng (VNĐ)..."
                          value={contractValueVND > 0 ? contractValueVND : ''}
                          onValueChange={(value) =>
                            setContractValueVND(value === '' ? 0 : value)
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs sm:text-sm font-bold text-slate-900 outline-none focus:border-blue-600"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="mb-1 block font-bold text-slate-700">
                            Ngày Bắt Đầu <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => {
                              setStartDate(e.target.value);
                              setFormError(null);
                            }}
                            className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs font-medium text-slate-900 outline-none focus:border-blue-600"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block font-bold text-slate-700">
                            Ngày Hoàn Tất <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            value={finishDate}
                            onChange={(e) => {
                              setFinishDate(e.target.value);
                              setFormError(null);
                            }}
                            className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs font-medium text-slate-900 outline-none focus:border-blue-600"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
                      <button
                        type="button"
                        onClick={closeProjectForm}
                        className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                      >
                        Hủy
                      </button>

                      <button
                        type="button"
                        onClick={handleGoToStep2}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-2xs transition hover:bg-blue-700"
                      >
                        <span>Tiếp theo: Chọn bản đồ tuyến</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: BẢN ĐỒ TUYẾN TOÀN MÀN HÌNH (Maximized Map Space) */}
              {formStep === 2 && (
                <div className="flex flex-1 min-h-0 flex-col bg-slate-100 sm:p-2">
                  <RouteCoordinatePicker
                    isFullScreen={true}
                    startPoint={startPoint}
                    endPoint={endPoint}
                    startPointName={startPointName}
                    endPointName={endPointName}
                    onStartPointNameChange={setStartPointName}
                    onEndPointNameChange={setEndPointName}
                    turnPoints={turnPoints}
                    onPlacePoint={handlePlaceRoutePoint}
                    onRemoveTurnPoint={handleRemoveTurnPoint}
                    onUpdateTurnPointName={handleUpdateTurnPointName}
                    onClearStartPoint={() => {
                      setStartPoint(null);
                      setStartPointName('');
                    }}
                    onClearEndPoint={() => {
                      setEndPoint(null);
                      setEndPointName('');
                    }}
                  />

                  {/* Single-Row Compact Bottom Bar */}
                  <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-2.5 py-2 sm:mt-1.5 sm:rounded-xl sm:border sm:px-4">
                    <button
                      type="button"
                      onClick={() => setFormStep(1)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Bước 1</span>
                    </button>

                    {isAdmin ? (
                      <button
                        type="submit"
                        className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-blue-700 active:scale-[0.98]"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>
                          {editingProjectId ? 'Lưu cập nhật dự án' : 'Lưu & Khởi tạo dự án'}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onOpenLogin}
                        className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
                      >
                        <Lock className="h-3.5 w-3.5 text-amber-400" />
                        <span>Đăng nhập ADMIN để lưu</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </form>
          </div>,
          document.body
        )}

      {/* Compact Mobile-App Style Project List */}
      <div className="space-y-2.5">
        <AnimatePresence initial={false}>
          {projects
            .filter(
              (project) =>
                projectStatusFilter === 'all' ||
                (project.status || 'in_progress') === projectStatusFilter
            )
            .map((item) => {
              const status = item.status || 'in_progress';
              const statusShortLabel =
                status === 'completed'
                  ? 'HT'
                  : status === 'paused'
                  ? 'TN'
                  : 'ĐTH';
              const statusLabel =
                status === 'completed'
                  ? 'Hoàn tất'
                  : status === 'paused'
                  ? 'Tạm ngưng'
                  : 'Đang thực hiện';
              const statusClasses =
                status === 'completed'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : status === 'paused'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200';
              const statusDotClass =
                status === 'completed'
                  ? 'bg-emerald-500'
                  : status === 'paused'
                  ? 'bg-amber-500'
                  : 'bg-blue-600';
              const progressPct =
                item.totalLengthM > 0
                  ? Math.round((item.completedLengthM / item.totalLengthM) * 100)
                  : 0;
              const isStatusMenuOpen = openStatusMenuProjectId === item.id;

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className={`min-w-0 rounded-2xl border bg-white p-3 sm:p-4 shadow-2xs transition-all ${
                    contractorPanelProjectId === item.id && !item.contractors?.length
                      ? 'border-indigo-300 ring-2 ring-indigo-100'
                      : 'border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  {/* Row 1: Project Title on Left + Compact Abbreviated Status & Icons on Right */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="break-words text-sm sm:text-base font-extrabold text-slate-900 leading-snug">
                        {item.name}
                      </h4>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                          {planTypes.find((type) => type.id === item.planTypeId)?.name ||
                            'Chưa phân loại'}
                        </span>
                        <span className="truncate">
                          CĐT: <strong className="font-semibold text-slate-700">{item.investor}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Right Controls: Compact Status Dropdown (ĐTH / TN / HT) + Edit + Delete */}
                    <div className="flex shrink-0 items-center gap-1">
                      {isAdmin ? (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenStatusMenuProjectId((curr) =>
                                curr === item.id ? null : item.id
                              )
                            }
                            title={`Trạng thái: ${statusLabel} (Nhấn để đổi)`}
                            aria-label={`Trạng thái dự án ${item.name}: ${statusLabel}`}
                            aria-expanded={isStatusMenuOpen}
                            className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[10px] font-extrabold transition ${statusClasses}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
                            <span>{statusShortLabel}</span>
                            <ChevronDown className="h-3 w-3 opacity-75" />
                          </button>

                          {isStatusMenuOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-30"
                                onClick={() => setOpenStatusMenuProjectId(null)}
                              />
                              <div
                                role="listbox"
                                aria-label="Chọn trạng thái dự án"
                                className="absolute right-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
                              >
                                {(
                                  [
                                    ['in_progress', 'Đang thực hiện', 'ĐTH', 'bg-blue-600'],
                                    ['paused', 'Tạm ngưng', 'TN', 'bg-amber-500'],
                                    ['completed', 'Hoàn tất', 'HT', 'bg-emerald-500'],
                                  ] as const
                                ).map(([val, fullText, shortText, dotColor]) => {
                                  const isSelected = status === val;
                                  return (
                                    <button
                                      key={val}
                                      type="button"
                                      role="option"
                                      aria-selected={isSelected}
                                      onClick={() => {
                                        setOpenStatusMenuProjectId(null);
                                        void handleProjectStatusChange(item, val);
                                      }}
                                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition ${
                                        isSelected
                                          ? 'bg-blue-50/80 font-bold text-blue-900'
                                          : 'font-medium text-slate-700 hover:bg-slate-50'
                                      }`}
                                    >
                                      <span className="flex items-center gap-2">
                                        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                                        <span>{fullText}</span>
                                      </span>
                                      <span className="font-mono text-[10px] font-bold text-slate-400">
                                        {shortText}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <span
                          title={statusLabel}
                          className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[10px] font-extrabold ${statusClasses}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
                          <span>{statusShortLabel}</span>
                        </span>
                      )}

                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEdit(item)}
                            title="Sửa dự án & tuyến"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteProject(item.id)}
                            title="Xóa dự án"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Single-Row 4-Column Compact Metrics Strip */}
                  <div className="mt-2.5 grid grid-cols-4 gap-1 rounded-xl border border-slate-100 bg-slate-50/90 px-2 py-1.5 text-center">
                    <div className="min-w-0">
                      <span className="block truncate text-[9px] text-slate-400">Giá trị HĐ</span>
                      <strong className="block truncate font-mono text-[11px] sm:text-xs font-bold text-blue-700">
                        {formatNumber(item.contractValueVND / 1000000000, 2)} Tỷ
                      </strong>
                    </div>
                    <div className="min-w-0 border-l border-slate-200/70 pl-1">
                      <span className="block truncate text-[9px] text-slate-400">
                        Tuyến ({progressPct}%)
                      </span>
                      <strong className="block truncate font-mono text-[11px] sm:text-xs font-bold text-slate-900">
                        {formatNumber(item.totalLengthM)}m
                      </strong>
                    </div>
                    <div className="min-w-0 border-l border-slate-200/70 pl-1">
                      <span className="block truncate text-[9px] text-slate-400">Hố ga</span>
                      <strong className="block truncate font-mono text-[11px] sm:text-xs font-bold text-slate-900">
                        {item.completedChambers}/{item.totalChambers}
                      </strong>
                    </div>
                    <div className="min-w-0 border-l border-slate-200/70 pl-1">
                      <span className="block truncate text-[9px] text-slate-400">Tiến độ</span>
                      <span className="block truncate font-mono text-[10px] sm:text-[11px] font-semibold text-slate-700">
                        {item.startDate.substring(5)}→{item.finishDate.substring(5)}
                      </span>
                    </div>
                  </div>

                  {/* Row 3: Bottom Bar (Contractor Info + Subtle Tiny Code on Left | Thầu & Bản đồ Buttons on Right) */}
                  <div className="mt-2 flex items-center justify-between gap-2 pt-0.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-slate-600">
                        <span className="text-slate-400">Thầu:</span>{' '}
                        <span className="font-medium text-slate-700">
                          {item.contractors?.length
                            ? item.contractors.map((contractor) => contractor.name).join(', ')
                            : item.contractor}
                        </span>
                      </p>
                      <span className="block truncate font-mono text-[9px] text-slate-400">
                        Mã: {item.code}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {(isAdmin || !!item.contractors?.length) && (
                        <button
                          type="button"
                          onClick={() =>
                            setContractorPanelProjectId((current) =>
                              current === item.id ? null : item.id
                            )
                          }
                          aria-expanded={contractorPanelProjectId === item.id}
                          className={`inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition ${
                            contractorPanelProjectId === item.id
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'border border-indigo-100 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                          }`}
                        >
                          <UsersRound className="h-3.5 w-3.5" />
                          <span>Thầu ({item.contractors?.length || 0})</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onSelectProjectOnMap(item.id)}
                        title="Xem trên bản đồ GIS"
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-blue-200/80 bg-blue-50/70 px-2.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                      >
                        <Navigation className="h-3 w-3" />
                        <span>Bản đồ</span>
                      </button>
                    </div>
                  </div>

                  {/* Expandable Contractors Panel */}
                  <AnimatePresence initial={false}>
                    {contractorPanelProjectId === item.id && (
                      <motion.div
                        key="contractors-panel"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <ProjectContractorsPanel
                          project={item}
                          dailyLogs={dailyLogs}
                          isAdmin={isAdmin}
                          onUpdateProject={onUpdateProject}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
        </AnimatePresence>

        {projects.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
            Chưa có dự án nào. Nhấn <strong>+ Tạo dự án</strong> để bắt đầu.
          </p>
        )}
        {projects.length > 0 &&
          !projects.some(
            (project) =>
              projectStatusFilter === 'all' ||
              (project.status || 'in_progress') === projectStatusFilter
          ) && (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
              Không có dự án thuộc trạng thái này.
            </p>
          )}
      </div>
    </div>
  );
};
