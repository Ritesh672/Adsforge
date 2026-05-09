const fmt = (n, type = 'currency') => {
  if (n === null || n === undefined) return '—';
  
  if (type === 'currency') {
    const val = Math.abs(n);
    if (val >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (val >= 100000)   return `₹${(n / 100000).toFixed(2)} L`;
    if (val >= 1000)     return `₹${(n / 1000).toFixed(1)} K`;
    return `₹${Number(n).toFixed(2)}`;
  }
  
  if (type === 'number') {
    const val = Math.abs(n);
    if (val >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`;
    if (val >= 100000)   return `${(n / 100000).toFixed(2)} L`;
    return Number(n).toLocaleString('en-IN');
  }
  
  if (type === 'pct')    return `${Number(n).toFixed(2)}%`;
  if (type === 'mult')   return `${Number(n).toFixed(2)}×`;
  return n;
};

const calcChange = (curr, prev) => {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
};

export default function StatCard({ 
  label, value, valueType = 'currency', icon, color = 'purple', 
  change, changeLabel, onClick, isActive 
}) {
  const isUp   = change > 0;
  const isDown = change < 0;

  return (
    <div 
      className={`stat-card ${color} ${onClick ? 'clickable' : ''} ${isActive ? 'active' : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="stat-card-header">
        <div className="stat-label">{label}</div>
        <div className={`stat-icon ${color}`}>{icon}</div>
      </div>

      <div className="stat-value">
        {value === null || value === undefined
          ? <div className="skeleton" style={{ height: 32, width: 120 }} />
          : fmt(value, valueType)
        }
      </div>

      <div className="stat-footer">
        {change !== null && change !== undefined ? (
          <>
            <span className={`stat-change ${isUp ? 'up' : isDown ? 'down' : ''}`}>
              {isUp ? '↑' : isDown ? '↓' : '—'} {Math.abs(change).toFixed(1)}%
            </span>
            <span className="stat-vs-text">{changeLabel || 'vs prev period'}</span>
          </>
        ) : (
          <span className="stat-vs-text">No comparison data</span>
        )}
      </div>
    </div>
  );
}

export { fmt, calcChange };
