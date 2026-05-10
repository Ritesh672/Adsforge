import Sidebar from './Sidebar';

export default function DesktopSidebar({ syncStatus, onSyncNow }) {
  return (
    <div className="desktop-sidebar">
      <Sidebar syncStatus={syncStatus} onSyncNow={onSyncNow} />
    </div>
  );
}
