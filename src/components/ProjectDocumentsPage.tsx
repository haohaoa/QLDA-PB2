import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ProjectDocument,
  ProjectDocumentCategory,
  ProjectDocumentFile,
  ProjectDocumentType,
  UndergroundProject,
} from '../types/undergrounding';
import { uploadProjectDocumentFile } from '../utils/appDataStorage';

interface ProjectDocumentsPageProps {
  isAdmin: boolean;
  projects: UndergroundProject[];
  documents: ProjectDocument[];
  documentTypes: ProjectDocumentType[];
  sessionToken?: string;
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  onSaveDocument: (
    doc: ProjectDocument,
    removedFileIds?: string[]
  ) => Promise<boolean>;
  onDeleteDocument: (doc: ProjectDocument) => Promise<boolean>;
  onAddDocumentType: (name: string) => Promise<ProjectDocumentType | null>;
  onUpdateDocumentType: (docType: ProjectDocumentType) => Promise<boolean>;
  onDeleteDocumentType: (docType: ProjectDocumentType) => Promise<boolean>;
}

const formatDateDisplay = (value?: string): string =>
  value ? value.split('-').reverse().join('/') : '—';

export const ProjectDocumentsPage: React.FC<ProjectDocumentsPageProps> = ({
  isAdmin,
  projects,
  documents,
  documentTypes,
  sessionToken,
  selectedProjectId,
  onSelectProject,
  onSaveDocument,
  onDeleteDocument,
  onAddDocumentType,
  onUpdateDocumentType,
  onDeleteDocumentType,
}) => {
  const [routeSearch, setRouteSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProjectDocumentCategory>('all');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Document Type Management State
  const [newTypeName, setNewTypeName] = useState('');
  const [isAddingType, setIsAddingType] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeName, setEditingTypeName] = useState('');
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(true);

  // Document Form Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<ProjectDocument | null>(null);
  const [formProjectId, setFormProjectId] = useState('');
  const [formCategory, setFormCategory] = useState<ProjectDocumentCategory>('');
  const [formTitle, setFormTitle] = useState('');
  const [formDocCode, setFormDocCode] = useState('');
  const [formIssueDate, setFormIssueDate] = useState('');
  const [formExpiryDate, setFormExpiryDate] = useState('');
  const [formFiles, setFormFiles] = useState<ProjectDocumentFile[]>([]);
  const [removedFileIds, setRemovedFileIds] = useState<string[]>([]);
  const [externalLinkInput, setExternalLinkInput] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [quickTypeInModal, setQuickTypeInModal] = useState('');

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm font-bold text-red-800">
        Chỉ tài khoản ADMIN mới được quyền truy cập, xem và quản lý Hồ sơ dự án.
      </div>
    );
  }

  const filteredProjects = useMemo(() => {
    const q = routeSearch.trim().toLocaleLowerCase('vi');
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLocaleLowerCase('vi').includes(q) ||
        p.code.toLocaleLowerCase('vi').includes(q) ||
        p.investor.toLocaleLowerCase('vi').includes(q)
    );
  }, [projects, routeSearch]);

  const activeProject = useMemo(() => {
    if (selectedProjectId && selectedProjectId !== 'all') {
      const found = projects.find((p) => p.id === selectedProjectId);
      if (found) return found;
    }
    return filteredProjects[0] || projects[0] || null;
  }, [projects, filteredProjects, selectedProjectId]);

  const docCountByProject = useMemo(() => {
    const map = new Map<string, number>();
    documents.forEach((doc) => {
      map.set(doc.projectId, (map.get(doc.projectId) || 0) + 1);
    });
    return map;
  }, [documents]);

  const projectDocuments = useMemo(() => {
    if (!activeProject) return [];
    const q = docSearch.trim().toLocaleLowerCase('vi');
    return documents.filter((doc) => {
      if (doc.projectId !== activeProject.id) return false;
      if (categoryFilter !== 'all' && doc.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        doc.title.toLocaleLowerCase('vi').includes(q) ||
        doc.categoryLabel.toLocaleLowerCase('vi').includes(q) ||
        (doc.documentCode || '').toLocaleLowerCase('vi').includes(q) ||
        (doc.fileName || '').toLocaleLowerCase('vi').includes(q) ||
        (doc.notes || '').toLocaleLowerCase('vi').includes(q)
      );
    });
  }, [documents, activeProject, docSearch, categoryFilter]);

  const visibleCategories = useMemo(() => {
    const q = docSearch.trim().toLocaleLowerCase('vi');
    const allTypes = [...documentTypes];
    // Include any orphan category still referenced by an existing document on this project
    projectDocuments.forEach((doc) => {
      if (doc.category && !allTypes.some((t) => t.id === doc.category)) {
        allTypes.push({ id: doc.category, name: doc.categoryLabel || doc.category });
      }
    });

    return allTypes.filter((cat) => {
      if (categoryFilter !== 'all' && cat.id !== categoryFilter) return false;
      if (!q) return true;
      const categoryMatchesQuery = cat.name.toLocaleLowerCase('vi').includes(q);
      const hasMatchingDocs = projectDocuments.some((d) => d.category === cat.id);
      return categoryMatchesQuery || hasMatchingDocs;
    });
  }, [documentTypes, categoryFilter, docSearch, projectDocuments]);

  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [catId]: prev[catId] === false,
    }));
  };

  const handleCreateType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim() || isAddingType) return;
    setIsAddingType(true);
    try {
      const created = await onAddDocumentType(newTypeName.trim());
      if (created) {
        setNewTypeName('');
      }
    } finally {
      setIsAddingType(false);
    }
  };

  const handleSaveRenameType = async (docType: ProjectDocumentType) => {
    if (!editingTypeName.trim()) return;
    const ok = await onUpdateDocumentType({ ...docType, name: editingTypeName.trim() });
    if (ok) {
      setEditingTypeId(null);
      setEditingTypeName('');
    }
  };

  const getDocumentFiles = (doc: ProjectDocument): ProjectDocumentFile[] => {
    if (Array.isArray(doc.files) && doc.files.length > 0) return doc.files;
    if (doc.fileUrl) {
      return [
        {
          fileId: doc.fileId || '',
          fileName: doc.fileName || 'Tệp đính kèm',
          fileUrl: doc.fileUrl,
          mimeType: doc.mimeType,
        },
      ];
    }
    return [];
  };

  const openAddModal = (defaultCategory?: ProjectDocumentCategory) => {
    if (!activeProject) return;
    setEditingDoc(null);
    setFormProjectId(activeProject.id);
    setFormCategory(defaultCategory || documentTypes[0]?.id || '');
    setFormTitle('');
    setFormDocCode('');
    setFormIssueDate('');
    setFormExpiryDate('');
    setFormFiles([]);
    setRemovedFileIds([]);
    setExternalLinkInput('');
    setFormNotes('');
    setSelectedFiles([]);
    setQuickTypeInModal('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (doc: ProjectDocument) => {
    setEditingDoc(doc);
    setFormProjectId(doc.projectId);
    setFormCategory(doc.category);
    setFormTitle(doc.title);
    setFormDocCode(doc.documentCode || '');
    setFormIssueDate(doc.issueDate || '');
    setFormExpiryDate(doc.expiryDate || '');
    setFormFiles(getDocumentFiles(doc));
    setRemovedFileIds([]);
    setExternalLinkInput('');
    setFormNotes(doc.notes || '');
    setSelectedFiles([]);
    setQuickTypeInModal('');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleRemoveExistingFile = (index: number) => {
    const target = formFiles[index];
    if (target?.fileId) {
      setRemovedFileIds((prev) =>
        prev.includes(target.fileId) ? prev : [...prev, target.fileId]
      );
    }
    setFormFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddExternalLink = () => {
    const trimmed = externalLinkInput.trim();
    if (!trimmed) return;
    setFormFiles((prev) => [
      ...prev,
      {
        fileId: '',
        fileName: 'Liên kết tài liệu',
        fileUrl: trimmed,
      },
    ]);
    setExternalLinkInput('');
  };

  const handleQuickAddTypeInModal = async () => {
    if (!quickTypeInModal.trim()) return;
    const created = await onAddDocumentType(quickTypeInModal.trim());
    if (created) {
      setFormCategory(created.id);
      setQuickTypeInModal('');
      setFormError(null);
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProjectId) {
      setFormError('Vui lòng chọn tuyến dự án.');
      return;
    }
    if (!formCategory) {
      setFormError('Vui lòng chọn hoặc thêm Loại hồ sơ trước khi lưu.');
      return;
    }
    if (!formTitle.trim()) {
      setFormError('Vui lòng nhập Tên hồ sơ.');
      return;
    }

    setFormError(null);
    setIsSaving(true);
    try {
      const nextFiles: ProjectDocumentFile[] = [...formFiles];
      if (externalLinkInput.trim()) {
        nextFiles.push({
          fileId: '',
          fileName: 'Liên kết tài liệu',
          fileUrl: externalLinkInput.trim(),
        });
      }

      for (const file of selectedFiles) {
        const uploaded = await uploadProjectDocumentFile(file, sessionToken);
        nextFiles.push({
          fileId: uploaded.fileId,
          fileName: uploaded.fileName || file.name,
          fileUrl: uploaded.url,
          mimeType: file.type || 'application/octet-stream',
        });
      }

      const primaryFile = nextFiles[0];
      const categoryObj = documentTypes.find((c) => c.id === formCategory);
      const nowIso = new Date().toISOString();
      const docPayload: ProjectDocument = {
        id: editingDoc?.id || `doc-${crypto.randomUUID()}`,
        projectId: formProjectId,
        category: formCategory,
        categoryLabel: categoryObj?.name || editingDoc?.categoryLabel || 'Hồ sơ',
        title: formTitle.trim(),
        documentCode: formDocCode.trim(),
        issueDate: formIssueDate,
        expiryDate: formExpiryDate,
        fileName: primaryFile?.fileName || '',
        fileUrl: primaryFile?.fileUrl || '',
        fileId: primaryFile?.fileId || '',
        mimeType: primaryFile?.mimeType || '',
        files: nextFiles,
        notes: formNotes.trim(),
        createdAt: editingDoc?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      const saved = await onSaveDocument(docPayload, removedFileIds);
      if (saved) {
        setIsFormOpen(false);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể lưu hồ sơ.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              Hồ Sơ Dự Án (Quản Trị Admin)
            </h2>
            <p className="text-xs text-slate-600">
              Quản lý hồ sơ theo từng tuyến · Tệp lưu công khai trên Google Drive{' '}
              <strong className="text-blue-700">QLDA - Hồ Sơ Ngầm Hóa</strong>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsTypeManagerOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            <Tags className="h-4 w-4 text-blue-600" />
            Loại hồ sơ ({documentTypes.length})
          </button>
          {activeProject && (
            <button
              type="button"
              onClick={() => openAddModal()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Thêm Hồ Sơ Mới
            </button>
          )}
        </div>
      </div>

      {/* User-defined Document Types Manager */}
      {isTypeManagerOpen && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-800">
                Danh Mục Loại Hồ Sơ (Do Người Dùng Tự Tạo)
              </h3>
              <p className="text-[11px] text-slate-500">
                Thêm, sửa tên hoặc xóa các loại hồ sơ dùng chung cho toàn bộ các tuyến.
              </p>
            </div>
            <form onSubmit={handleCreateType} className="flex items-center gap-1.5">
              <input
                type="text"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="VD: Hợp đồng, GPĐĐ, Hoàn công..."
                className="w-56 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
              />
              <button
                type="submit"
                disabled={isAddingType || !newTypeName.trim()}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm loại
              </button>
            </form>
          </div>

          {documentTypes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/70 px-3 py-2.5 text-xs font-semibold text-amber-900">
              Chưa có loại hồ sơ nào. Hãy nhập tên loại hồ sơ ở ô bên trên và bấm <strong>Thêm loại</strong> để bắt đầu.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {documentTypes.map((docType) => (
                <div
                  key={docType.id}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-800"
                >
                  {editingTypeId === docType.id ? (
                    <>
                      <input
                        type="text"
                        value={editingTypeName}
                        onChange={(e) => setEditingTypeName(e.target.value)}
                        className="w-36 rounded border border-blue-400 bg-white px-1.5 py-0.5 text-xs font-semibold outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveRenameType(docType)}
                        className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100"
                        title="Lưu tên"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTypeId(null)}
                        className="rounded p-0.5 text-slate-500 hover:bg-slate-200"
                        title="Hủy"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span>{docType.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTypeId(docType.id);
                          setEditingTypeName(docType.name);
                        }}
                        title="Đổi tên loại hồ sơ"
                        className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-blue-700"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteDocumentType(docType)}
                        title="Xóa loại hồ sơ"
                        className="rounded p-0.5 text-slate-500 hover:bg-red-100 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main 2-column layout (Route List + Document Categories) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: All Routes + Route Search */}
        <aside className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3 h-fit">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
              Danh Sách Tuyến ({filteredProjects.length}/{projects.length})
            </h3>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={routeSearch}
              onChange={(e) => setRouteSearch(e.target.value)}
              placeholder="Tìm kiếm tuyến, mã HĐ, CĐT..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>

          <div className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
            {filteredProjects.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
                Không tìm thấy tuyến phù hợp.
              </p>
            ) : (
              filteredProjects.map((project) => {
                const isSelected = activeProject?.id === project.id;
                const count = docCountByProject.get(project.id) || 0;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onSelectProject(project.id)}
                    className={`w-full rounded-xl border p-2.5 text-left transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/80 ring-2 ring-blue-100'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-800">
                        {project.code}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                          count > 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {count} hồ sơ
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-bold text-slate-900 leading-snug">
                      {project.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      CĐT: {project.investor}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right: Document Search + Expandable Categories for Selected Route */}
        <section className="lg:col-span-8 space-y-3">
          {!activeProject ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              Chưa có tuyến dự án nào để hiển thị hồ sơ.
            </div>
          ) : (
            <>
              {/* Selected Project Banner & Document Filter */}
              <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-blue-50 border border-blue-200 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-800">
                        HĐ: {activeProject.code}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {formatDateDisplay(activeProject.startDate)} →{' '}
                        {formatDateDisplay(activeProject.finishDate)}
                      </span>
                    </div>
                    <h3 className="mt-1 text-sm sm:text-base font-extrabold text-slate-900">
                      {activeProject.name}
                    </h3>
                  </div>
                  <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
                    Tổng: {docCountByProject.get(activeProject.id) || 0} hồ sơ
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={docSearch}
                      onChange={(e) => setDocSearch(e.target.value)}
                      placeholder="Tìm loại hồ sơ, tên tài liệu, số hiệu..."
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600 focus:bg-white"
                  >
                    <option value="all">Tất cả loại hồ sơ</option>
                    {documentTypes.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Expandable Document Categories */}
              {visibleCategories.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-500">
                  {documentTypes.length === 0
                    ? 'Chưa có loại hồ sơ nào. Hãy thêm loại hồ sơ ở mục "Danh Mục Loại Hồ Sơ" phía trên.'
                    : 'Không tìm thấy loại hồ sơ phù hợp với từ khóa.'}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {visibleCategories.map((cat) => {
                    const catDocs = projectDocuments.filter((d) => d.category === cat.id);
                    const isExpanded = expandedCategories[cat.id] !== false;
                    return (
                      <div
                        key={cat.id}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-2 bg-slate-50/90 px-3.5 py-2.5 border-b border-slate-200/80">
                          <button
                            type="button"
                            onClick={() => toggleCategory(cat.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                            )}
                            <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                              {cat.name}
                            </span>
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-800">
                              {catDocs.length}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openAddModal(cat.id)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Thêm
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="divide-y divide-slate-100">
                            {catDocs.length === 0 ? (
                              <p className="px-4 py-3 text-xs italic text-slate-400">
                                Chưa có hồ sơ nào trong mục này.
                              </p>
                            ) : (
                              catDocs.map((doc) => (
                                <div
                                  key={doc.id}
                                  className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between hover:bg-slate-50/60"
                                >
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                                      <span className="text-xs sm:text-sm font-bold text-slate-900">
                                        {doc.title}
                                      </span>
                                      {doc.documentCode && (
                                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                                          Số: {doc.documentCode}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                      {doc.issueDate && (
                                        <span>Ngày lập: {formatDateDisplay(doc.issueDate)}</span>
                                      )}
                                      {doc.expiryDate && (
                                        <span className="font-semibold text-amber-700">
                                          Hết hạn: {formatDateDisplay(doc.expiryDate)}
                                        </span>
                                      )}
                                      {(() => {
                                        const docFiles = getDocumentFiles(doc);
                                        if (docFiles.length === 0) return null;
                                        return (
                                          <span className="font-semibold text-blue-700">
                                            {docFiles.length} tệp đính kèm
                                          </span>
                                        );
                                      })()}
                                    </div>
                                    {(() => {
                                      const docFiles = getDocumentFiles(doc);
                                      if (docFiles.length === 0) return null;
                                      return (
                                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                                          {docFiles.map((f, idx) => (
                                            <a
                                              key={`${doc.id}-f-${idx}`}
                                              href={f.fileUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                                            >
                                              <ExternalLink className="h-3 w-3 shrink-0" />
                                              <span className="max-w-[220px] truncate">
                                                {f.fileName || `Tệp ${idx + 1}`}
                                              </span>
                                            </a>
                                          ))}
                                        </div>
                                      );
                                    })()}
                                    {doc.notes && (
                                      <p className="text-xs text-slate-600">{doc.notes}</p>
                                    )}
                                  </div>

                                  <div className="flex shrink-0 items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(doc)}
                                      title="Sửa hồ sơ / Gỡ hoặc thêm tệp"
                                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100 hover:text-blue-700"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void onDeleteDocument(doc)}
                                      title="Xóa hồ sơ"
                                      className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Add / Edit Document Modal */}
      {isFormOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-xs">
            <form
              onSubmit={handleSubmitForm}
              className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
                <h3 className="text-sm font-extrabold">
                  {editingDoc ? 'Cập Nhật Hồ Sơ Dự Án' : 'Thêm Hồ Sơ Dự Án Mới'}
                </h3>
                <button
                  type="button"
                  onClick={() => !isSaving && setIsFormOpen(false)}
                  className="rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[75vh] space-y-3 overflow-y-auto p-4 text-xs">
                {formError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-700">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="mb-1 block font-bold text-slate-700">
                    Tuyến Dự Án <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formProjectId}
                    onChange={(e) => setFormProjectId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-600"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.code}] {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-bold text-slate-700">
                      Loại Hồ Sơ <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-600"
                    >
                      <option value="" disabled>
                        Chọn loại hồ sơ...
                      </option>
                      {documentTypes.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block font-bold text-slate-700">
                      Số Hiệu Văn Bản / HĐ
                    </label>
                    <input
                      type="text"
                      value={formDocCode}
                      onChange={(e) => setFormDocCode(e.target.value)}
                      placeholder="VD: 124/GP-SGTVT..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                {/* Quick-add Document Type right inside modal */}
                <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 p-2 border border-slate-200">
                  <input
                    type="text"
                    value={quickTypeInModal}
                    onChange={(e) => setQuickTypeInModal(e.target.value)}
                    placeholder="Chưa có loại cần tìm? Nhập tên loại mới..."
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => void handleQuickAddTypeInModal()}
                    disabled={!quickTypeInModal.trim()}
                    className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    + Thêm loại
                  </button>
                </div>

                <div>
                  <label className="mb-1 block font-bold text-slate-700">
                    Tên Hồ Sơ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="VD: Giấy phép đào đường đợt 1..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block font-bold text-slate-700">
                      Ngày Ban Hành / Ký
                    </label>
                    <input
                      type="date"
                      value={formIssueDate}
                      onChange={(e) => setFormIssueDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 font-mono text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-bold text-slate-700">
                      Ngày Hết Hạn (nếu có)
                    </label>
                    <input
                      type="date"
                      value={formExpiryDate}
                      onChange={(e) => setFormExpiryDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 font-mono text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-2.5">
                  <label className="block font-bold text-blue-900">
                    Tải Tệp Lên Google Drive ("QLDA - Hồ Sơ Ngầm Hóa" · Công Khai)
                  </label>

                  {/* Existing attached files with Gỡ file button */}
                  {formFiles.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold text-slate-700">
                        Tệp đang đính kèm ({formFiles.length}):
                      </p>
                      {formFiles.map((f, idx) => (
                        <div
                          key={`existing-${idx}-${f.fileId || f.fileUrl}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5"
                        >
                          <a
                            href={f.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-w-0 flex-1 items-center gap-1.5 font-semibold text-emerald-800 hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{f.fileName || `Tệp ${idx + 1}`}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleRemoveExistingFile(idx)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 hover:bg-red-100"
                          >
                            <Trash2 className="h-3 w-3" />
                            Gỡ file
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Newly selected pending files */}
                  {selectedFiles.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold text-blue-800">
                        Tệp chờ tải lên ({selectedFiles.length}):
                      </p>
                      {selectedFiles.map((f, idx) => (
                        <div
                          key={`pending-${idx}-${f.name}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-white px-2.5 py-1.5"
                        >
                          <span className="truncate font-semibold text-slate-800">
                            {f.name}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-red-600 hover:bg-red-50"
                          >
                            Bỏ chọn
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-white px-3 py-2.5 font-bold text-blue-700 hover:bg-blue-50">
                    <Upload className="h-4 w-4" />
                    <span>Chọn một hoặc nhiều tệp (PDF, Word, Excel, Ảnh, CAD...)</span>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const picked = Array.from(e.target.files || []);
                        if (picked.length > 0) {
                          setSelectedFiles((prev) => [...prev, ...picked]);
                          if (!formTitle.trim()) {
                            setFormTitle(picked[0].name.replace(/\.[^.]+$/, ''));
                          }
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-600">
                      Hoặc dán link Google Drive / tài liệu sẵn có:
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="url"
                        value={externalLinkInput}
                        onChange={(e) => setExternalLinkInput(e.target.value)}
                        placeholder="https://drive.google.com/..."
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-800 outline-none focus:border-blue-600"
                      />
                      <button
                        type="button"
                        onClick={handleAddExternalLink}
                        disabled={!externalLinkInput.trim()}
                        className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        + Thêm link
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-bold text-slate-700">Ghi Chú</label>
                  <textarea
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Ghi chú thêm về hồ sơ..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {isSaving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                  {isSaving
                    ? 'Đang tải lên & lưu...'
                    : editingDoc
                    ? 'Lưu Thay Đổi'
                    : 'Lưu Hồ Sơ'}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </div>
  );
};
