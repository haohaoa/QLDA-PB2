import React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Map,
  FolderPlus,
  Menu,
  X,
  ChevronRight,
  PlusCircle,
  Bell,
  AlertTriangle,
  Lock,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
export type MainNavTab = 'overview' | 'daily-report' | 'gis-map' | 'bulletins' | 'project-management';

interface SidebarProps {
  currentTab: MainNavTab;
  onSelectTab: (tab: MainNavTab) => void;
  activeProjectName?: string;
  totalProjects: number;
  isAdmin: boolean;
  requiresLogin: boolean;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  onOpenQuickEntry: () => void;
  unsubmittedTodayCount?: number;
  bulletinsCount?: number;
  onOpenLogin: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  activeProjectName,
  totalProjects,
  isAdmin,
  requiresLogin,
  isMobileOpen,
  setIsMobileOpen,
  onOpenQuickEntry,
  unsubmittedTodayCount = 0,
  bulletinsCount = 0,
  onOpenLogin,
  onLogout,
}) => {
  const navItems = [
    {
      id: 'overview' as MainNavTab,
      label: 'Tổng quan',
      mobileLabel: 'Tổng quan',
      sublabel: 'Tiến độ dự án',
      icon: LayoutDashboard,
      badge: undefined,
    },
    {
      id: 'daily-report' as MainNavTab,
      label: 'Báo cáo',
      mobileLabel: 'Báo cáo',
      sublabel: 'Báo cáo ngày, so sánh tuần',
      icon: CalendarDays,
      badge: isAdmin
        ? unsubmittedTodayCount > 0
          ? `${unsubmittedTodayCount} lượt chưa báo cáo`
          : 'Đã đủ'
        : undefined,
      badgeAlert: unsubmittedTodayCount > 0,
    },
    {
      id: 'gis-map' as MainNavTab,
      label: 'Bản đồ tuyến',
      mobileLabel: 'Bản đồ',
      sublabel: 'Tuyến & tọa độ',
      icon: Map,
      badge: undefined,
    },
    {
      id: 'bulletins' as MainNavTab,
      label: 'Thông báo',
      mobileLabel: 'Tin tức',
      sublabel: 'Tin hiện trường & hồ sơ',
      icon: Bell,
      badge: bulletinsCount > 0 ? `${bulletinsCount} tin` : undefined,
      badgeAmber: true,
    },
    {
      id: 'project-management' as MainNavTab,
      label: 'Quản lý dự án',
      mobileLabel: 'Dự án',
      sublabel: 'Thông tin & tiến độ',
      icon: FolderPlus,
      badge: undefined,
    },
  ];

  const handleNavClick = (tab: MainNavTab) => {
    onSelectTab(tab);
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Top Header Bar */}
      <div className="lg:hidden sticky top-0 z-40 bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800 shadow-sm">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-200 hover:text-white"
            aria-label="Toggle Navigation"
          >
            {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex flex-col">
            <span className="font-bold text-sm leading-tight tracking-tight">Hạ tầng ngầm</span>
            <span className="text-[10px] text-slate-400 truncate max-w-[170px]">
              {activeProjectName || `${totalProjects} Dự án ngầm`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {requiresLogin && (
            <button
              onClick={isAdmin ? onLogout : onOpenLogin}
              className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 ${
                isAdmin
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {isAdmin ? <ShieldCheck className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span>{isAdmin ? 'Đang mở quyền' : 'Đăng nhập'}</span>
            </button>
          )}
          <button
            onClick={isAdmin ? onOpenQuickEntry : onOpenLogin}
            className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            title={isAdmin ? 'Nhập nhật ký nhanh' : 'Đăng nhập để chỉnh sửa'}
          >
            {isAdmin ? <PlusCircle className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Main Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-950 text-slate-200 border-r border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div>
          <div className="p-5 border-b border-slate-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-black text-sm tracking-widest shadow-md">
                  INF
                </div>
                <div>
                  <h1 className="font-bold text-white text-base leading-none tracking-tight">
                    Hạ Tầng Ngầm Hóa
                  </h1>
                  <p className="text-[11px] text-slate-400 mt-1 font-medium">Theo dõi thi công</p>
                </div>
              </div>

              <button
                onClick={() => setIsMobileOpen(false)}
                className="lg:hidden p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active Project Card */}
            <div className="mt-4 p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                Đang theo dõi:
              </div>
              <div className="font-bold text-white truncate text-xs mt-0.5" title={activeProjectName}>
                {activeProjectName || 'Tất cả các dự án'}
              </div>
              <div className="text-[11px] text-blue-400 font-mono mt-0.5">
                {totalProjects} dự án
              </div>
            </div>
          </div>

          {/* Navigation Links (Ordered strictly as requested) */}
          <nav className="p-3 space-y-1.5">
            <div className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-500">
              Điều hướng
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all group ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-900/40'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        isActive ? 'bg-white/15 text-white' : 'bg-slate-900 text-slate-400 group-hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold leading-tight">{item.label}</div>
                      <div
                        className={`text-[10px] truncate mt-0.5 ${
                          isActive ? 'text-blue-100' : 'text-slate-500'
                        }`}
                      >
                        {item.sublabel}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.badge && (
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          item.badgeAlert
                            ? 'bg-red-500 text-white animate-pulse'
                            : item.badgeAmber
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        isActive ? 'text-white' : 'text-slate-600 opacity-60'
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Edit access and quick action */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/60 space-y-3">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isAdmin ? 'bg-amber-400 ring-2 ring-amber-400/20' : 'bg-slate-400'}`} />
              <span className="font-bold text-white text-xs">
                  {requiresLogin ? (isAdmin ? 'Được phép chỉnh sửa' : 'Chỉ xem') : 'Toàn quyền (dev)'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
                {requiresLogin
                  ? isAdmin
                    ? 'Phiên chỉnh sửa được lưu trên trình duyệt này.'
                    : 'Nhập mật khẩu để mở quyền chỉnh sửa.'
                  : 'Môi trường dev: toàn quyền chỉnh sửa, không cần mật khẩu.'}
              </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsMobileOpen(false);
                onOpenQuickEntry();
              }}
              disabled={!isAdmin}
              className="flex-1 py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Cập Nhật Nhật Ký</span>
            </button>
            {requiresLogin && (
              isAdmin ? (
                <button
                  onClick={onLogout}
                  className="px-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800"
                  title="Khóa chỉnh sửa"
                  aria-label="Khóa chỉnh sửa"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsMobileOpen(false);
                    onOpenLogin();
                  }}
                  className="px-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800"
                  title="Đăng nhập chỉnh sửa"
                  aria-label="Đăng nhập chỉnh sửa"
                >
                  <Lock className="w-4 h-4" />
                </button>
              )
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Sticky Bottom Navigation (Touch-friendly 4-tab thumb bar) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950 border-t border-slate-800 px-2 py-1.5 flex items-center justify-around text-[10px] shadow-lg">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              aria-label={item.label}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center py-1 px-1.5 rounded-lg transition-colors min-h-[46px] ${
                isActive ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="max-w-full truncate text-[9px]">{item.mobileLabel}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
