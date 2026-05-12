import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Dashboard', icon: <DashboardIcon /> },
  { path: '/ads', label: 'Ads', icon: <AdsIcon /> },
  { path: '/products', label: 'Products', icon: <ProductsIcon /> },
];

const formatLastSynced = (value) => {
  if (!value) return 'Last synced time unavailable';

  return `Last synced at ${new Date(value).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })}`;
};

export default function MobileHeader({ isOpen, onOpen, onClose, syncStatus, lastSyncedAt, onSyncNow }) {
  const isSyncing = syncStatus === 'syncing';

  return (
    <>
      <header className="mobile-app-header">
        <div className="mobile-brand">
          <div className="mobile-brand-mark">
            <img src="/logo.png" alt="AdForge logo" className="brand-logo-img" />
          </div>
          <div>
            <strong>AdForge</strong>
            <span>Analytics</span>
          </div>
        </div>
        <button className="mobile-menu-trigger" type="button" onClick={onOpen} aria-label="Open navigation">
          <MenuIcon />
        </button>
      </header>

      <button
        className={`mobile-drawer-backdrop ${isOpen ? 'open' : ''}`}
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
      />

      <aside className={`mobile-drawer ${isOpen ? 'open' : ''}`} aria-hidden={!isOpen}>
        <div className="mobile-drawer-header">
          <div className="mobile-brand">
            <div className="mobile-brand-mark">
              <img src="/logo.png" alt="AdForge logo" className="brand-logo-img" />
            </div>
            <div>
              <strong>AdForge</strong>
              <span>Mobile menu</span>
            </div>
          </div>
          <button className="mobile-drawer-close" type="button" onClick={onClose} aria-label="Close navigation">
            <CloseIcon />
          </button>
        </div>

        <nav className="mobile-drawer-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `mobile-drawer-link${isActive ? ' active' : ''}`}
              onClick={onClose}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mobile-drawer-sync">
          <button className="mobile-sync-button" type="button" onClick={onSyncNow} disabled={isSyncing}>
            <SyncIcon />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
          <div className="mobile-sync-status">
            <span className={`sync-dot ${isSyncing ? 'loading' : syncStatus === 'error' ? 'error' : 'active'}`} />
            <div>
              <strong>{isSyncing ? 'Syncing data' : syncStatus === 'error' ? 'Sync failed' : 'Data up to date'}</strong>
              <span>{isSyncing ? 'Meta first, Shopify may take longer' : formatLastSynced(lastSyncedAt)}</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function AdsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function ProductsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 1-15.5 6.2" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8" />
      <path d="M18 2v4h4" />
      <path d="M6 22v-4H2" />
    </svg>
  );
}
