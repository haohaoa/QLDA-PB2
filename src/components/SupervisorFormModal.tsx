import React, { useState, useEffect, useRef } from 'react';
import { DailyLogDraft, DailyLogEntry, UndergroundProject, ViolationReport } from '../types/undergrounding';
import { FormattedNumberInput } from './FormattedNumberInput';
import { getCurrentDateKey } from '../utils/scheduleUtils';
import { deleteViolationImage, uploadViolationImage } from '../utils/appDataStorage';
import { hasAssignedProjectContractor } from '../utils/projectContractors';
import { getViolationPhotoUrls } from '../utils/violationPhotos';
import { getDailyLogPhotoUrls } from '../utils/dailyLogPhotos';
import { ViolationPhotoImage } from './ViolationPhotoImage';
import {
  X,
  Camera,
  HardHat,
  AlertTriangle,
  FileWarning,
  CheckCircle2,
  Clock,
  LoaderCircle,
} from 'lucide-react';

interface SupervisorFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (entry: DailyLogDraft) => boolean | Promise<boolean>;
  projects: UndergroundProject[];
  editingLog?: DailyLogEntry | null;
  defaultDate?: string;
  defaultProjectId?: string;
  defaultContractorName?: string;
  sessionToken?: string;
}

export const SupervisorFormModal: React.FC<SupervisorFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  projects,
  editingLog,
  defaultDate,
  defaultProjectId,
  defaultContractorName,
  sessionToken,
}) => {
  const [date, setDate] = useState<string>(
    editingLog?.date || defaultDate || getCurrentDateKey()
  );
  const [projectId, setProjectId] = useState<string>(
    editingLog?.projectId || defaultProjectId || projects[0]?.id || ''
  );

  const currentProject = projects.find((p) => p.id === projectId) || projects[0];
  const requiresContractorAssignment =
    !!currentProject && !editingLog && !hasAssignedProjectContractor(currentProject);

  const [contractorName, setContractorName] = useState<string>(
    editingLog?.contractorName ||
      defaultContractorName ||
      currentProject?.contractors?.[0]?.name ||
      currentProject?.contractor ||
      'Minh Ngọc'
  );

  // Sync when defaultProjectId or defaultDate change
  useEffect(() => {
    if (!isOpen) return;
    if (editingLog) {
      setProjectId(editingLog.projectId);
      setContractorName(editingLog.contractorName);
      return;
    }
    if (defaultProjectId) {
      setProjectId(defaultProjectId);
      const proj = projects.find((p) => p.id === defaultProjectId);
      if (proj) {
        setContractorName(
          defaultContractorName ||
            proj.contractors?.[0]?.name ||
            proj.contractor
        );
      }
    }
  }, [isOpen, editingLog?.id, defaultProjectId, defaultContractorName]);

  useEffect(() => {
    if (defaultDate) {
      setDate(defaultDate);
    }
  }, [defaultDate]);

  // Resource status
  const [resourceType, setResourceType] = useState<'working' | 'stopped'>(
    editingLog?.stoppageReason || editingLog?.resources.toLowerCase().includes('nghỉ')
      ? 'stopped'
      : 'working'
  );
  const [customResource, setCustomResource] = useState<string>(editingLog?.resources || '');
  const [excavationToday, setExcavationToday] = useState<string>(
    editingLog ? String(editingLog.excavationTodayM) : ''
  );
  const [chambersToday, setChambersToday] = useState<number>(editingLog?.chambersPouredToday || 0);
  const [pipeLaidToday, setPipeLaidToday] = useState<number>(editingLog?.pipeLaidTodayM || 0);
  const [restoredToday, setRestoredToday] = useState<number>(editingLog?.restoredTodayM || 0);
  const [stoppageReason, setStoppageReason] = useState<string>(
    editingLog?.stoppageReason || ''
  );
  const [supervisorName, setSupervisorName] = useState<string>(
    editingLog?.supervisorName || 'KS. Nguyễn Văn Hùng'
  );
  const [notes, setNotes] = useState<string>(editingLog?.notes || '');
  const [dailyPhotoUrls, setDailyPhotoUrls] = useState<string[]>(
    () => getDailyLogPhotoUrls(editingLog)
  );
  const uploadedDailyPhotoUrls = useRef(new Set<string>());
  const [isUploadingDailyPhoto, setIsUploadingDailyPhoto] = useState(false);
  const [isDeletingDailyPhoto, setIsDeletingDailyPhoto] = useState(false);
  const [dailyPhotoError, setDailyPhotoError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- VIOLATION REPORT / BIÊN BẢN XỬ LÝ SAI BẢN VẼ THIẾT KẾ ---
  const [hasViolation, setHasViolation] = useState<boolean>(
    !!editingLog?.violationReport?.hasViolation
  );
  const [violationCode, setViolationCode] = useState<string>(
    editingLog?.violationReport?.code || `BB-XL-${Date.now().toString().slice(-4)}/2026`
  );
  const [violationType, setViolationType] = useState<ViolationReport['violationType']>(
    editingLog?.violationReport?.violationType || 'sai_ban_ve_thiet_ke'
  );
  const [violationDescription, setViolationDescription] = useState<string>(
    editingLog?.violationReport?.description || ''
  );
  const [violationCorrectiveAction, setViolationCorrectiveAction] = useState<string>(
    editingLog?.violationReport?.correctiveAction || ''
  );
  const [violationPhotoUrls, setViolationPhotoUrls] = useState<string[]>(
    () => getViolationPhotoUrls(editingLog?.violationReport)
  );
  const uploadedViolationPhotoUrls = useRef(new Set<string>());
  const [isUploadingViolationPhoto, setIsUploadingViolationPhoto] = useState(false);
  const [isDeletingViolationPhoto, setIsDeletingViolationPhoto] = useState(false);
  const [violationPhotoError, setViolationPhotoError] = useState<string | null>(null);
  const [deadlineHours, setDeadlineHours] = useState<number>(
    editingLog?.violationReport?.deadlineHours || 24
  );
  const [violationStatus, setViolationStatus] = useState<ViolationReport['status']>(
    editingLog?.violationReport?.status || 'pending_fix'
  );

  if (!isOpen) return null;

  const handleProjectSelect = (newProjectId: string) => {
    setProjectId(newProjectId);
    const proj = projects.find((p) => p.id === newProjectId);
    if (proj) {
      setContractorName(proj.contractors?.[0]?.name || proj.contractor);
    }
  };

  const cleanupUncommittedViolationPhotos = async (keepUrls: string[] = []) => {
    setIsDeletingViolationPhoto(true);
    try {
      for (const url of [...uploadedViolationPhotoUrls.current]) {
        if (keepUrls.includes(url)) continue;
        await deleteViolationImage(url, sessionToken);
        uploadedViolationPhotoUrls.current.delete(url);
      }
    } finally {
      setIsDeletingViolationPhoto(false);
    }
  };

  const cleanupUncommittedDailyPhotos = async (keepUrls: string[] = []) => {
    setIsDeletingDailyPhoto(true);
    try {
      for (const url of [...uploadedDailyPhotoUrls.current]) {
        if (keepUrls.includes(url)) continue;
        await deleteViolationImage(url, sessionToken);
        uploadedDailyPhotoUrls.current.delete(url);
      }
    } finally {
      setIsDeletingDailyPhoto(false);
    }
  };

  const removeDailyPhoto = async (url: string) => {
    const nextPhotoUrls = dailyPhotoUrls.filter((photoUrl) => photoUrl !== url);
    setDailyPhotoUrls(nextPhotoUrls);
    setDailyPhotoError(null);
    if (!uploadedDailyPhotoUrls.current.has(url)) return;

    setIsDeletingDailyPhoto(true);
    try {
      await deleteViolationImage(url, sessionToken);
      uploadedDailyPhotoUrls.current.delete(url);
    } catch (error) {
      setDailyPhotoUrls((current) =>
        current.includes(url) ? current : [...current, url]
      );
      setDailyPhotoError(
        error instanceof Error
          ? `Chưa xóa được ảnh nhật ký chưa lưu khỏi Drive: ${error.message}`
          : 'Chưa xóa được ảnh nhật ký chưa lưu khỏi Google Drive.'
      );
    } finally {
      setIsDeletingDailyPhoto(false);
    }
  };

  const removeViolationPhoto = async (url: string) => {
    const nextPhotoUrls = violationPhotoUrls.filter((photoUrl) => photoUrl !== url);
    setViolationPhotoUrls(nextPhotoUrls);
    setViolationPhotoError(null);
    if (!uploadedViolationPhotoUrls.current.has(url)) return;

    setIsDeletingViolationPhoto(true);
    try {
      await deleteViolationImage(url, sessionToken);
      uploadedViolationPhotoUrls.current.delete(url);
    } catch (error) {
      setViolationPhotoUrls((current) =>
        current.includes(url) ? current : [...current, url]
      );
      setViolationPhotoError(
        error instanceof Error
          ? `Chưa xóa được ảnh chưa lưu khỏi Drive: ${error.message}`
          : 'Chưa xóa được ảnh chưa lưu khỏi Google Drive.'
      );
    } finally {
      setIsDeletingViolationPhoto(false);
    }
  };

  const handleClose = async () => {
    if (
      isSubmitting ||
      isUploadingViolationPhoto ||
      isDeletingViolationPhoto ||
      isUploadingDailyPhoto ||
      isDeletingDailyPhoto
    ) return;
    setViolationPhotoError(null);
    setDailyPhotoError(null);
    try {
      await cleanupUncommittedViolationPhotos();
    } catch (error) {
      setViolationPhotoError(
        error instanceof Error
          ? `Chưa xóa được ảnh chưa lưu khỏi Drive: ${error.message}`
          : 'Chưa xóa được ảnh chưa lưu khỏi Google Drive.'
      );
      return;
    }
    try {
      await cleanupUncommittedDailyPhotos();
    } catch (error) {
      setDailyPhotoError(
        error instanceof Error
          ? `Chưa xóa được ảnh báo cáo chưa lưu khỏi Drive: ${error.message}`
          : 'Chưa xóa được ảnh báo cáo chưa lưu khỏi Google Drive.'
      );
      return;
    }
    onClose();
  };

  const getViolationTypeLabel = (type: ViolationReport['violationType']) => {
    switch (type) {
      case 'sai_ban_ve_thiet_ke':
        return 'Thi công sai bản vẽ thiết kế kỹ thuật duyệt';
      case 'sai_do_sau_ranh':
        return 'Sai cao độ / không đạt độ sâu chôn ống ngầm (-1.2m)';
      case 'sai_tim_tuyen':
        return 'Đào sai tim tuyến / lấn chiếm hành lang công trình khác';
      case 'sai_quy_cach_ho_ga':
        return 'Bể cáp thi công sai quy cách kích thước hoặc cốt thép';
      case 'chua_hoan_tra_mat_bang':
        return 'Chưa hoàn trả mặt bằng / thảm nhựa tạm gây nguy hiểm';
      case 'mat_an_toan_gt':
      default:
        return 'Không đảm bảo an toàn giao thông / thiếu biển cảnh báo rào chắn';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      isSubmitting ||
      isUploadingViolationPhoto ||
      isDeletingViolationPhoto ||
      isUploadingDailyPhoto ||
      isDeletingDailyPhoto
    ) return;
    setViolationPhotoError(null);
    setDailyPhotoError(null);
    setSaveError(null);

    try {
      await cleanupUncommittedViolationPhotos(hasViolation ? violationPhotoUrls : []);
    } catch (error) {
      setViolationPhotoError(
        error instanceof Error
          ? `Không thể dọn ảnh đã thay thế khỏi Drive: ${error.message}`
          : 'Không thể dọn ảnh đã thay thế khỏi Google Drive.'
      );
      return;
    }
    try {
      await cleanupUncommittedDailyPhotos(dailyPhotoUrls);
    } catch (error) {
      setDailyPhotoError(
        error instanceof Error
          ? `Không thể dọn ảnh báo cáo đã thay thế khỏi Drive: ${error.message}`
          : 'Không thể dọn ảnh báo cáo đã thay thế khỏi Google Drive.'
      );
      return;
    }

    const finalResource = resourceType === 'working' ? customResource.trim() : 'Nghỉ';

    let violationReportData: ViolationReport | undefined = undefined;
    if (hasViolation) {
      violationReportData = {
        id: editingLog?.violationReport?.id || `viol-${Date.now()}`,
        hasViolation: true,
        code: violationCode,
        violationType,
        violationTypeLabel: getViolationTypeLabel(violationType),
        description: violationDescription,
        correctiveAction: violationCorrectiveAction,
        photoUrls: violationPhotoUrls.length ? violationPhotoUrls : undefined,
        photoUrl: violationPhotoUrls[0],
        deadlineHours: Number(deadlineHours),
        status: violationStatus,
        supervisorSign: supervisorName,
      };
    }

    const payload: DailyLogDraft = {
      stt: editingLog?.stt || 1,
      date,
      contractorName,
      projectId: currentProject?.id || 'prj-hl-vt',
      projectName: currentProject?.name || 'Ngầm hóa tuyến',
      resources: finalResource,
      excavationTodayM: Number(excavationToday) || 0,
      chambersPouredToday: Number(chambersToday) || 0,
      pipeLaidTodayM: Number(pipeLaidToday) || 0,
      restoredTodayM: Number(restoredToday) || 0,
      contractTrenchM: currentProject?.totalLengthM || 2500,
      contractChambers: currentProject?.totalChambers || 30,
      stoppageReason: resourceType === 'stopped' ? stoppageReason.trim() : undefined,
      supervisorName,
      photoUrls: dailyPhotoUrls.length ? dailyPhotoUrls : undefined,
      photoUrl: dailyPhotoUrls[0],
      notes,
      violationReport: violationReportData,
    };

    setIsSubmitting(true);
    try {
      if (!(await onSave(payload))) return;
      uploadedViolationPhotoUrls.current.clear();
      uploadedDailyPhotoUrls.current.clear();
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Không thể lưu báo cáo. Vui lòng thử lại.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full my-auto overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <HardHat className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                {editingLog ? 'Chỉnh Sửa Báo Cáo Ngày' : 'Cập Nhật Nhật Ký & Tiến Độ Hằng Ngày (ADMIN)'}
              </h2>
              <p className="text-xs text-slate-300">
                Ghi nhận số lượng đội thi công, mét đào, hố ga và lập biên bản nếu thi công sai thiết kế
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={
              isSubmitting ||
              isUploadingViolationPhoto ||
              isDeletingViolationPhoto ||
              isUploadingDailyPhoto ||
              isDeletingDailyPhoto
            }
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          onSubmit={handleSubmit}
          aria-busy={
            isSubmitting ||
            isUploadingViolationPhoto ||
            isDeletingViolationPhoto ||
            isUploadingDailyPhoto ||
            isDeletingDailyPhoto
          }
          className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs"
        >
          <fieldset disabled={isSubmitting} className="min-w-0 space-y-4 border-0 p-0">
          {saveError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-xs font-semibold leading-relaxed text-red-800"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
          {/* Row 1: Date & Project & Contractor */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1">Ngày Báo Cáo:</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold font-mono text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Dự Án Ngầm Hóa:</label>
              <select
                value={projectId}
                onChange={(e) => handleProjectSelect(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">Nhà Thầu Thi Công:</label>
              {currentProject?.contractors?.length ? (
                <select
                  value={contractorName}
                  onChange={(e) => setContractorName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-bold text-slate-900 focus:ring-2 focus:ring-blue-600"
                  required
                >
                  {currentProject.contractors.map((contractor) => (
                    <option key={contractor.id} value={contractor.name}>{contractor.name}</option>
                  ))}
                  {editingLog &&
                    !currentProject.contractors.some((contractor) => contractor.name === editingLog.contractorName) && (
                      <option value={editingLog.contractorName}>{editingLog.contractorName} (nhật ký cũ)</option>
                    )}
                </select>
              ) : requiresContractorAssignment ? (
                <div
                  role="status"
                  className="flex min-h-10 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 font-semibold text-amber-900"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Chưa phân công nhà thầu
                </div>
              ) : (
                <input
                  type="text"
                  value={contractorName}
                  onChange={(e) => setContractorName(e.target.value)}
                  placeholder="Nhập tên nhà thầu"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-bold text-slate-900 focus:ring-2 focus:ring-blue-600"
                  required
                />
              )}
            </div>
          </div>
          {requiresContractorAssignment && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              Chưa thể lập báo cáo tiến độ vì dự án chưa có nhà thầu thi công. Hãy phân công nhà thầu trong Quản lý dự án trước.
            </div>
          )}

          {/* Row 2: Resources & Construction Teams */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <span className="font-bold text-slate-900 block">
              Nguồn Lực / Đội Thi Công Trong Ngày:
            </span>

            <div className="grid grid-cols-2 gap-2">
              <label
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer text-xs font-bold transition-all ${
                  resourceType === 'working'
                    ? 'bg-blue-50/80 border-blue-600 text-blue-900 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="resourceType"
                  checked={resourceType === 'working'}
                  onChange={() => setResourceType('working')}
                  className="w-4 h-4 text-blue-600"
                />
                <span>Đi làm</span>
              </label>

              <label
                className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer text-xs font-bold transition-all ${
                  resourceType === 'stopped'
                    ? 'bg-amber-50/80 border-amber-500 text-amber-900 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="resourceType"
                  checked={resourceType === 'stopped'}
                  onChange={() => setResourceType('stopped')}
                  className="w-4 h-4 text-amber-600"
                />
                <span>Nghỉ</span>
              </label>
            </div>

            {resourceType === 'working' ? (
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Đội thi công hôm nay:
                </label>
                <input
                  type="text"
                  value={customResource}
                  onChange={(e) => setCustomResource(e.target.value)}
                  placeholder="VD: 1 đội đào + 1 đội khoan ngầm HDD"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-medium"
                  required
                />
              </div>
            ) : (
              <div>
                <label className="block text-amber-900 font-semibold mb-1">
                  Lý do nghỉ:
                </label>
                <input
                  type="text"
                  value={stoppageReason}
                  onChange={(e) => setStoppageReason(e.target.value)}
                  placeholder="Nhập lý do nghỉ"
                  className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl font-medium"
                  required
                />
              </div>
            )}
          </div>

          {/* Row 3: Daily Output Volumes */}
          <div>
            <span className="font-bold text-slate-900 block mb-2">
              Khối lượng hoàn thành trong ngày:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 focus-within:border-blue-400 focus-within:bg-blue-50/30 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">Đào phui:</label>
                  <span className="text-[10px] font-semibold text-slate-400">mét</span>
                </div>
                <FormattedNumberInput
                  min={0}
                  value={excavationToday === '' ? '' : Number(excavationToday)}
                  onValueChange={(value) => setExcavationToday(value === '' ? '' : String(value))}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-black text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                  required={resourceType === 'working'}
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 focus-within:border-blue-400 focus-within:bg-blue-50/30 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">Lắp ống:</label>
                  <span className="text-[10px] font-semibold text-slate-400">mét</span>
                </div>
                <FormattedNumberInput
                  min={0}
                  value={pipeLaidToday}
                  onValueChange={(value) => setPipeLaidToday(value === '' ? 0 : value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-black text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 focus-within:border-blue-400 focus-within:bg-blue-50/30 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">Đổ hố ga:</label>
                  <span className="text-[10px] font-semibold text-slate-400">hầm</span>
                </div>
                <FormattedNumberInput
                  min={0}
                  value={chambersToday}
                  onValueChange={(value) => setChambersToday(value === '' ? 0 : value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-black text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 focus-within:border-blue-400 focus-within:bg-blue-50/30 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">Hoàn trả thảm:</label>
                  <span className="text-[10px] font-semibold text-slate-400">mét</span>
                </div>
                <FormattedNumberInput
                  min={0}
                  value={restoredToday}
                  onValueChange={(value) => setRestoredToday(value === '' ? 0 : value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-black text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2 font-bold text-blue-950">
              <Camera className="h-4 w-4 text-blue-600" />
              <span>Ảnh báo cáo thi công:</span>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-blue-700 active:scale-95">
              <Camera className="h-3.5 w-3.5" />
              <span>Chọn / chụp ảnh báo cáo</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                disabled={
                  isUploadingDailyPhoto ||
                  isDeletingDailyPhoto ||
                  isUploadingViolationPhoto ||
                  isDeletingViolationPhoto
                }
                onChange={async (event) => {
                  const files = Array.from(event.target.files || []);
                  event.target.value = '';
                  if (files.length === 0) return;

                  setIsUploadingDailyPhoto(true);
                  setDailyPhotoError(null);
                  const uploadErrors: string[] = [];
                  try {
                    for (const file of files) {
                      try {
                        const url = await uploadViolationImage(file, sessionToken);
                        uploadedDailyPhotoUrls.current.add(url);
                        setDailyPhotoUrls((current) =>
                          current.includes(url) ? current : [...current, url]
                        );
                      } catch (error) {
                        uploadErrors.push(
                          `${file.name}: ${
                            error instanceof Error ? error.message : 'Không thể tải ảnh lên.'
                          }`
                        );
                      }
                    }
                  } finally {
                    setIsUploadingDailyPhoto(false);
                  }
                  if (uploadErrors.length > 0) {
                    setDailyPhotoError(uploadErrors.join('\n'));
                  }
                }}
              />
            </label>
            <p className="text-[11px] text-blue-800">
              Có thể chọn nhiều ảnh cùng lúc. Ảnh được lưu cùng thư mục Google Drive với ảnh sai phạm; mỗi ảnh tối đa 8 MB.
            </p>
            {isUploadingDailyPhoto && (
              <p className="text-xs text-blue-800">Đang tải ảnh báo cáo lên Google Drive...</p>
            )}
            {dailyPhotoError && (
              <p role="alert" className="whitespace-pre-line text-xs font-semibold text-red-700">
                {dailyPhotoError}
              </p>
            )}
            {dailyPhotoUrls.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {dailyPhotoUrls.map((url, index) => (
                  <div
                    key={`${url}-${index}`}
                    className="overflow-hidden rounded-xl border border-blue-200 bg-white"
                  >
                    <div className="relative h-28 bg-slate-900">
                      <ViolationPhotoImage
                        src={url}
                        alt={`Ảnh báo cáo thi công ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2 text-[10px] font-semibold text-blue-950">
                      <span>Ảnh {index + 1}</span>
                      <button
                        type="button"
                        disabled={
                          isUploadingDailyPhoto ||
                          isDeletingDailyPhoto ||
                          isUploadingViolationPhoto ||
                          isDeletingViolationPhoto
                        }
                        onClick={() => void removeDailyPhoto(url)}
                        className="text-red-700 underline hover:text-red-900 disabled:opacity-50"
                      >
                        Gỡ ảnh
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION: BIÊN BẢN HIỆN TRƯỜNG (LÀM SAI HOẶC KHÔNG ĐÚNG BẢN VẼ THIẾT KẾ) */}
          <div className="bg-red-50/70 border-2 border-red-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-red-600 shrink-0" />
                <span className="font-extrabold text-xs sm:text-sm text-red-950 uppercase tracking-tight">
                  Lập Biên Bản Hiện Trường (Sai Bản Vẽ Thiết Kế / Vi Phạm)
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer self-start sm:self-auto rounded-lg bg-white/90 border border-red-200 px-2.5 py-1 shadow-2xs">
                <input
                  type="checkbox"
                  checked={hasViolation}
                  onChange={(e) => {
                    setHasViolation(e.target.checked);
                  }}
                  className="w-4 h-4 text-red-600 rounded"
                />
                <span className="font-bold text-xs text-red-700">Có lập biên bản xử lý</span>
              </label>
            </div>

            {hasViolation && (
              <div className="space-y-3 pt-2 border-t border-red-200 animate-in fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-red-900 font-bold mb-1">
                      Mã Số Biên Bản Xử Lý:
                    </label>
                    <input
                      type="text"
                      required={hasViolation}
                      value={violationCode}
                      onChange={(e) => setViolationCode(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-red-300 rounded-xl font-mono font-bold text-red-950"
                    />
                  </div>

                  <div>
                    <label className="block text-red-900 font-bold mb-1">
                      Loại Vi Phạm Kỹ Thuật:
                    </label>
                    <select
                      value={violationType}
                      onChange={(e) => setViolationType(e.target.value as ViolationReport['violationType'])}
                      className="w-full px-3 py-2 bg-white border border-red-300 rounded-xl font-semibold text-slate-900"
                    >
                      <option value="sai_ban_ve_thiet_ke">Thi công sai bản vẽ thiết kế kỹ thuật duyệt</option>
                      <option value="sai_do_sau_ranh">Sai cao độ / không đạt độ sâu rãnh cáp (-1.2m)</option>
                      <option value="sai_tim_tuyen">Đào sai tim tuyến / vi phạm hạ tầng ngầm khác</option>
                      <option value="sai_quy_cach_ho_ga">Bể cáp sai kích thước hình học hoặc nắp bể</option>
                      <option value="chua_hoan_tra_mat_bang">Chưa hoàn trả mặt bằng / thảm nhựa tạm</option>
                      <option value="mat_an_toan_gt">Không đảm bảo an toàn giao thông / thiếu rào chắn</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-red-900 font-bold mb-1">
                    Ghi Chú & Mô Tả Chi Tiết Sai Phạm: <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required={hasViolation}
                    value={violationDescription}
                    onChange={(e) => setViolationDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-red-300 rounded-xl text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-red-900 font-bold mb-1">
                    Biện Pháp Xử Lý & Yêu Cầu Khắc Phục: <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required={hasViolation}
                    value={violationCorrectiveAction}
                    onChange={(e) => setViolationCorrectiveAction(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-red-300 rounded-xl text-slate-900 font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-red-900 font-bold mb-1">
                      Thời Hạn Khắc Phục (Giờ):
                    </label>
                    <select
                      value={deadlineHours}
                      onChange={(e) => setDeadlineHours(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-red-300 rounded-xl font-semibold text-slate-900"
                    >
                      <option value={24}>Khắc phục trong 24 giờ</option>
                      <option value={48}>Khắc phục trong 48 giờ</option>
                      <option value={72}>Khắc phục trong 72 giờ</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-red-900 font-bold mb-1">
                      Tình Trạng Xử Lý:
                    </label>
                    <select
                      value={violationStatus}
                      onChange={(e) => setViolationStatus(e.target.value as ViolationReport['status'])}
                      className="w-full px-3 py-2 bg-white border border-red-300 rounded-xl font-bold text-red-800"
                    >
                      <option value="pending_fix">Đang chờ nhà thầu sửa chữa / khắc phục</option>
                      <option value="fixed">Đã khắc phục đúng thiết kế</option>
                      <option value="rejected_acceptance">Từ chối nghiệm thu dứt khoát</option>
                    </select>
                  </div>
                </div>

                {/* Photo of Violation with Camera Capture / File Upload */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-red-900 font-bold flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-red-600" />
                      <span>Chụp Ảnh / Hình Ảnh Hiện Trường Sai Phạm:</span>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95">
                        <Camera className="w-3.5 h-3.5" />
                        <span>Chọn / chụp ảnh hiện trường</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          multiple
                          className="hidden"
                          disabled={isUploadingViolationPhoto || isDeletingViolationPhoto}
                          onChange={async (e) => {
                            const files = Array.from(e.target.files || []);
                            e.target.value = '';
                            if (files.length === 0) return;

                            setIsUploadingViolationPhoto(true);
                            setViolationPhotoError(null);
                            const uploadErrors: string[] = [];
                            try {
                              for (const file of files) {
                                try {
                                  const url = await uploadViolationImage(file, sessionToken);
                                  uploadedViolationPhotoUrls.current.add(url);
                                  setViolationPhotoUrls((current) =>
                                    current.includes(url) ? current : [...current, url]
                                  );
                                } catch (error) {
                                  uploadErrors.push(
                                    `${file.name}: ${
                                      error instanceof Error ? error.message : 'Không thể tải ảnh lên.'
                                    }`
                                  );
                                }
                              }
                            } finally {
                              setIsUploadingViolationPhoto(false);
                            }
                            if (uploadErrors.length > 0) {
                              setViolationPhotoError(uploadErrors.join('\n'));
                            }
                          }}
                        />
                      </label>
                      {isUploadingViolationPhoto && (
                        <span className="text-xs text-red-800">Đang tải ảnh lên Google Drive...</span>
                      )}
                    </div>

                    <p className="text-[11px] text-red-800">
                      Có thể chọn nhiều ảnh cùng lúc. Mỗi ảnh tối đa 8 MB; hỗ trợ JPEG, PNG, WebP và GIF.
                    </p>

                    {violationPhotoError && (
                      <p role="alert" className="whitespace-pre-line text-xs font-semibold text-red-700">
                        {violationPhotoError}
                      </p>
                    )}
                    {violationPhotoUrls.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {violationPhotoUrls.map((url, index) => (
                          <div
                            key={`${url}-${index}`}
                            className="overflow-hidden rounded-xl border border-red-300 bg-red-100/60"
                          >
                            <div className="relative h-28 bg-slate-900">
                              <ViolationPhotoImage
                                src={url}
                                alt={`Ảnh sai phạm ${index + 1}`}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="flex items-center justify-between gap-2 p-2 text-[10px] font-semibold text-red-950">
                              <span>Ảnh {index + 1}</span>
                              <button
                                type="button"
                                disabled={isUploadingViolationPhoto || isDeletingViolationPhoto}
                                onClick={() => void removeViolationPhoto(url)}
                                className="text-red-700 underline hover:text-red-900 disabled:opacity-50"
                              >
                                Gỡ ảnh
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Row 4: Supervisor & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">
                Kỹ sư / Giám sát hiện trường:
              </label>
              <input
                type="text"
                value={supervisorName}
                onChange={(e) => setSupervisorName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Ghi chú hiện trường:</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="VD: Nghiệm thu đệm cát, che chắn an toàn ban đêm"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              disabled={
                isUploadingViolationPhoto ||
                isDeletingViolationPhoto ||
                isUploadingDailyPhoto ||
                isDeletingDailyPhoto ||
                isSubmitting
              }
              className="flex-1 sm:flex-none px-4 py-2.5 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl font-bold text-xs transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={
                isUploadingViolationPhoto ||
                isDeletingViolationPhoto ||
                isUploadingDailyPhoto ||
                isDeletingDailyPhoto ||
                isSubmitting ||
                requiresContractorAssignment
              }
              className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] text-white font-bold text-xs rounded-xl shadow-xs transition-all disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? <><LoaderCircle className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Đang kiểm tra dữ liệu...</>
                : isUploadingDailyPhoto || isUploadingViolationPhoto
                ? 'Đang tải ảnh...'
                : isDeletingDailyPhoto || isDeletingViolationPhoto
                  ? 'Đang xóa ảnh Drive...'
                  : editingLog
                    ? 'Cập Nhật'
                    : 'Lưu Báo Cáo Ngày & Biên Bản'}
            </button>
          </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
};
