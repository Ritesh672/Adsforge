import { NavLink, useLocation } from 'react-router-dom';

const navItems = [
  {
    section: 'GENERAL',
    items: [
      { path: '/',        label: 'Dashboard', icon: <DashboardIcon /> },
      { path: '/ads',     label: 'Ads',       icon: <AdsIcon /> },
      { path: '/products',label: 'Products',  icon: <ProductsIcon /> },
    ]
  }
];

export default function Sidebar({ syncStatus }) {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">⚡</div>
        <div className="logo-text">
          <h2>AdForge</h2>
          <span>Analytics Dashboard</span>
        </div>
      </div>

      {/* Nav */}
      {navItems.map(section => (
        <div className="sidebar-section" key={section.section}>
          <div className="sidebar-section-label">{section.section}</div>
          {section.items.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `sidebar-nav-item${isActive ? ' active' : ''}`}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}

      {/* Sync Status */}
      <div className="sidebar-bottom">
        <div className="sync-status">
          <div className={`sync-dot ${
            syncStatus === 'syncing' ? 'loading' :
            syncStatus === 'error'   ? 'error'   : 'active'
          }`} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
              {syncStatus === 'syncing' ? 'Syncing data...' :
               syncStatus === 'error'   ? 'Sync failed'    : 'Data up to date'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Auto-synced on load</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ─── Icons (inline SVG) ─── */
function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}
function AdsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
  );
}
function ProductsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  );
}
