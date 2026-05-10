import { useState } from 'react';
import DesktopSidebar from './DesktopSidebar';
import MobileHeader from './MobileHeader';

export default function AppLayout({ children, syncStatus, syncToast, lastSyncedAt, onSyncNow }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="app-layout">
      <DesktopSidebar syncStatus={syncStatus} lastSyncedAt={lastSyncedAt} onSyncNow={onSyncNow} />
      <MobileHeader
        isOpen={isMobileMenuOpen}
        onOpen={() => setIsMobileMenuOpen(true)}
        onClose={closeMobileMenu}
        syncStatus={syncStatus}
        lastSyncedAt={lastSyncedAt}
        onSyncNow={onSyncNow}
      />
      <div className="main-content">
        {children}
      </div>
      {syncToast && (
        <div className={`sync-toast ${syncToast.type}`} role="status" aria-live="polite">
          <div className="sync-toast-icon">
            {syncToast.type === 'success' ? '✓' : syncToast.type === 'error' ? '!' : <span />}
          </div>
          <div>
            <strong>{syncToast.title}</strong>
            <p>{syncToast.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
