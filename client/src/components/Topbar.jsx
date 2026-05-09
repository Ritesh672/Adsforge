const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
];

export default function Topbar({ title, subtitle, dateRange, onDateChange, onPeriodChange, activePeriod }) {
  return (
    <div className="topbar">
      <div className="topbar-left">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>

      <div className="date-range-picker">
        {/* Quick Period Tabs */}
        <div className="period-tabs">
          {PERIODS.map(p => (
            <button
              key={p.id}
              className={`period-tab${activePeriod === p.id ? ' active' : ''}`}
              onClick={() => onPeriodChange(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 8px' }} />

        {/* Custom Date Inputs */}
        <div className="flex items-center gap-2">
          <div className="date-select-group">
            <input
              type="date"
              value={dateRange.start}
              max={dateRange.end}
              onChange={e => onDateChange({ ...dateRange, start: e.target.value })}
            />
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>to</span>
          <div className="date-select-group">
            <input
              type="date"
              value={dateRange.end}
              min={dateRange.start}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => onDateChange({ ...dateRange, end: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
