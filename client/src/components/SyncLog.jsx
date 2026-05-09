export default function SyncLog({ logs = [] }) {
  const icons = {
    success: '✅',
    info:    '🔵',
    error:   '❌',
    warn:    '⚠️',
  };

  return (
    <div className="sync-log-card">
      <div className="sync-log-header">
        <div className="sync-log-title">Sync Activity</div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>On page load</span>
      </div>
      <div className="sync-log-list">
        {logs.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px 0' }}>
            <span>No sync activity</span>
          </div>
        ) : (
          logs.map((log, i) => (
            <div className="sync-log-item" key={i}>
              <div className="sync-log-icon">{icons[log.type] || '🔵'}</div>
              <div className="sync-log-body">
                <div className="sync-log-msg">{log.message}</div>
                <div className="sync-log-time">{log.time}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
