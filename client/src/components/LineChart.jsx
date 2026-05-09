import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { fmt } from './StatCard';

/* Custom Tooltip */
function CustomTooltip({ active, payload, label, valueType }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <div className="tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div className="tooltip-row" key={i}>
          <span className="tooltip-dot" style={{ background: p.color }} />
          <span className="tooltip-name">{p.name}</span>
          <span className="tooltip-val">{fmt(p.value, valueType)}</span>
        </div>
      ))}
    </div>
  );
}

export default function LineChart({
  title,
  subtitle,
  data = [],
  currentKey,
  previousKey,
  currentName,
  previousName,
  currentColor,
  previousColor = '#444466',
  valueType = 'currency',
  statItems = [],
  loading = false,
  hideHeader = false,
}) {

  const formatXAxis = (tick) => {
    if (!tick) return '';
    const d = new Date(tick);
    
    // Check if the data spans only a single day
    const isHourly = data.length > 0 && 
      new Date(data[0].date).toDateString() === new Date(data[data.length - 1].date).toDateString();
    
    if (isHourly) {
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  const formatYAxis = (val) => {
    if (valueType === 'currency') {
      if (val >= 1e7) return `₹${(val / 1e7).toFixed(1)} Cr`;
      if (val >= 1e5) return `₹${(val / 1e5).toFixed(1)} L`;
      if (val >= 1e3) return `₹${(val / 1e3).toFixed(0)} K`;
      return `₹${val}`;
    }
    if (valueType === 'pct') return `${val.toFixed(1)}%`;
    if (val >= 1e7) return `${(val / 1e7).toFixed(1)} Cr`;
    if (val >= 1e5) return `${(val / 1e5).toFixed(1)} L`;
    if (val >= 1e3) return `${(val / 1e3).toFixed(0)} K`;
    return val;
  };

  return (
    <div className={`chart-card ${hideHeader ? 'no-header' : ''}`} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {!hideHeader && (
        <div className="chart-header">
          <div>
            <div className="chart-title">{title}</div>
            {subtitle && <div className="chart-subtitle">{subtitle}</div>}
          </div>
          <div className="chart-legend">
            <div className="legend-item">
              <span className="legend-dot" style={{ background: currentColor }} />
              {currentName}
            </div>
            {previousKey && (
              <div className="legend-item">
                <span className="legend-dashed" style={{ borderTopColor: previousColor }} />
                {previousName}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 200, marginTop: 12 }}>
        {loading ? (
          <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 12 }} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${currentKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={currentColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={currentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#55557a' }}
                tickFormatter={formatXAxis}
                axisLine={false}
                tickLine={false}
                minTickGap={30}
              />
              <YAxis
                tickFormatter={formatYAxis}
                tick={{ fontSize: 11, fill: '#55557a' }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Tooltip
                content={<CustomTooltip valueType={valueType} />}
                cursor={{ stroke: '#2a2a3e', strokeWidth: 1 }}
              />
              {/* Previous period dashed reference */}
              {previousKey && (
                <Area
                  type="monotone"
                  dataKey={previousKey}
                  name={previousName}
                  stroke={previousColor}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  fill="none"
                  dot={false}
                />
              )}
              {/* Current period solid */}
              <Area
                type="monotone"
                dataKey={currentKey}
                name={currentName}
                stroke={currentColor}
                strokeWidth={2.5}
                fill={`url(#grad-${currentKey})`}
                dot={false}
                activeDot={{ r: 4, fill: currentColor, stroke: '#0a0a0f', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Stat Summary Row */}
      {statItems.length > 0 && (
        <div className="chart-stat-row">
          {statItems.map((s, i) => (
            <div className="chart-stat-item" key={i}>
              <div className="chart-stat-label">{s.label}</div>
              <div className="chart-stat-value">{s.value}</div>
              {s.sub && <div className="chart-stat-sub">{s.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
