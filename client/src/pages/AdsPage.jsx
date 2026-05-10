import { useState, useEffect, useCallback } from 'react';
import Topbar from '../components/Topbar';
import { fmt } from '../components/StatCard';
import { getMetaOverview, getMetaDaily } from '../api';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, AreaChart, Area, LineChart, Line, ComposedChart, Bar
} from 'recharts';

const getLocalDate = (daysOffset = 0) => {
  const d = new Date();
  if (daysOffset !== 0) d.setDate(d.getDate() + daysOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCompletedPeriodRange = (days) => ({
  start: getLocalDate(-days),
  end: getLocalDate(-1),
});

// Modern KPI Selector Card
const KPICard = ({ label, value, icon, isActive, onClick, trend, trendUp }) => (
  <div 
    className="kpi-selector-card"
    onClick={onClick}
    style={{
      background: isActive 
        ? 'linear-gradient(135deg, rgba(108, 99, 255, 0.1) 0%, rgba(108, 99, 255, 0.05) 100%)'
        : 'rgba(255, 255, 255, 0.02)',
      border: isActive ? '1px solid rgba(108, 99, 255, 0.5)' : '1px solid rgba(255, 255, 255, 0.05)',
      boxShadow: isActive ? '0 0 24px rgba(108, 99, 255, 0.15)' : 'none',
      cursor: 'pointer',
      padding: '20px',
      borderRadius: '14px',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden',
    }}
    onMouseEnter={(e) => !isActive && (e.currentTarget.style.borderColor = 'rgba(108, 99, 255, 0.3)')}
    onMouseLeave={(e) => !isActive && (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)')}
  >
    <div style={{ position: 'relative', zIndex: 2 }}>
      <div style={{ fontSize: '24px', marginBottom: '12px' }}>{icon}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: '12px' }}>
        {value}
      </div>
      {trend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: trendUp ? 'var(--green)' : 'var(--red)', fontSize: '12px', fontWeight: 700 }}>
            {trendUp ? '↗' : '↘'} {trend}%
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>vs prev</span>
        </div>
      )}
    </div>
    {isActive && (
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 30% 30%, rgba(108, 99, 255, 0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
    )}
  </div>
);

