import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { SiteBulletin, UndergroundProject } from '../types/undergrounding';
import { getCurrentDateKey } from '../utils/scheduleUtils';
import {
  Bell,
  AlertTriangle,
  CloudRain,
  FileText,
  FileCheck,
  ShieldAlert,
  Plus,
  CheckCircle2,
  RotateCcw,
  Trash2,
  User,
  ArrowRight,
  Info,
  Pencil,
  Search,
  Lock,
  X,
} from 'lucide-react';

interface BulletinsBoardProps {
  bulletins: SiteBulletin[];
  projects: UndergroundProject[];
  onAddBulletin: (bulletin: SiteBulletin) => Promise<boolean>;
  onUpdateBulletin: (bulletin: SiteBulletin) => Promise<boolean>;
  onDeleteBulletin: (id: string) => Promise<void>;
  onSelectProjectDetail: (projectId: string) => void;
  isAdmin: boolean;
  filterInitialProjectId?: string;
  onOpenLogin?: () => void;
}

export const BulletinsBoard: React.FC<BulletinsBoardProps> = ({
  bulletins,
  projects,
  onAddBulletin,
  onUpdateBulletin,
  onDeleteBulletin,
  onSelectProjectDetail,
  isAdmin,
  filterInitialProjectId = 'all',
  onOpenLogin,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(filterInitialProjectId);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingBulletin, setEditingBulletin] = useState<SiteBulletin | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<SiteBulletin['category']>('temporary_stop');
  const [formProjectId, setFormProjectId] = useState<string>('all');
  const [author, setAuthor] = useState('Kỹ sư Giám sát hiện trường');
  const [date, setDate] = useState(getCurrentDateKey());
  const [content, setContent] = useState('');
  const [documentRefNumber, setDocumentRefNumber] = useState('');
  const [severity, setSeverity] = useState<SiteBulletin['severity']>('warning');

  const activeCount = bulletins.filter((b) => b.isActive).length;
  const criticalCount = bulletins.filter(
    (b) => b.isActive && (b.severity === 'critical' || b.category === 'temporary_stop')
  ).length;

  // Filtered bulletins
  const filteredBulletins = bulletins.filter((b) => {
    if (selectedCategory !== 'all' && b.category !== selectedCategory) return false;
    if (
      selectedProjectId !== 'all' &&
      b.projectId !== 'all' &&
      b.projectId !== selectedProjectId
    ) {
      return false;
    }
    if (statusFilter === 'active' && !b.isActive) return false;
    if (statusFilter === 'closed' && b.isActive) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLocaleLowerCase('vi');
      const matchTitle = b.title.toLocaleLowerCase('vi').includes(q);
      const matchContent = b.content.toLocaleLowerCase('vi').includes(q);
      const matchDoc = (b.documentRefNumber || '').toLocaleLowerCase('vi').includes(q);
      const matchProj = (b.projectName || '').toLocaleLowerCase('vi').includes(q);
      if (!matchTitle && !matchContent && !matchDoc && !matchProj) return false;
    }
    return true;
  });

  const handleOpenCreate = () => {
    setTitle('');
    setCategory('temporary_stop');
    setFormProjectId(selectedProjectId !== 'all' ? selectedProjectId : 'all');
    setAuthor('Kỹ sư Giám sát hiện trường');
    setDate(getCurrentDateKey());
    setContent('');
    setDocumentRefNumber('');
    setSeverity('warning');
    setEditingBulletin(null);
    setShowCreateModal(true);
  };

  const handleOpenEdit = (b: SiteBulletin) => {
    setTitle(b.title);
    setCategory(b.category);
    setFormProjectId(b.projectId);
    setAuthor(b.author);
    setDate(b.date);
    setContent(b.content);
    setDocumentRefNumber(b.documentRefNumber || '');
    setSeverity(b.severity);
    setEditingBulletin(b);
    setShowCreateModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    const projName =
      formProjectId === 'all'
        ? 'Tất cả các dự án'
        : projects.find((p) => p.id === formProjectId)?.name || 'Dự án ngầm';

    if (editingBulletin) {
      const updated: SiteBulletin = {
        ...editingBulletin,
        title: title.trim(),
        category,
        projectId: formProjectId,
        projectName: projName,
        author: author.trim() || 'Kỹ sư Giám sát',
        date,
        content: content.trim(),
        documentRefNumber: documentRefNumber.trim() || undefined,
        severity,
      };
      if (!(await onUpdateBulletin(updated))) return;
    } else {
      const newBulletin: SiteBulletin = {
        id: `blt-${Date.now()}`,
        title: title.trim(),
        category,
        projectId: formProjectId,
        projectName: projName,
        author: author.trim() || 'Kỹ sư Giám sát',
        date,
        content: content.trim(),
        documentRefNumber: documentRefNumber.trim() || undefined,
        severity,
        isActive: true,
      };
      if (!(await onAddBulletin(newBulletin))) return;
    }

    setShowCreateModal(false);
  };

  const handleToggleActive = async (b: SiteBulletin) => {
    await onUpdateBulletin({ ...b, isActive: !b.isActive });
  };

  const getCategoryLabel = (cat: SiteBulletin['category']) => {
    switch (cat) {
      case 'weather':
        return {
          label: 'Mưa bão',
          fullLabel: 'Cảnh báo mưa bão',
          icon: CloudRain,
          color: 'text-amber-700 bg-amber-50 border-amber-200/80',
        };
      case 'permit_legal':
        return {
          label: 'Pháp lý / GP',
          fullLabel: 'Hồ sơ pháp lý / Giấy phép',
          icon: FileCheck,
          color: 'text-blue-700 bg-blue-50 border-blue-200/80',
        };
      case 'temporary_stop':
        return {
          label: 'Tạm dừng',
          fullLabel: 'Tạm dừng thi công',
          icon: ShieldAlert,
          color: 'text-red-700 bg-red-50 border-red-200/80',
        };
      case 'infrastructure_obstacle':
        return {
          label: 'Vướng hạ tầng',
          fullLabel: 'Vướng hạ tầng ngầm',
          icon: AlertTriangle,
          color: 'text-orange-700 bg-orange-50 border-orange-200/80',
        };
      case 'urgent':
      default:
        return {
          label: 'Chỉ đạo khẩn',
          fullLabel: 'Chỉ đạo khẩn cấp',
          icon: Bell,
          color: 'text-purple-700 bg-purple-50 border-purple-200/80',
        };
    }
  };

  const categoryTabs: Array<{ id: string; label: string }> = [
    { id: 'all', label: 'Tất cả' },
    { id: 'temporary_stop', label: '⛔ Tạm dừng' },
    { id: 'permit_legal', label: '📄 Pháp lý / GP' },
    { id: 'infrastructure_obstacle', label: '⚡ Vướng hạ tầng' },
    { id: 'weather', label: '⛈ Mưa bão' },
    { id: 'urgent', label: '🚨 Khẩn cấp' },
  ];

  return (
    <div className="space-y-2.5 sm:space-y-4 pb-8">
      {/* Unified Management Header + KPI Strip + Filter Toolbar */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-2.5 sm:p-4 shadow-2xs space-y-2.5">
        {/* Top Row: Title + KPI Badges + Primary Button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="truncate text-sm sm:text-lg font-extrabold text-slate-900">
                  Thông Báo & Hồ Sơ Hiện Trường
                </h2>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.2 font-mono text-[10px] font-bold text-emerald-700">
                  {activeCount} hiệu lực
                </span>
                {criticalCount > 0 && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.2 font-mono text-[10px] font-bold text-red-700">
                    {criticalCount} khẩn/dừng
                  </span>
                )}
              </div>
              <p className="hidden sm:block text-[11px] text-slate-500">
                Quản lý văn bản pháp lý Sở GTVT, lệnh tạm dừng thi công, vướng hạ tầng và chỉ đạo điều hành
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {isAdmin ? (
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex h-8 sm:h-9 items-center justify-center gap-1 rounded-xl bg-amber-600 px-3 text-xs font-bold text-white shadow-2xs transition hover:bg-amber-700 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
                <span>Phát hành</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenLogin}
                className="inline-flex h-8 sm:h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 text-xs font-bold text-white hover:bg-slate-700"
              >
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                <span>Đăng nhập</span>
              </button>
            )}
          </div>
        </div>

        {/* Search + Project Select + Status Filter Row */}
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-12 sm:gap-2 pt-1 border-t border-slate-100">
          <div className="relative sm:col-span-5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tiêu đề, số hiệu văn bản, dự án..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:col-span-7 sm:grid-cols-7">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              aria-label="Lọc theo dự án"
              className="col-span-1 sm:col-span-4 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white"
            >
              <option value="all">Tất cả dự án ({bulletins.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | 'active' | 'closed')
              }
              aria-label="Lọc theo hiệu lực"
              className="col-span-1 sm:col-span-3 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:bg-white"
            >
              <option value="all">Mọi trạng thái ({bulletins.length})</option>
              <option value="active">● Đang hiệu lực ({activeCount})</option>
              <option value="closed">
                ✓ Đã đóng ({bulletins.length - activeCount})
              </option>
            </select>
          </div>
        </div>

        {/* Single-Row Scrollable Category Pills */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar"
          aria-label="Lọc theo danh mục thông báo"
        >
          {categoryTabs.map((tab) => {
            const count =
              tab.id === 'all'
                ? bulletins.length
                : bulletins.filter((b) => b.category === tab.id).length;
            const isSelected = selectedCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedCategory(tab.id)}
                aria-pressed={isSelected}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  isSelected
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* High-Density Management Feed */}
      <div className="space-y-2">
        {filteredBulletins.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <Info className="mx-auto mb-1.5 h-6 w-6 text-slate-400" />
            <h4 className="text-xs font-bold text-slate-700">
              Không có thông báo hoặc hồ sơ nào khớp bộ lọc
            </h4>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Nhấn nút <strong>+ Phát hành</strong> trên góc phải để tạo thông báo mới.
            </p>
          </div>
        ) : (
          filteredBulletins.map((b) => {
            const catInfo = getCategoryLabel(b.category);
            const Icon = catInfo.icon;
            const isExpanded = !!expandedIds[b.id];
            const isLongContent = b.content.length > 140;

            return (
              <article
                key={b.id}
                className={`rounded-xl border bg-white p-2.5 sm:p-3.5 shadow-2xs transition-all ${
                  !b.isActive
                    ? 'border-l-4 border-l-slate-300 border-slate-200 bg-slate-50/70 opacity-75'
                    : b.severity === 'critical'
                    ? 'border-l-4 border-l-red-600 border-slate-200'
                    : b.severity === 'warning'
                    ? 'border-l-4 border-l-amber-500 border-slate-200'
                    : 'border-l-4 border-l-blue-600 border-slate-200'
                }`}
              >
                {/* Row 1: Badges + Date + Quick Action Buttons */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${catInfo.color}`}
                    >
                      <Icon className="h-3 w-3 shrink-0" />
                      <span>{catInfo.label}</span>
                    </span>

                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                        b.severity === 'critical'
                          ? 'bg-red-600 text-white'
                          : b.severity === 'warning'
                          ? 'bg-amber-500 text-white'
                          : 'bg-blue-600 text-white'
                      }`}
                    >
                      {b.severity === 'critical'
                        ? 'Khẩn'
                        : b.severity === 'warning'
                        ? 'Cảnh báo'
                        : 'Tin'}
                    </span>

                    {b.documentRefNumber && (
                      <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                        <FileText className="h-2.5 w-2.5 text-amber-700" />
                        {b.documentRefNumber}
                      </span>
                    )}

                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                        b.isActive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {b.isActive ? '● Hiệu lực' : '✓ Đã đóng'}
                    </span>
                  </div>

                  {/* Right Side: Date & Compact Action Bar */}
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="font-mono text-[10px] font-semibold text-slate-400">
                      {b.date.split('-').reverse().join('/')}
                    </span>

                    {b.projectId !== 'all' && (
                      <button
                        type="button"
                        onClick={() => onSelectProjectDetail(b.projectId)}
                        title="Mở báo cáo chi tiết dự án"
                        className="inline-flex h-6 items-center gap-0.5 rounded-lg bg-slate-900 px-2 text-[10px] font-bold text-white hover:bg-slate-800"
                      >
                        <span className="hidden sm:inline">Dự án</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}

                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(b)}
                          title={b.isActive ? 'Đóng thông báo' : 'Mở lại thông báo'}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                        >
                          {b.isActive ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEdit(b)}
                          title="Sửa thông báo"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteBulletin(b.id)}
                          title="Xóa thông báo"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Row 2: Project Pill + Title */}
                <div className="mt-1.5 flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                  <span className="inline-block w-fit shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-800 border border-blue-100">
                    {b.projectName}
                  </span>
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                    {b.title}
                  </h3>
                </div>

                {/* Row 3: Compact Content & Author */}
                <div className="mt-1.5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[11px] sm:text-xs text-slate-600 leading-relaxed whitespace-pre-line ${
                        !isExpanded && isLongContent ? 'line-clamp-2' : ''
                      }`}
                    >
                      {b.content}
                    </p>
                    {isLongContent && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedIds((prev) => ({ ...prev, [b.id]: !prev[b.id] }))
                        }
                        className="mt-0.5 text-[10px] font-bold text-blue-600 hover:underline"
                      >
                        {isExpanded ? 'Thu gọn' : 'Xem đầy đủ...'}
                      </button>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1 text-[10px] text-slate-400">
                    <User className="h-3 w-3" />
                    <span>{b.author}</span>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Create / Edit Bulletin Modal */}
      {showCreateModal &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/60 p-3 backdrop-blur-xs">
            <div className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 sm:text-base">
                      {editingBulletin
                        ? 'Cập Nhật Thông Báo Hiện Trường'
                        : 'Phát Hành Thông Báo / Hồ Sơ Mới'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Cập nhật lệnh tạm dừng, giấy phép thi công hoặc cảnh báo hiện trường
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="mb-1 block font-bold text-slate-700">
                    Tiêu Đề Thông Báo / Cảnh Báo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nhập tiêu đề thông báo..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-bold text-slate-700">
                      Dự Án Áp Dụng <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formProjectId}
                      onChange={(e) => setFormProjectId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-500 focus:bg-white"
                    >
                      <option value="all">★ Toàn hệ thống (Tất cả dự án)</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block font-bold text-slate-700">
                      Phân Loại <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={category}
                      onChange={(e) =>
                        setCategory(e.target.value as SiteBulletin['category'])
                      }
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-500 focus:bg-white"
                    >
                      <option value="temporary_stop">⛔ Tạm dừng thi công</option>
                      <option value="permit_legal">📄 Hồ sơ pháp lý / Giấy phép GTVT</option>
                      <option value="weather">⛈ Cảnh báo thời tiết mưa bão</option>
                      <option value="infrastructure_obstacle">⚡ Vướng hạ tầng ngầm</option>
                      <option value="urgent">🚨 Chỉ đạo khẩn cấp</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="mb-1 block font-bold text-slate-700">
                      Số Hiệu Hồ Sơ
                    </label>
                    <input
                      type="text"
                      placeholder="VD: GP-0894/SGTVT"
                      value={documentRefNumber}
                      onChange={(e) => setDocumentRefNumber(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-amber-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block font-bold text-slate-700">
                      Mức Độ
                    </label>
                    <select
                      value={severity}
                      onChange={(e) =>
                        setSeverity(e.target.value as SiteBulletin['severity'])
                      }
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-500 focus:bg-white"
                    >
                      <option value="warning">⚠️ Cảnh báo</option>
                      <option value="critical">🚨 Khẩn cấp</option>
                      <option value="info">ℹ️ Thông báo</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block font-bold text-slate-700">
                      Ngày Ban Hành
                    </label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 font-mono text-xs text-slate-900 outline-none focus:border-amber-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-bold text-slate-700">
                    Người Lập / Nguồn Phát Hành
                  </label>
                  <input
                    type="text"
                    required
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-bold text-slate-700">
                    Nội Dung Chi Tiết <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Nhập nội dung chi tiết thông báo, lý do tạm ngưng hoặc yêu cầu phối hợp..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs leading-relaxed text-slate-900 outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-amber-700"
                  >
                    {editingBulletin ? 'Lưu cập nhật' : 'Phát hành ngay'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
