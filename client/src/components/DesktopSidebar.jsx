import Sidebar from './Sidebar';

export default function DesktopSidebar({ syncStatus, lastSyncedAt, onSyncNow }) {
  return (
    <div className="desktop-sidebar">
      <Sidebar syncStatus={syncStatus} lastSyncedAt={lastSyncedAt} onSyncNow={onSyncNow} />
    </div>
  );
}
