import React from 'react';
import { Layers, Plus, Calendar, FileText, BarChart3, Settings } from 'lucide-react';

export type ActiveTab = 'daily-report' | 'gis-map' | 'scurve' | 'project-setup';

interface NavbarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenSupervisorForm: () => void;
  reportDate: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  onOpenSupervisorForm,
  reportDate,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Zone 1: Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-wider shadow-sm">
              INF
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
                Hạ Tầng Ngầm Hóa
              </span>
              <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                Gói 17-2026 FTEL INFMN · Lưới Cáp & Điện
              </span>
            </div>
          </div>

          {/* Zone 2: Single-line Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 sm:gap-2 text-sm font-medium">
            <button
              onClick={() => onSelectTab('daily-report')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'daily-report'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Báo Cáo Nhật Ký</span>
            </button>

            <button
              onClick={() => onSelectTab('gis-map')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'gis-map'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Bản Đồ Tuyến GIS</span>
            </button>

            <button
              onClick={() => onSelectTab('scurve')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'scurve'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Tiến Độ & Nguồn Lực</span>
            </button>

            <button
              onClick={() => onSelectTab('project-setup')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'project-setup'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Khởi Tạo & Tuyến Đường</span>
            </button>
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 font-mono bg-slate-100 px-2.5 py-1.5 rounded border border-slate-200">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Ngày: {reportDate}</span>
            </div>

            <button
              onClick={onOpenSupervisorForm}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] rounded-lg shadow-sm transition-all whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nhập Nhật Ký Ngày</span>
            </button>
          </div>
        </div>

        {/* Mobile secondary tab strip */}
        <div className="md:hidden flex items-center justify-between border-t border-slate-100 py-2 overflow-x-auto gap-2">
          <button
            onClick={() => onSelectTab('daily-report')}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
              activeTab === 'daily-report' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Báo Cáo
          </button>
          <button
            onClick={() => onSelectTab('gis-map')}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
              activeTab === 'gis-map' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Bản Đồ GIS
          </button>
          <button
            onClick={() => onSelectTab('scurve')}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
              activeTab === 'scurve' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Tiến Độ S-Curve
          </button>
          <button
            onClick={() => onSelectTab('project-setup')}
            className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
              activeTab === 'project-setup' ? 'bg-slate-900 text-white' : 'text-slate-600'
            }`}
          >
            Cấu Hình
          </button>
        </div>
      </div>
    </header>
  );
};
