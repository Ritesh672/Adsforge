import { useState } from 'react';
import DesktopSidebar from './DesktopSidebar';
import MobileHeader from './MobileHeader';

export default function AppLayout({ children, syncStatus, onSyncNow }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="app-layout">
      <DesktopSidebar syncStatus={syncStatus} onSyncNow={onSyncNow} />
      <MobileHeader
        isOpen={isMobileMenuOpen}
        onOpen={() => setIsMobileMenuOpen(true)}
        onClose={closeMobileMenu}
        syncStatus={syncStatus}
        onSyncNow={onSyncNow}
      />
      <div className="main-content">
        {children}
      </div>
    </div>
  );
}
