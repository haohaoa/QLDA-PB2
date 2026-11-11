import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DailyLogEntry, UndergroundProject, PlanType, ProjectStatus, RouteCoordinatePoint } from '../types/undergrounding';
import { FormattedNumberInput } from './FormattedNumberInput';
import { RouteCoordinatePicker } from './RouteCoordinatePicker';
import { ProjectContractorsPanel } from './ProjectContractorsPanel';
import { useAppDialog } from './AppDialogProvider';
import { formatNumber } from '../utils/numberFormat';
import { generateProjectCode } from '../utils/projectCode';
import {
  FolderPlus,
  MapPin,
  Plus,
  Trash2,
  Save,
  Check,
  Building,
  Banknote,
  Calendar,
  Layers,
  UsersRound,
  CornerDownRight,
  Maximize2,
  Navigation,
  Lock,
  Pencil,
  Download,
  Upload,
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
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const projectFormRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isProjectFormOpen) {
      projectFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isProjectFormOpen]);

  // Form State
  const [name, setName] = useState('');
  const [planTypeId, setPlanTypeId] = useState(planTypes[0]?.id || '');
  const [investor, setInvestor] = useState('FPT Telecom (FTEL INFMN)');
  const [contractValueVND, setContractValueVND] = useState<number>(15000000000); // 15 tỷ
  const [startDate, setStartDate] = useState('2026-10-01');
  const [finishDate, setFinishDate] = useState('2026-12-31');
  const [startPointName, setStartPointName] = useState('Nút giao A (Đầu tuyến)');
  const [endPointName, setEndPointName] = useState('Nút giao B (Cuối tuyến)');

  // Coordinates: Start, Turn points, End
  const [startLat, setStartLat] = useState<number>(16.0520);
  const [startLng, setStartLng] = useState<number>(108.2400);
  const [endLat, setEndLat] = useState<number>(16.0590);
  const [endLng, setEndLng] = useState<number>(108.2290);
  const [turnPoints, setTurnPoints] = useState<Array<{ id: string; name: string; lat: number; lng: number }>>([
    {
      id: 'tp-1',
      name: 'Điểm cua 1: Góc ngã tư đường',
      lat: 16.0555,
      lng: 108.2350,
    },
  ]);

  const handlePlaceRoutePoint = (
    mode: 'start' | 'turn' | 'end',
    lat: number,
    lng: number,
    placeName?: string
  ) => {
    if (mode === 'start') {
      setStartLat(lat);
      setStartLng(lng);
      if (placeName) setStartPointName(placeName);
    } else if (mode === 'end') {
      setEndLat(lat);
      setEndLng(lng);
      if (placeName) setEndPointName(placeName);
    } else {
      setTurnPoints((current) => [
        ...current,
        {
          id: `tp-${Date.now()}`,
          name: placeName ? `Điểm cua ${current.length + 1}: ${placeName}` : `Điểm cua ${current.length + 1}`,
          lat,
          lng,
        },
      ]);
    }
  };

  const handleRemoveTurnPoint = (id: string) => {
    setTurnPoints(turnPoints.filter((p) => p.id !== id));
  };

  const handleProjectStatusChange = async (project: UndergroundProject, status: ProjectStatus) => {
    if ((project.status || 'in_progress') === status) return;
    await onUpdateProject({ ...project, status });
  };

  const handleUpdateTurnPointName = (id: string, name: string) => {
    setTurnPoints((current) => current.map((point) => (point.id === id ? { ...point, name } : point)));
  };

  const resetForm = () => {
    setName('');
    setPlanTypeId(planTypes[0]?.id || '');
    setContractValueVND(15000000000);
    setStartPointName('Nút giao A (Đầu tuyến)');
    setEndPointName('Nút giao B (Cuối tuyến)');
    setTurnPoints([
      {
        id: 'tp-1',
        name: 'Điểm cua 1: Góc ngã tư đường',
        lat: 16.0555,
        lng: 108.2350,
      },
    ]);
    setEditingProjectId(null);
  };

  const closeProjectForm = () => {
    resetForm();
    setIsProjectFormOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !planTypeId) return;

    const existingProject = editingProjectId
      ? projects.find((project) => project.id === editingProjectId)
      : undefined;

    // Build ordered points: start -> turns -> end
    const points: RouteCoordinatePoint[] = [
      {
        id: existingProject?.points.find((point) => point.type === 'start')?.id || `pt-start-${Date.now()}`,
        name: `Điểm bắt đầu: ${startPointName}`,
        type: 'start',
        lat: Number(startLat),
        lng: Number(startLng),
      },
      ...turnPoints.map((tp) => ({
        id: tp.id,
        name: tp.name,
        type: 'turn' as const,
        lat: Number(tp.lat),
        lng: Number(tp.lng),
      })),
      {
        id: existingProject?.points.find((point) => point.type === 'end')?.id || `pt-end-${Date.now()}`,
        name: `Điểm kết thúc: ${endPointName}`,
        type: 'end',
        lat: Number(endLat),
        lng: Number(endLng),
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
        if (updatedContractors.some((contractor) => {
          const startIndex = points.findIndex((point) => point.id === contractor.startPointId);
          const endIndex = points.findIndex((point) => point.id === contractor.endPointId);
          return startIndex < 0 || endIndex <= startIndex;
        })) {
          void showAlert('Không thể xóa hoặc đảo thứ tự mốc đang được nhà thầu sử dụng làm điểm đầu/cuối đoạn tuyến.');
          return;
        }
        const updated: UndergroundProject = {
          ...existing,
          name,
          planTypeId,
          investor,
          contractor: updatedContractors.length
            ? updatedContractors.map((item) => item.name).join(', ')
            : existing.contractor,
          contractValueVND: Number(contractValueVND),
          startDate,
          finishDate,
          totalLengthM: updatedContractors.length
            ? updatedContractors.reduce((sum, item) => sum + item.totalLengthM, 0)
            : existing.totalLengthM,
          totalChambers: updatedContractors.length
            ? updatedContractors.reduce((sum, item) => sum + item.totalChambers, 0)
            : existing.totalChambers,
          startPointName,
          endPointName,
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
        name,
        code,
        planTypeId,
        investor,
        contractor: 'Chưa phân công',
        contractValueVND: Number(contractValueVND),
        startDate,
        finishDate,
        totalLengthM: 0,
        totalChambers: 0,
        startPointName,
        endPointName,
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
            position: [Number(startLat), Number(startLng)],
            locationDescription: startPointName,
            status: 'planned',
            depthMeters: 1.4,
            manholeCoverType: 'Gang cầu tải trọng 25T',
          },
        ],
        photos: [
          {
            id: `p-${Date.now()}`,
            url: '/src/assets/images/underground_conduit_hdpe_1792057789393.jpg',
            title: `Chuẩn bị mặt bằng thi công ngầm hóa ${name}`,
            location: startPointName,
            date: startDate,
            stage: 'trenching',
            stageLabel: 'Mặt bằng thi công',
            supervisor: 'Kỹ sư trưởng phụ trách',
            notes: 'Đã hoàn tất định vị tuyến ngầm, mốc tọa độ và chuẩn bị máy móc.',
            gpsCoords: `${startLat}°N, ${startLng}°E`,
          },
        ],
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
    setIsProjectFormOpen(true);
    setEditingProjectId(project.id);
    setName(project.name);
    setPlanTypeId(
      project.planTypeId || (planTypes.some((type) => type.id === 'plan-type-unclassified')
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
    const endPt = project.points.find((p) => p.type === 'end') || project.points[project.points.length - 1];
    const turns = project.points.filter((p) => p.type === 'turn');

    if (startPt) {
      setStartLat(startPt.lat);
      setStartLng(startPt.lng);
    }
    if (endPt) {
      setEndLat(endPt.lat);
      setEndLng(endPt.lng);
    }
    setTurnPoints(
      turns.map((t) => ({
        id: t.id,
        name: t.name,
        lat: t.lat,
        lng: t.lng,
      }))
    );

    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (projects.some((project) => (project.planTypeId || 'plan-type-unclassified') === planType.id)) {
      await showAlert(`Không thể xóa “${planType.name}” vì đang được sử dụng bởi dự án.`);
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
      setBackupStatus(error instanceof Error ? error.message : 'Không thể tạo tệp sao lưu Excel.');
      setBackupStatusIsError(true);
    } finally {
      setIsBackupBusy(false);
    }
  };

  const handleBackupFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!(await showConfirm(
      'Khôi phục sẽ thay thế toàn bộ dữ liệu hiện tại bằng dữ liệu trong tệp. Bạn có muốn tiếp tục không?',
      'Xác nhận khôi phục dữ liệu',
      'Khôi phục'
    ))) {
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
      setBackupStatus(error instanceof Error ? error.message : 'Không thể khôi phục dữ liệu từ tệp Excel.');
      setBackupStatusIsError(true);
    } finally {
      setIsBackupBusy(false);
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-blue-600 mb-1">
              <FolderPlus className="w-4 h-4" />
              <span>THIẾT LẬP DỰ ÁN NGẦM HÓA</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Tạo & Quản Lý Dự Án Ngầm Hóa
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Quản lý danh mục dự án, chủ đầu tư, nhà thầu thi công, giá trị hợp đồng, chiều dài, số hố ga và tọa độ điểm cua trên tuyến.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            <div className="flex items-center gap-2 text-xs font-mono bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
              <span>Đang quản lý:</span>
              <strong className="text-blue-600 text-sm">{projects.length} Dự án</strong>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isProjectFormOpen && !editingProjectId) closeProjectForm();
                else setIsProjectFormOpen(true);
              }}
              aria-expanded={isProjectFormOpen}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 sm:flex-none"
            >
              <Plus className="h-4 w-4" />
              {isProjectFormOpen && !editingProjectId ? 'Ẩn biểu mẫu' : 'Tạo dự án mới'}
            </button>
          </div>
        </div>

        {savedNotice && (
          <div className="mt-3 p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-200 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{savedNotice}</span>
          </div>
        )}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Layers className="h-4 w-4 text-blue-600" />
              Loại kế hoạch ({planTypes.length})
            </h3>
            <p className="mt-1 text-xs text-slate-500">Quản lý danh mục để gắn loại cho từng dự án.</p>
          </div>
          {isAdmin && (
            <form onSubmit={handleSavePlanType} className="flex w-full gap-2 sm:max-w-md">
              <input
                value={planTypeName}
                onChange={(event) => setPlanTypeName(event.target.value)}
                placeholder={editingPlanTypeId ? 'Tên loại kế hoạch mới' : 'Tên loại kế hoạch'}
                aria-label="Tên loại kế hoạch"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs"
                required
              />
              <button
                type="submit"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
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
                  className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-semibold text-slate-600"
                >
                  Hủy
                </button>
              )}
            </form>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {planTypes.map((planType) => (
            <div
              key={planType.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800"
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
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Building className="h-4 w-4 text-blue-600" />
              Sao lưu & khôi phục dữ liệu
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Xuất toàn bộ dự án, nhật ký, thông báo và loại kế hoạch ra Excel. Khi nhập tệp sao lưu, dữ liệu hiện tại sẽ được thay thế.
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={isBackupBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-800 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Xuất toàn bộ ra Excel
            </button>
            {isAdmin ? (
              <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-800 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-700 ${isBackupBusy ? 'pointer-events-none opacity-60' : ''}`}>
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={handleBackupFileChange}
                  disabled={isBackupBusy}
                  className="sr-only"
                />
                <Upload className="h-4 w-4" />
                Nhập tệp sao lưu
              </label>
            ) : (
              <button
                type="button"
                onClick={onOpenLogin}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-700"
              >
                <Lock className="h-4 w-4 text-amber-400" />
                Đăng nhập Admin để khôi phục
              </button>
            )}
          </div>
        </div>
        {backupStatus && (
          <p
            role={backupStatusIsError ? 'alert' : 'status'}
            className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
              backupStatusIsError
                ? 'border border-red-200 bg-red-50 text-red-800'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            {backupStatus}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12">
        {/* Left Form: Tạo / Cập nhật Dự án (5 columns on desktop) */}
        {isProjectFormOpen && (
        <div ref={projectFormRef} className="min-w-0 scroll-mt-4 bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4 h-fit lg:col-span-5">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                {editingProjectId ? 'Cập Nhật Dự Án' : 'Tạo Dự Án Ngầm Mới'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Nhập đầy đủ thông tin để báo cáo hàng ngày cho các sếp.
              </p>
            </div>
            {editingProjectId && (
              <button
                type="button"
                onClick={closeProjectForm}
                className="text-[11px] text-slate-500 hover:text-slate-800 underline font-semibold"
              >
                Hủy sửa
              </button>
            )}
            {!editingProjectId && (
              <button
                type="button"
                onClick={closeProjectForm}
                className="text-[11px] text-slate-500 hover:text-slate-800 underline font-semibold"
              >
                Đóng
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {/* 1. Tên dự án & Mã */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-slate-700 font-semibold mb-1">
                  Tên Dự Án Ngầm <span className="text-red-500">*</span>:
                </label>
                <input
                  type="text"
                  placeholder="VD: Ngầm hóa tuyến Hoàng Lanh – Vũ Thắng"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium focus:ring-1 focus:ring-blue-600"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Mã Dự Án (tự động):</label>
                <input
                  type="text"
                  value={editingProjectId
                    ? projects.find((project) => project.id === editingProjectId)?.code || ''
                    : name.trim()
                    ? 'Tự tạo theo tên dự án và thời điểm lưu'
                    : ''}
                  placeholder="Tự động tạo khi lưu dự án"
                  readOnly
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-[11px]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block font-semibold text-slate-700">
                Loại kế hoạch <span className="text-red-500">*</span>:
              </label>
              <select
                value={planTypeId}
                onChange={(event) => setPlanTypeId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-medium"
                required
              >
                <option value="" disabled>Chọn loại kế hoạch</option>
                {planTypes.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>

            {/* 2. Chủ đầu tư */}
            <div className="grid grid-cols-1 gap-2.5">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Chủ Đầu Tư <span className="text-red-500">*</span>:
                </label>
                <input
                  type="text"
                  placeholder="VD: FPT Telecom (FTEL INFMN)"
                  value={investor}
                  onChange={(e) => setInvestor(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  required
                />
              </div>
            </div>

            {/* 3. Giá trị HĐ (VNĐ / Tỷ) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-700 font-semibold">Giá Trị Hợp Đồng (VNĐ):</label>
                <span className="font-mono font-bold text-blue-600 text-xs">
                  ≈ {formatNumber(contractValueVND / 1000000000, 2)} Tỷ VNĐ
                </span>
              </div>
              <FormattedNumberInput
                min={0}
                value={contractValueVND}
                onValueChange={(value) => setContractValueVND(value === '' ? 0 : value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold"
                required
              />
            </div>

            {/* 4. Ngày bắt đầu & Ngày hoàn tất */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Ngày Bắt Đầu:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Ngày Hoàn Tất:</label>
                <input
                  type="date"
                  value={finishDate}
                  onChange={(e) => setFinishDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                  required
                />
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-200/90 pt-3">
              <div>
                <span className="block font-bold text-slate-900">Tọa Độ Tuyến Ngầm (GIS)</span>
                <span className="text-[10px] text-slate-500">
                  Chọn loại mốc rồi nhấp lên bản đồ. Các điểm sẽ được nối theo thứ tự tuyến.
                </span>
              </div>

              <RouteCoordinatePicker
                startPoint={{ lat: startLat, lng: startLng }}
                endPoint={{ lat: endLat, lng: endLng }}
                turnPoints={turnPoints}
                onPlacePoint={handlePlaceRoutePoint}
              />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-[11px] font-semibold text-slate-700">
                  Tên điểm đầu
                  <input
                    type="text"
                    value={startPointName}
                    onChange={(event) => setStartPointName(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                    required
                  />
                  <span className="mt-1 block font-mono text-[10px] text-slate-500">
                    {startLat.toFixed(6)}, {startLng.toFixed(6)}
                  </span>
                </label>
                <label className="text-[11px] font-semibold text-slate-700">
                  Tên điểm cuối
                  <input
                    type="text"
                    value={endPointName}
                    onChange={(event) => setEndPointName(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                    required
                  />
                  <span className="mt-1 block font-mono text-[10px] text-slate-500">
                    {endLat.toFixed(6)}, {endLng.toFixed(6)}
                  </span>
                </label>
              </div>

              {turnPoints.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-slate-700">
                    Điểm cua ({turnPoints.length})
                  </span>
                  {turnPoints.map((point, index) => (
                    <div
                      key={point.id}
                      className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2 sm:flex-nowrap"
                    >
                      <CornerDownRight className="h-4 w-4 shrink-0 text-amber-700" />
                      <input
                        type="text"
                        value={point.name}
                        onChange={(event) => handleUpdateTurnPointName(point.id, event.target.value)}
                        aria-label={`Tên điểm cua ${index + 1}`}
                        className="min-w-0 flex-1 rounded-md border border-amber-200 bg-white px-2 py-1.5 text-xs"
                      />
                      <span className="ml-6 font-mono text-[10px] text-slate-600 sm:ml-0 sm:shrink-0">
                        {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTurnPoint(point.id)}
                        className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-700"
                        title="Xóa điểm cua"
                        aria-label={`Xóa điểm cua ${index + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              {isAdmin ? (
                <button
                  type="submit"
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingProjectId ? 'Cập Nhật Dự Án' : 'Lưu & Khởi Tạo Dự Án Ngầm'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenLogin}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-all border border-slate-700 flex items-center justify-center gap-2 shadow-sm"
                >
                  <Lock className="w-4 h-4 text-amber-400" />
                  <span>🔐 Đăng Nhập ADMIN Để Tạo / Sửa Dự Án</span>
                </button>
              )}
            </div>
          </form>
        </div>
        )}

        {/* Right List: Danh sách các dự án ngầm đã tạo (7 columns on desktop) */}
        <div className={`${isProjectFormOpen ? 'lg:col-span-7' : 'lg:col-span-12'} min-w-0 space-y-4`}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                Danh Sách Dự Án Ngầm Hóa ({projects.length} Dự Án)
              </h3>
              <span className="text-xs text-slate-500">Bấm để chỉnh sửa hoặc xem vị trí trên bản đồ</span>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Lọc dự án theo trạng thái">
              {([
                ['in_progress', 'Đang thực hiện'],
                ['paused', 'Tạm ngưng'],
                ['completed', 'Hoàn tất'],
                ['all', 'Tất cả'],
              ] as const).map(([status, label]) => {
                const count = status === 'all'
                  ? projects.length
                  : projects.filter((project) => (project.status || 'in_progress') === status).length;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setProjectStatusFilter(status)}
                    aria-pressed={projectStatusFilter === status}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      projectStatusFilter === status
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <AnimatePresence initial={false}>
            {projects
              .filter((project) =>
                projectStatusFilter === 'all' ||
                (project.status || 'in_progress') === projectStatusFilter
              )
              .map((item) => {
              const status = item.status || 'in_progress';
              const statusLabel = status === 'completed'
                ? 'Hoàn tất'
                : status === 'paused'
                ? 'Tạm ngưng'
                : 'Đang thực hiện';
              const statusClasses = status === 'completed'
                ? 'bg-emerald-50 text-emerald-700'
                : status === 'paused'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-blue-50 text-blue-700';
              const progressPct =
                item.totalLengthM > 0
                  ? Math.round((item.completedLengthM / item.totalLengthM) * 100)
                  : 0;

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className={`min-w-0 bg-white rounded-2xl p-3 sm:p-5 border transition-all shadow-xs ${
                    contractorPanelProjectId === item.id && !item.contractors?.length
                      ? 'border-indigo-300 ring-2 ring-indigo-100'
                      : 'border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  {/* Title & Badge */}
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-words font-bold text-base text-slate-900">{item.name}</span>
                        <span className="text-[10px] font-mono font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                          {item.code}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClasses}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          {planTypes.find((type) => type.id === item.planTypeId)?.name || 'Chưa phân loại'}
                        </span>
                        <span className="min-w-0 break-words">
                          <strong>Chủ đầu tư:</strong> {item.investor}
                        </span>
                        <span className="min-w-0 break-words">
                          <strong>Nhà thầu:</strong>{' '}
                          {item.contractors?.length
                            ? item.contractors.map((contractor) => contractor.name).join(', ')
                            : item.contractor}
                        </span>
                      </div>
                    </div>

                    {(isAdmin || !!item.contractors?.length) && (
                      <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:w-auto sm:shrink-0">
                        <button
                          type="button"
                          onClick={() => setContractorPanelProjectId((current) => current === item.id ? null : item.id)}
                          aria-expanded={contractorPanelProjectId === item.id}
                          className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold leading-tight transition sm:flex-none sm:whitespace-nowrap sm:px-2.5 sm:py-1 sm:text-xs ${
                            contractorPanelProjectId === item.id && !item.contractors?.length
                              ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-200 hover:bg-amber-600'
                              : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                          }`}
                        >
                          <UsersRound className="h-3.5 w-3.5" />
                          {contractorPanelProjectId === item.id && !item.contractors?.length
                            ? 'Thêm nhà thầu ngay'
                            : `Nhà thầu & đánh giá (${item.contractors?.length || 0})`}
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => handleEdit(item)}
                              className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 sm:py-1"
                            >
                              Sửa
                            </button>
                            <select
                              value={status}
                              onChange={(event) => {
                                const nextStatus = event.target.value;
                                if (
                                  nextStatus === 'in_progress' ||
                                  nextStatus === 'paused' ||
                                  nextStatus === 'completed'
                                ) {
                                  handleProjectStatusChange(item, nextStatus);
                                }
                              }}
                              aria-label={`Trạng thái dự án ${item.name}`}
                              className="min-w-0 max-w-none flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 sm:max-w-32 sm:flex-none sm:py-1"
                            >
                              <option value="in_progress">Đang thực hiện</option>
                              <option value="paused">Tạm ngưng</option>
                              <option value="completed">Hoàn tất</option>
                            </select>
                            <button
                              onClick={() => onDeleteProject(item.id)}
                              className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              title="Xóa dự án"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <AnimatePresence initial={false}>
                    {contractorPanelProjectId === item.id && (
                      <motion.div
                        key="contractors-panel"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
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

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3.5 pt-3 border-t border-slate-100 text-xs">
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                      <span className="text-[10px] text-slate-500 block">Giá trị HĐ:</span>
                      <strong className="font-mono text-blue-700 text-sm">
                        {formatNumber(item.contractValueVND / 1000000000, 2)} Tỷ
                      </strong>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                      <span className="text-[10px] text-slate-500 block">Chiều dài tuyến:</span>
                      <strong className="font-mono text-slate-900 text-sm">
                        {formatNumber(item.totalLengthM)} m
                      </strong>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                      <span className="text-[10px] text-slate-500 block">Số lượng hố ga:</span>
                      <strong className="font-mono text-slate-900 text-sm">
                        {item.completedChambers}/{item.totalChambers} hầm
                      </strong>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                      <span className="text-[10px] text-slate-500 block">Thời gian thi công:</span>
                      <span className="font-mono text-slate-700 text-[11px]">
                        {item.startDate.substring(5)} ➔ {item.finishDate.substring(5)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => onSelectProjectOnMap(item.id)}
                      className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs font-semibold"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Xem trên bản đồ</span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
            </AnimatePresence>
            {projects.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                Chưa có dự án nào.
              </p>
            )}
            {projects.length > 0 &&
              !projects.some((project) =>
                projectStatusFilter === 'all' ||
                (project.status || 'in_progress') === projectStatusFilter
              ) && (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                  Không có dự án thuộc trạng thái này.
                </p>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};
