import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePrintQueue } from '../context/PrintQueueContext';
import { useT, LanguageSwitch } from '../i18n';
import { MaintenanceControl } from './MaintenanceControl';
import smcLogo from '../img/Logo_SMC_Corporation.svg';

const NAV_GROUPS = [
  {
    key: 'tem',
    labelKey: 'nav.groupLabels',
    icon: '🏷',
    items: [
      { to: '/thiet-bi', icon: '▦', labelKey: 'nav.devices' },
      { to: '/phieu-ban-giao', icon: '☰', labelKey: 'nav.handovers' },
    ],
  },
  {
    key: 'he-thong',
    labelKey: 'nav.groupSystem',
    icon: '⚙',
    adminOnly: true,
    items: [
      { to: '/lich-su-sua', icon: '✎', labelKey: 'nav.editHistory' },
      { to: '/nguoi-dung', icon: '♙', labelKey: 'nav.users' },
    ],
  },
];

export function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const { t, locale } = useT();
  const { queue } = usePrintQueue();
  const location = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem('warehub-theme') || 'light');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  // Điện thoại: chuyển trang thì đóng ngăn kéo menu.
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem('warehub-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('warehub-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
  }, [sidebarCollapsed]);

  return (
    <div className={`app-shell theme-${theme} ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><img src={smcLogo} alt="SMC" /></div>
          <div>
            <div className="brand">Ware<span>Hub</span></div>
            <div className="brand-caption">{t('layout.brandCaption')}</div>
          </div>
        </div>
        <button
          className="sidebar-toggle"
          type="button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          aria-label={sidebarCollapsed ? t('nav.expandLong') : t('nav.collapseLong')}
          title={sidebarCollapsed ? t('nav.expand') : t('nav.collapse')}
        >
          <ChevronIcon direction={sidebarCollapsed ? 'right' : 'left'} />
        </button>

        <div className="nav-section-label">{t('layout.workspace')}</div>
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
                  {t(group.labelKey)}
                  <span className="nav-group-chevron">▸</span>
                </button>
                <div className={`nav-group-children ${isOpen ? 'open' : 'closed'}`}>
                  {group.items.map((item) => (
                    <NavLink to={item.to} className="nav-link" key={item.to}>
                      <span className="nav-icon">{item.icon}</span> {t(item.labelKey)}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="system-status"><span className="status-dot" /> {t('layout.status')}</div>
          <div className="user-box">
            <div className="avatar">{user?.full_name?.charAt(0)?.toUpperCase() || 'U'}</div>
            <div className="user-details">
              <b>{user?.full_name}</b>
              <span>{user?.role === 'admin' ? t('role.admin') : t('role.staff')}</span>
            </div>
            <button onClick={logout} title={t('layout.logout')}>↗</button>
          </div>
        </div>
      </aside>
      <div className="nav-backdrop" onClick={() => setMobileNavOpen(false)} />
      <main className="main-area">
        <header className="content-header">
          <button
            className="nav-hamburger"
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label={mobileNavOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-expanded={mobileNavOpen}
          >{mobileNavOpen ? '×' : '☰'}</button>
          <div className="header-title">
            <span className="eyebrow">{t('layout.eyebrow')}</span>
            <h1>{t('layout.greeting', { name: user?.full_name?.split(' ').pop() || t('layout.greetingFallback') })}</h1>
          </div>
          <div className="header-tools">
            <span className="header-date">{new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <MaintenanceControl />
            <LanguageSwitch />
            <button
              className="theme-toggle"
              type="button"
              onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? t('layout.themeToLight') : t('layout.themeToDark')}
              title={theme === 'dark' ? t('layout.themeLight') : t('layout.themeDark')}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <span className="header-bell" aria-label={t('layout.notifications')}>◌</span>
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
