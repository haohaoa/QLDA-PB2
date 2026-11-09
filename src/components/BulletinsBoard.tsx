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
  PlusCircle,
  Filter,
  CheckCircle2,
  Trash2,
  Calendar,
  User,
  ArrowRight,
  ExternalLink,
  Info,
  X,
} from 'lucide-react';

interface BulletinsBoardProps {
  bulletins: SiteBulletin[];
  projects: UndergroundProject[];
  onAddBulletin: (bulletin: SiteBulletin) => boolean;
  onUpdateBulletin: (bulletin: SiteBulletin) => boolean;
  onDeleteBulletin: (id: string) => void;
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

  // Filtered bulletins
  const filteredBulletins = bulletins.filter((b) => {
    if (selectedCategory !== 'all' && b.category !== selectedCategory) return false;
    if (selectedProjectId !== 'all' && b.projectId !== 'all' && b.projectId !== selectedProjectId)
      return false;
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    const projName =
      formProjectId === 'all'
        ? 'Tất cả các dự án'
        : projects.find((p) => p.id === formProjectId)?.name || 'Dự án ngầm';

    if (editingBulletin) {
      const updated: SiteBulletin = {
        ...editingBulletin,
        title,
        category,
        projectId: formProjectId,
        projectName: projName,
        author,
        date,
        content,
        documentRefNumber: documentRefNumber.trim() || undefined,
        severity,
      };
      if (!onUpdateBulletin(updated)) return;
    } else {
      const newBulletin: SiteBulletin = {
        id: `blt-${Date.now()}`,
        title,
        category,
        projectId: formProjectId,
        projectName: projName,
        author,
        date,
        content,
        documentRefNumber: documentRefNumber.trim() || undefined,
        severity,
        isActive: true,
      };
      if (!onAddBulletin(newBulletin)) return;
    }

    setShowCreateModal(false);
  };

  const handleToggleActive = (b: SiteBulletin) => {
    onUpdateBulletin({ ...b, isActive: !b.isActive });
  };

  const getCategoryLabel = (cat: SiteBulletin['category']) => {
    switch (cat) {
      case 'weather':
        return { label: 'Cảnh báo mưa bão', icon: CloudRain, color: 'text-amber-700 bg-amber-50 border-amber-200' };
      case 'permit_legal':
        return { label: 'Hồ sơ pháp lý / Giấy phép', icon: FileCheck, color: 'text-blue-700 bg-blue-50 border-blue-200' };
      case 'temporary_stop':
        return { label: 'Tạm dừng thi công', icon: ShieldAlert, color: 'text-red-700 bg-red-50 border-red-200' };
      case 'infrastructure_obstacle':
        return { label: 'Vướng hạ tầng ngầm', icon: AlertTriangle, color: 'text-orange-700 bg-orange-50 border-orange-200' };
      case 'urgent':
      default:
        return { label: 'Chỉ đạo khẩn cấp', icon: Bell, color: 'text-purple-700 bg-purple-50 border-purple-200' };
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Toolbar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-amber-600 mb-1">
            <Bell className="w-4 h-4" />
            <span>BẢNG TIN ĐIỀU HÀNH & HỒ SƠ PHÁP LÝ HIỆN TRƯỜNG</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Thông Báo Hiện Trường & Cảnh Báo Hồ Sơ Thi Công
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Kênh cập nhật tin tức dành cho Lãnh đạo, Kỹ sư giám sát & các Nhà thầu: hồ sơ xin phép Sở GTVT, lệnh cấm đào mưa bão, tạm dừng thi công...
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin ? (
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-xs transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Tạo Thông Báo / Cảnh Báo Mới (ADMIN)</span>
            </button>
          ) : (
            <button
              onClick={onOpenLogin}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold shadow-xs transition-all"
            >
              <FileText className="w-4 h-4 text-amber-400" />
              <span>🔐 Đăng nhập Admin để đăng thông báo</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
            <Filter className="w-4 h-4" />
            <span>Bộ lọc:</span>
          </div>

          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-1.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
          >
            <option value="all">★ Tất cả dự án ({bulletins.length} thông báo)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
          >
            <option value="all">Tất cả danh mục thông báo</option>
            <option value="temporary_stop">⛔ Tạm dừng thi công</option>
            <option value="permit_legal">📄 Hồ sơ pháp lý / Giấy phép GTVT</option>
            <option value="weather">⛈ Cảnh báo thời tiết mưa bão</option>
            <option value="infrastructure_obstacle">⚡ Vướng hạ tầng ngầm khác</option>
            <option value="urgent">🚨 Chỉ đạo khẩn cấp</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 font-mono">
          Hiển thị <strong>{filteredBulletins.length}</strong> / {bulletins.length} thông báo
        </div>
      </div>

      {/* 3. Bulletins Grid */}
      <div className="space-y-4">
        {filteredBulletins.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300">
            <Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-700">Chưa có thông báo nào phù hợp với bộ lọc</h4>
            <p className="text-xs text-slate-400 mt-1">
              Bạn có thể nhấn vào nút <strong>+ Tạo Thông Báo / Cảnh Báo Mới</strong> để gửi tin tức đến công trường.
            </p>
          </div>
        ) : (
          filteredBulletins.map((b) => {
            const catInfo = getCategoryLabel(b.category);
            const Icon = catInfo.icon;

            return (
              <div
                key={b.id}
                className={`bg-white rounded-2xl p-5 border transition-all shadow-xs ${
                  !b.isActive
                    ? 'opacity-60 bg-slate-50/80 border-slate-200'
                    : b.severity === 'critical'
                    ? 'border-l-4 border-l-red-600 border-slate-200'
                    : b.severity === 'warning'
                    ? 'border-l-4 border-l-amber-500 border-slate-200'
                    : 'border-l-4 border-l-blue-600 border-slate-200'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    {/* Tags row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-lg border flex items-center gap-1.5 ${catInfo.color}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {catInfo.label}
                      </span>

                      <span
                        className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full ${
                          b.severity === 'critical'
                            ? 'bg-red-600 text-white'
                            : b.severity === 'warning'
                            ? 'bg-amber-500 text-white'
                            : 'bg-blue-600 text-white'
                        }`}
                      >
                        {b.severity === 'critical'
                          ? 'Mức độ: Khẩn cấp'
                          : b.severity === 'warning'
                          ? 'Mức độ: Cảnh báo'
                          : 'Mức độ: Thông báo'}
                      </span>

                      {b.isActive ? (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          ● Đang hiệu lực
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                          ✓ Đã giải quyết / Đóng hồ sơ
                        </span>
                      )}

                      <span className="text-xs text-slate-400 font-mono ml-auto">
                        Ngày {b.date.split('-').reverse().join('/')}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                      {b.title}
                    </h3>

                    {/* Metadata strip: Project & Document Reference */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-0.5">
                      <span className="flex items-center gap-1">
                        <strong>Dự án áp dụng:</strong>{' '}
                        <span className="text-blue-700 font-semibold">{b.projectName}</span>
                      </span>

                      {b.documentRefNumber && (
                        <span className="flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200/70 px-2 py-0.5 rounded font-mono font-medium">
                          <FileText className="w-3.5 h-3.5 text-amber-700" />
                          {b.documentRefNumber}
                        </span>
                      )}

                      <span className="flex items-center gap-1 text-slate-500">
                        <User className="w-3.5 h-3.5" />
                        Người lập: {b.author}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-100 text-xs text-slate-800 leading-relaxed whitespace-pre-line mt-2">
                      {b.content}
                    </div>
                  </div>

                  {/* Actions column */}
                  <div className="flex md:flex-col items-center gap-2 self-start shrink-0">
                    {b.projectId !== 'all' && (
                      <button
                        onClick={() => onSelectProjectDetail(b.projectId)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
                        title="Xem báo cáo chi tiết của dự án này"
                      >
                        <span>Xem dự án</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {isAdmin && (
                      <>
                        <button
                          onClick={() => handleToggleActive(b)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium border border-slate-200 whitespace-nowrap"
                        >
                          {b.isActive ? 'Đóng thông báo' : 'Mở lại'}
                        </button>

                        <button
                          onClick={() => handleOpenEdit(b)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium border border-slate-200 whitespace-nowrap"
                        >
                          Sửa
                        </button>

                        <button
                          onClick={() => onDeleteBulletin(b.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          title="Xóa thông báo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Create / Edit Bulletin Modal */}
      {showCreateModal && (
        createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-100 bg-white p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200 sm:p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">
                    {editingBulletin ? 'Cập Nhật Thông Báo Hiện Trường' : 'Tạo Thông Báo / Cảnh Báo Hồ Sơ Mới'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Giám sát cập nhật tin tức hàng ngày (ví dụ: tạm ngưng dự án vì làm hồ sơ xin phép thi công)
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Tiêu Đề Thông Báo / Cảnh Báo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Tạm ngưng đào phui nút giao Triệu Nữ Vương vì đang làm hồ sơ xin phép thi công Sở GTVT"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Dự Án Áp Dụng <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formProjectId}
                    onChange={(e) => setFormProjectId(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
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
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Phân Loại Tin Tức <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as SiteBulletin['category'])}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  >
                    <option value="temporary_stop">⛔ Tạm dừng thi công</option>
                    <option value="permit_legal">📄 Hồ sơ pháp lý / Giấy phép GTVT</option>
                    <option value="weather">⛈ Cảnh báo thời tiết mưa bão</option>
                    <option value="infrastructure_obstacle">⚡ Vướng hạ tầng ngầm khác</option>
                    <option value="urgent">🚨 Chỉ đạo khẩn cấp từ CĐT</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Mã / Số Hiệu Hồ Sơ (Nếu có)
                  </label>
                  <input
                    type="text"
                    placeholder="VD: GP-0894/2026/SGTVT"
                    value={documentRefNumber}
                    onChange={(e) => setDocumentRefNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Mức Độ Cảnh Báo
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as SiteBulletin['severity'])}
                    className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  >
                    <option value="warning">⚠️ Cảnh báo tiến độ / hiện trường</option>
                    <option value="critical">🚨 Khẩn cấp (Dừng thi công)</option>
                    <option value="info">ℹ️ Thông báo nghiệp vụ</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Ngày Ban Hành
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Người Lập / Chức Danh
                </label>
                <input
                  type="text"
                  placeholder="VD: KS. Nguyễn Văn Hùng (Giám sát A)"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nội Dung Chi Tiết Thông Báo & Phương Án Xử Lý <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Ghi rõ lý do tạm ngưng, thời gian dự kiến mở lại, các mũi khoan hoặc đội hoàn trả có tiếp tục làm việc không..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-all"
                >
                  {editingBulletin ? 'Cập Nhật Thông Báo' : 'Đăng Thông Báo Lên Hiện Trường'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
        )
      )}
    </div>
  );
};