// Compact Funnel Metric Card
const FunnelMiniCard = ({ label, value, isActive, onClick, icon, trend, trendUp }) => (
  <div 
    className="funnel-metric-badge"
    onClick={onClick}
    style={{
      background: isActive 
        ? 'linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(108, 99, 255, 0.08) 100%)'
        : 'rgba(255, 255, 255, 0.03)',
      border: isActive ? '1px solid rgba(108, 99, 255, 0.6)' : '1px solid rgba(255, 255, 255, 0.08)',
      cursor: 'pointer',
      padding: '14px 16px',
      borderRadius: '12px',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}
    onMouseEnter={(e) => !isActive && (e.currentTarget.style.borderColor = 'rgba(108, 99, 255, 0.4)')}
    onMouseLeave={(e) => !isActive && (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)')}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ fontSize: '14px' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          {label}
        </div>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
          {value}
        </div>
      </div>
    </div>
    {trend && (
      <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ color: trendUp ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
          {trendUp ? '↗' : '↘'} {trend}%
        </span>
      </div>
    )}
  </div>
);

export default function AdsPage() {
  const [activePeriod, setActivePeriod] = useState('30d');
  const [dateRange, setDateRange] = useState(getCompletedPeriodRange(30));
  
  const [activeKPI, setActiveKPI] = useState('revenue');
  const [activeFunnelMetric, setActiveFunnelMetric] = useState('landing_page_views');

  const [overview, setOverview] = useState(null);
  const [daily, setDaily] = useState([]);
  const [, setLoading] = useState(true);

  const fetchData = useCallback(async (params) => {
    setLoading(true);
    try {
      const [ov, dl] = await Promise.all([
        getMetaOverview(params),
        getMetaDaily(params)
      ]);
      setOverview(ov.data);
      setDaily(dl.data.daily || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData({ start_date: dateRange.start, end_date: dateRange.end });
  }, [dateRange, fetchData]);

  const handlePeriodChange = (p) => {
    setActivePeriod(p);
    let start;
    if (p === 'today') start = getLocalDate();
    else if (p === 'yesterday') start = getLocalDate(-1);
    else if (p === '7d') start = getLocalDate(-7);
    else if (p === '30d') start = getLocalDate(-30);
    else if (p === '90d') start = getLocalDate(-90);
    setDateRange({ start, end: getLocalDate(-1) });
  };

  const kpiData = [
    { id: 'revenue', label: 'Total Revenue', value: fmt(overview?.shopify_revenue), icon: '👜', trend: '14.2', trendUp: true },
    { id: 'spend', label: 'Total Spend', value: fmt(overview?.total_spend), icon: '💳', trend: '8.1', trendUp: false },
    { id: 'roas', label: 'ROAS', value: `${overview?.real_roas?.toFixed(2)}x`, icon: '📊', trend: '25.4', trendUp: true },
    { id: 'aov', label: 'Avg. Order Value', value: fmt(overview?.shopify_revenue / (overview?.shopify_orders || 1)), icon: '🛒', trend: '12.6', trendUp: true },
  ];

  const funnelMetrics = [
    { id: 'impressions', label: 'Impressions', value: (overview?.total_impressions / 1000000).toFixed(2) + 'M', icon: '👁️', trend: '18.8', trendUp: true },
    { id: 'reach', label: 'Reach', value: (overview?.total_reach / 1000000).toFixed(2) + 'M', icon: '👥', trend: '16.2', trendUp: true },
    { id: 'clicks', label: 'Clicks', value: (overview?.total_clicks / 1000).toFixed(1) + 'K', icon: '🖱️', trend: '12.8', trendUp: true },
    { id: 'meta_add_to_cart', label: 'Add to Cart', value: (overview?.meta_add_to_cart / 1000).toFixed(1) + 'K', icon: '🛒', trend: '9.3', trendUp: true },
    { id: 'meta_initiate_checkout', label: 'Checkout Initiated', value: (overview?.meta_initiate_checkout / 1000).toFixed(1) + 'K', icon: '💳', trend: '8.1', trendUp: true },
    { id: 'meta_purchases', label: 'Purchases', value: (overview?.meta_purchases / 1000).toFixed(2) + 'K', icon: '📦', trend: '11.4', trendUp: true },
    { id: 'frequency', label: 'Frequency', value: overview?.avg_frequency?.toFixed(2), icon: '🔄', trend: '2.3', trendUp: false },
  ];

  const formatFunnelValue = (value) => {
    const safeValue = Number(value || 0);
    if (safeValue >= 1000000) return `${(safeValue / 1000000).toFixed(2)}M`;
    if (safeValue >= 1000) return `${(safeValue / 1000).toFixed(1)}K`;
    return safeValue.toLocaleString('en-IN');
  };

  const landingPageViews = overview?.total_landing_page_views ?? overview?.total_clicks;
  const conversionFunnelMetrics = [
    { id: 'landing_page_views', label: 'Landing Page', value: formatFunnelValue(landingPageViews), icon: 'LP' },
    { id: 'meta_add_to_cart', label: 'Add to Cart', value: formatFunnelValue(overview?.meta_add_to_cart), icon: 'ATC' },
    { id: 'meta_initiate_checkout', label: 'Checkout', value: formatFunnelValue(overview?.meta_initiate_checkout), icon: 'CO' },
    { id: 'meta_purchases', label: 'Purchase', value: formatFunnelValue(overview?.meta_purchases), icon: 'P' },
  ];
  const conversionFunnelBars = [
    { label: 'Landing Page', value: landingPageViews },
    { label: 'Add to Cart', value: overview?.meta_add_to_cart },
    { label: 'Checkout', value: overview?.meta_initiate_checkout },
    { label: 'Purchase', value: overview?.meta_purchases },
  ];
  const conversionMaxFunnel = Math.max(...conversionFunnelBars.map(b => b.value || 0));

  const getMetricLabel = (id) => {
    return kpiData.find(k => k.id === id)?.label || conversionFunnelMetrics.find(f => f.id === id)?.label || funnelMetrics.find(f => f.id === id)?.label || id;
  };

  return (
    <>
      <Topbar
        title="Ads Performance"
        subtitle="Track and optimize your Meta Ads performance"
        dateRange={dateRange}
        onDateChange={(r) => { setActivePeriod(null); setDateRange(r); }}
        activePeriod={activePeriod}
        onPeriodChange={handlePeriodChange}
      />

      <div className="page-content">
        
        {/* ═══════════════════════════════════════════════════════════
            SECTION 1: TOP KPI CONTROL CARDS
            ═══════════════════════════════════════════════════════════ */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            {kpiData.map(kpi => (
              <KPICard 
                key={kpi.id}
                {...kpi}
                isActive={activeKPI === kpi.id}
                onClick={() => setActiveKPI(kpi.id)}
              />
            ))}
          </div>
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: '14px' }}>💡</span>
            <span>Click any metric card above to view its detailed trend</span>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 2: ANALYTICS GRAPH AREA (2 COLUMNS)
            ═══════════════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
          
          {/* LEFT: Dynamic Metric Trend Chart */}
          <div className="card" style={{ padding: '28px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {getMetricLabel(activeKPI)} Trend
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Daily trend over selected period
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(108, 99, 255, 0.1)', borderRadius: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6c63ff' }}></div>
                <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {getMetricLabel(activeKPI)}
                </span>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: '340px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6c63ff" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6c63ff" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    tickFormatter={(str) => new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    tickFormatter={(v) => activeKPI === 'revenue' || activeKPI === 'spend' || activeKPI === 'aov' ? `₹${v >= 1000 ? (v/1000).toFixed(0) + 'K' : v}` : v}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--bg-card)', 
                      border: '1px solid var(--border-light)',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
                    }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey={activeKPI === 'roas' ? 'real_roas' : (activeKPI === 'revenue' ? 'revenue' : activeKPI)} 
                    stroke="#6c63ff" 
                    fillOpacity={1} 
                    fill="url(#colorMetric)" 
                    strokeWidth={2.5}
                    isAnimationActive={true}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* RIGHT: Spend vs Revenue Comparison */}
          <div className="card" style={{ padding: '28px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  Revenue vs Spend
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Side-by-side comparison
                </p>
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '3px', height: '12px', borderRadius: '2px', background: '#6c63ff' }}></div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Revenue</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '3px', height: '12px', borderRadius: '2px', background: '#00d4a0' }}></div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Spend</span>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: '340px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    tickFormatter={(str) => new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    tickFormatter={(v) => `₹${v >= 1000 ? (v/1000).toFixed(0) + 'K' : v}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--bg-card)', 
                      border: '1px solid var(--border-light)',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
                    }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#6c63ff" strokeWidth={2.5} dot={false} isAnimationActive={true} />
                  <Line type="monotone" dataKey="spend" stroke="#00d4a0" strokeWidth={2.5} dot={false} isAnimationActive={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 3: FUNNEL PERFORMANCE METRIC CARDS
            ═══════════════════════════════════════════════════════════ */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Conversion Funnel Metrics</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Landing page uses available Meta clicks as the traffic proxy</p>
          </div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px'
          }}>
            {conversionFunnelMetrics.map(m => (
              <FunnelMiniCard 
                key={m.id}
                {...m}
                isActive={activeFunnelMetric === m.id}
                onClick={() => setActiveFunnelMetric(m.id)}
              />
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 4: FUNNEL ANALYTICS GRAPHS (2 COLUMNS)
            ═══════════════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
          
          {/* LEFT: Conversion Funnel Visualization */}
          <div className="card" style={{ padding: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Conversion Funnel
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px' }}>
              Landing page to purchase
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {conversionFunnelBars.map((bar, idx) => {
                const previousValue = conversionFunnelBars[idx - 1]?.value || 0;
                const conversionFromPrev = idx > 0 && previousValue > 0 ? (bar.value / previousValue * 100).toFixed(1) : '100.0';
                
                return (
                  <div key={bar.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {bar.label}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '11px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{bar.value?.toLocaleString('en-IN') || '0'}</span>
                        <span style={{ color: idx === 0 ? 'var(--text-secondary)' : 'var(--green)', fontWeight: 700 }}>
                          {conversionFromPrev}%
                        </span>
                      </div>
                    </div>
                    <div style={{ 
                      height: '6px', 
                      background: 'rgba(255,255,255,0.04)', 
                      borderRadius: '3px',
                      overflow: 'hidden'
                    }}>
                      <div 
                        style={{ 
                          width: `${(bar.value / conversionMaxFunnel * 100) || 0}%`, 
                          height: '100%',
                          background: 'linear-gradient(90deg, #6c63ff, #4cc9f0)',
                          borderRadius: '3px',
                          transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ 
              marginTop: '24px', 
              paddingTop: '20px', 
              borderTop: '1px dashed var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Landing Page to Purchase</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#6c63ff' }}>
                {((overview?.meta_purchases / (landingPageViews || 1)) * 100).toFixed(3)}%
              </span>
            </div>
          </div>

          {/* RIGHT: Dynamic Funnel Metric Trend */}
          <div className="card" style={{ padding: '28px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {getMetricLabel(activeFunnelMetric)} Trend
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Daily breakdown
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(0, 212, 160, 0.1)', borderRadius: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00d4a0' }}></div>
                <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {getMetricLabel(activeFunnelMetric)}
                </span>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: '340px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorFunnel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d4a0" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00d4a0" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    tickFormatter={(str) => new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    tickFormatter={(v) => v >= 1000000 ? (v/1000000).toFixed(1) + 'M' : (v >= 1000 ? (v/1000).toFixed(0) + 'K' : v)}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--bg-card)', 
                      border: '1px solid var(--border-light)',
                      borderRadius: '12px',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
                    }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey={activeFunnelMetric} 
                    stroke="#00d4a0" 
                    fillOpacity={1} 
                    fill="url(#colorFunnel)" 
                    strokeWidth={2.5}
                    isAnimationActive={true}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 5: DAILY BREAKDOWN TABLE
            ═══════════════════════════════════════════════════════════ */}
        <div className="card" style={{ overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ 
            padding: '24px 28px',
            background: 'rgba(255,255,255,0.01)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Daily Performance Breakdown
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Detailed daily metrics for your Meta Ads campaigns
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{
                padding: '8px 14px',
                fontSize: '11px',
                fontWeight: 600,
                background: 'rgba(108, 99, 255, 0.1)',
                border: '1px solid rgba(108, 99, 255, 0.3)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
                📊 Columns
              </button>
              <button style={{
                padding: '8px 14px',
                fontSize: '11px',
                fontWeight: 600,
                background: 'rgba(108, 99, 255, 0.1)',
                border: '1px solid rgba(108, 99, 255, 0.3)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
                📥 Export
              </button>
            </div>
          </div>
          
          <div style={{ maxHeight: '700px', overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ 
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px'
            }}>
              <thead style={{ 
                position: 'sticky',
                top: 0,
                background: 'var(--bg-card)',
                borderBottom: '1px solid var(--border)',
                zIndex: 10
              }}>
                <tr>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>Date</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>Spend</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>Impressions</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>Reach</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>Clicks</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>CTR</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>CPC</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>ATC</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>Checkout</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>Purchases</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>CPA</th>
                  <th style={{ padding: '16px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>ROAS</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {daily.slice().reverse().map((r, idx) => {
                  const cpa = r.meta_purchases > 0 ? (r.spend / r.meta_purchases).toFixed(2) : '—';
                  const isEvenRow = idx % 2 === 0;
                  
                  return (
                    <tr key={r.date} style={{
                      background: isEvenRow ? 'transparent' : 'rgba(255,255,255,0.01)',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      transition: 'background 0.2s',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(108, 99, 255, 0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = isEvenRow ? 'transparent' : 'rgba(255,255,255,0.01)'}
                    >
                      <td style={{ padding: '14px 20px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {fmt(r.spend)}
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {(r.impressions / 1000).toFixed(1)}K
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {(r.reach / 1000).toFixed(1)}K
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {r.clicks.toLocaleString()}
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {r.ctr?.toFixed(2)}%
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {fmt(r.cpc)}
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {r.meta_add_to_cart?.toLocaleString() || '0'}
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {r.meta_initiate_checkout?.toLocaleString() || '0'}
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {r.meta_purchases?.toLocaleString() || '0'}
                      </td>
                      <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {fmt(cpa)}
                      </td>
                      <td style={{ 
                        padding: '14px 12px', 
                        textAlign: 'right', 
                        fontWeight: 700,
                        color: r.real_roas > 2.5 ? 'var(--green)' : (r.real_roas > 1 ? 'var(--yellow)' : 'var(--red)')
                      }}>
                        {r.real_roas?.toFixed(2)}x
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 700 }}>
                        {fmt(r.revenue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
