import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePrintQueue } from '../context/PrintQueueContext';
import smcLogo from '../img/Logo_SMC_Corporation.svg';

const NAV_GROUPS = [
  {
    key: 'tem',
    label: 'Quản lý tem',
    icon: '🏷',
    items: [
      { to: '/thiet-bi', icon: '▦', label: 'Thiết bị' },
      { to: '/phieu-ban-giao', icon: '☰', label: 'Phiếu bàn giao' },
    ],
  },
  {
    key: 'he-thong',
    label: 'Hệ thống',
    icon: '⚙',
    adminOnly: true,
    items: [
      { to: '/lich-su-sua', icon: '✎', label: 'Lịch sử sửa' },
      { to: '/nguoi-dung', icon: '♙', label: 'Người dùng' },
    ],
  },
];

export function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const { queue } = usePrintQueue();
  const location = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem('warehub-theme') || 'light');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('warehub-sidebar') === 'collapsed');
  const [openGroups, setOpenGroups] = useState(() => {
    const saved = JSON.parse(localStorage.getItem('warehub-nav-groups') || '{}');
    return { tem: true, 'he-thong': true, ...saved };
  });

  useEffect(() => {
    localStorage.setItem('warehub-nav-groups', JSON.stringify(openGroups));
  }, [openGroups]);

  function toggleGroup(key) {
    setOpenGroups((current) => ({ ...current, [key]: !current[key] }));
  }

  useEffect(() => {
    localStorage.setItem('warehub-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('warehub-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
  }, [sidebarCollapsed]);

  return (
    <div className={`app-shell theme-${theme} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><img src={smcLogo} alt="SMC" /></div>
          <div>
            <div className="brand">Ware<span>Hub</span></div>
            <div className="brand-caption">Asset operations</div>
          </div>
        </div>
        <button
          className="sidebar-toggle"
          type="button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          aria-label={sidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
          title={sidebarCollapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          <ChevronIcon direction={sidebarCollapsed ? 'right' : 'left'} />
        </button>

        <div className="nav-section-label">Workspace</div>
        <nav className="sidebar-nav">
          {NAV_GROUPS.filter((group) => !group.adminOnly || isAdmin).map((group) => {
            const isOpen = openGroups[group.key];
            const isGroupActive = group.items.some((item) => location.pathname.startsWith(item.to));
            return (
              <div className={`nav-group ${isOpen ? 'open' : 'closed'}`} key={group.key}>
                <button
                  type="button"
                  className={`nav-group-header ${isGroupActive ? 'active-group' : ''}`}
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={isOpen}
                >
                  <span className="nav-icon">{group.icon}</span>
                  {group.label}
                  <span className="nav-group-chevron">▸</span>
                </button>
                <div className={`nav-group-children ${isOpen ? 'open' : 'closed'}`}>
                  {group.items.map((item) => (
                    <NavLink to={item.to} className="nav-link" key={item.to}>
                      <span className="nav-icon">{item.icon}</span> {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="system-status"><span className="status-dot" /> Hệ thống hoạt động</div>
          <div className="user-box">
            <div className="avatar">{user?.full_name?.charAt(0)?.toUpperCase() || 'U'}</div>
            <div className="user-details">
              <b>{user?.full_name}</b>
              <span>{user?.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}</span>
            </div>
            <button onClick={logout} title="Đăng xuất">↗</button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="content-header">
          <div>
            <span className="eyebrow">WAREHOUSE CONTROL CENTER</span>
            <h1>Xin chào, {user?.full_name?.split(' ').pop() || 'bạn'}.</h1>
          </div>
          <div className="header-tools">
            <span className="header-date">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <button
              className="sidebar-toggle-mobile"
              type="button"
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-label={sidebarCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
              title={sidebarCollapsed ? 'Mở rộng' : 'Thu gọn'}
            >{sidebarCollapsed ? '☰' : '×'}</button>
            <button
              className="theme-toggle"
              type="button"
              onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              title={theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <span className="header-bell" aria-label="Thông báo">◌</span>
          </div>
        </header>
        <div className="content">
        <Outlet />
        </div>
      </main>
    </div>
  );
}

function ChevronIcon({ direction = 'left' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', transform: direction === 'right' ? 'rotate(180deg)' : undefined }}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
