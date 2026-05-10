import { useCallback, useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import LineChart from '../components/LineChart';
import ParetoChart from '../components/ParetoChart';
import ProductInsightsTab from '../components/ProductInsightsTab';
import ReturnsTab from '../components/ReturnsTab';
import StatCard, { fmt } from '../components/StatCard';
import Topbar from '../components/Topbar';
import { getPareto, getProductOverview } from '../api';

const COLORS = ['#6c63ff', '#00d4a0', '#32d74b', '#ff9f0a', '#ff453a'];

const getLocalDate = (daysOffset = 0) => {
  const date = new Date();
  if (daysOffset !== 0) date.setDate(date.getDate() + daysOffset);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const getCompletedPeriodRange = (days) => ({
  start: getLocalDate(-days),
  end: getLocalDate(-1),
});

export default function ProductsPage() {
  const [activeTab, setActiveTab] = useState('insights');
  const [selectedMetric, setSelectedMetric] = useState('revenue');
  const [period, setPeriod] = useState('today');
  const [dateRange, setDateRange] = useState({
    start: getLocalDate(),
    end: getLocalDate(),
  });
  const [data, setData] = useState(null);
  const [paretoData, setParetoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paretoLoading, setParetoLoading] = useState(true);
  const [overviewError, setOverviewError] = useState(null);

  const fetchData = useCallback(async (params) => {
    setLoading(true);
    setParetoLoading(true);
    setOverviewError(null);

    try {
      const [overviewResult, paretoResult] = await Promise.allSettled([
        getProductOverview(params),
        getPareto(params),
      ]);

      if (overviewResult.status === 'fulfilled') {
        setData(overviewResult.value.data);
      } else {
        console.error(overviewResult.reason);
        setData(null);
        setOverviewError('Product overview data could not be loaded.');
      }

      if (paretoResult.status === 'fulfilled') {
        setParetoData(paretoResult.value.data);
      } else {
        console.error(paretoResult.reason);
        setParetoData(null);
      }
    } finally {
      setLoading(false);
      setParetoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (period === 'custom') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchData({ start_date: dateRange.start, end_date: dateRange.end });
    } else {
      fetchData({ period });
    }
  }, [dateRange.end, dateRange.start, fetchData, period]);

  useEffect(() => {
    const refreshAfterSync = () => {
      if (period === 'custom') {
        fetchData({ start_date: dateRange.start, end_date: dateRange.end });
      } else {
        fetchData({ period });
      }
    };

    window.addEventListener('adforge:sync-complete', refreshAfterSync);
    return () => window.removeEventListener('adforge:sync-complete', refreshAfterSync);
  }, [dateRange.end, dateRange.start, fetchData, period]);

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);

    if (newPeriod === 'today') {
      const today = getLocalDate();
      setDateRange({ start: today, end: today });
    } else if (newPeriod === 'yesterday') {
      const yesterday = getLocalDate(-1);
      setDateRange({ start: yesterday, end: yesterday });
    } else if (newPeriod === '7d') {
      setDateRange(getCompletedPeriodRange(7));
    } else if (newPeriod === '30d') {
      setDateRange(getCompletedPeriodRange(30));
    } else if (newPeriod === '90d') {
      setDateRange(getCompletedPeriodRange(90));
    }
  };

  const handleDateChange = (newRange) => {
    setDateRange(newRange);
    setPeriod('custom');
  };

  const renderOverview = () => {
    const kpi = data?.kpis || {};
    const chartData = data?.chart || [];
    const categories = data?.categories || [];
    const totalProducts = paretoData?.products?.length || 0;
    const topProductsCount = paretoData?.pareto_threshold_product_count || 0;
    const topProductsPct = totalProducts > 0 ? ((topProductsCount / totalProducts) * 100).toFixed(1) : 0;

    const metricLabels = {
      revenue: 'Total Revenue',
      units: 'Units Sold',
      cancelled_orders: 'Cancelled Orders',
    };

    const metricColors = {
      revenue: '#6c63ff',
      units: '#00d4a0',
      cancelled_orders: '#ff453a',
    };

    const metricType = selectedMetric === 'revenue'
      ? 'currency'
      : 'number';

    return (
      <div className="products-overview">
        {overviewError && (
          <div className="empty-state product-empty-state" style={{ marginBottom: 16 }}>
            <div className="empty-state-icon">Overview unavailable</div>
            <p>{overviewError}</p>
          </div>
        )}

        <div className="stats-grid">
          <StatCard
            label="Total Revenue"
            value={loading ? null : kpi.revenue}
            valueType="currency"
            icon="$"
            color="blue"
            change={kpi.revenue_change_pct}
            onClick={() => setSelectedMetric('revenue')}
            isActive={selectedMetric === 'revenue'}
          />
          <StatCard
            label="Units Sold"
            value={loading ? null : kpi.units}
            valueType="number"
            icon="#"
            color="green"
            change={kpi.units_change_pct}
            onClick={() => setSelectedMetric('units')}
            isActive={selectedMetric === 'units'}
          />
          <StatCard
            label="Cancelled Orders"
            value={loading ? null : kpi.cancelled_orders}
            valueType="number"
            icon="X"
            color="red"
            change={kpi.cancelled_orders_change_pct}
            changeLabel="vs prev period"
            helperText={`${Number(kpi.cancel_rate || 0).toFixed(1)}% cancel rate`}
            onClick={() => setSelectedMetric('cancelled_orders')}
            isActive={selectedMetric === 'cancelled_orders'}
          />
          <StatCard
            label="Active Products"
            value={loading ? null : kpi.active_products}
            valueType="number"
            icon="A"
            color="purple"
            showComparison={false}
          />
        </div>

        <div className="products-main-grid mt-6">
          <div className="card performance-card">
            <div className="card-header" style={{ padding: '24px 24px 12px' }}>
              <div>
                <h3 className="card-title">Performance Trend: {metricLabels[selectedMetric]}</h3>
                <p className="card-subtitle">Daily breakdown for the selected period</p>
              </div>
            </div>

            <div className="chart-container" style={{ height: 350, padding: '0 24px 24px' }}>
              <LineChart
                data={chartData}
                currentKey={selectedMetric}
                currentName={metricLabels[selectedMetric]}
                currentColor={metricColors[selectedMetric]}
                valueType={metricType}
                loading={loading}
                hideHeader
              />
            </div>
          </div>

          <div className="card concentration-card" style={{ padding: '24px' }}>
            <h3 className="card-title">Portfolio Concentration</h3>
            <p className="card-subtitle">Top products contribution to total revenue</p>

            <div className="gauge-wrap mt-6">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={[
                      { value: loading ? 0 : kpi.concentration_pct || 0 },
                      { value: loading ? 100 : 100 - (kpi.concentration_pct || 0) },
                    ]}
                    cx="50%"
                    cy="100%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius={60}
                    outerRadius={80}
                    dataKey="value"
                  >
                    <Cell fill="#6c63ff" />
                    <Cell fill="#1e1e2e" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="gauge-center">
                <span className="gauge-value">{loading ? '-' : `${Math.round(kpi.concentration_pct || 0)}%`}</span>
                <span className="gauge-label">{(kpi.concentration_pct || 0) > 50 ? 'High Concentration' : 'Healthy Mix'}</span>
              </div>
            </div>

            <div className="concentration-footer mt-4">
              <p className="text-small" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Top 5 products generate {loading ? '-' : `${Math.round(kpi.concentration_pct || 0)}%`} of total revenue
              </p>
              <div className="risk-bar mt-2">
                <div className={`risk-segment low ${(kpi.concentration_pct || 0) <= 30 ? 'active' : ''}`} />
                <div className={`risk-segment mid ${(kpi.concentration_pct || 0) > 30 && (kpi.concentration_pct || 0) <= 60 ? 'active' : ''}`} />
                <div className={`risk-segment high ${(kpi.concentration_pct || 0) > 60 ? 'active' : ''}`} />
              </div>
              <div className="risk-labels">
                <span>Low Risk</span>
                <span>High Risk</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card mt-6" style={{ padding: '24px' }}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="card-title">Pareto Analysis (80/20 Rule)</h3>
              <p className="card-subtitle">Understand how revenue is concentrated across your product catalog</p>
            </div>
            {!paretoLoading && paretoData && (
              <div className="flex gap-4">
                <div className="text-right">
                  <span className="text-small" style={{ display: 'block', color: 'var(--text-secondary)' }}>Critical Few</span>
                  <span className="font-bold" style={{ color: 'var(--blue)' }}>{topProductsCount} Products</span>
                </div>
                <div className="text-right">
                  <span className="text-small" style={{ display: 'block', color: 'var(--text-secondary)' }}>Catalog Share</span>
                  <span className="font-bold" style={{ color: 'var(--green)' }}>{topProductsPct}%</span>
                </div>
              </div>
            )}
          </div>

          <div className="pareto-grid mt-6">
            <div style={{ height: 380 }}>
              <ParetoChart data={paretoData?.products} loading={paretoLoading} />
            </div>
            <div className="pareto-insights">
              <div className="card" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)', padding: '20px' }}>
                <h4 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--blue)' }}>Inventory Strategy</h4>
                <p className="text-small" style={{ lineHeight: 1.6 }}>
                  Your top <b>{topProductsCount}</b> products generate 80% of your total revenue.
                  These are your <b>Tier A</b> assets.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="products-secondary-grid mt-6">
          <div className="card categories-card" style={{ padding: '24px' }}>
            <h3 className="card-title">Top Categories by Revenue</h3>
            <div className="categories-content mt-4" style={{ padding: 0 }}>
              <div style={{ width: '180px', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categories}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={5}
                      dataKey="revenue"
                    >
                      {categories.map((entry, index) => (
                        <Cell key={entry.category} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="categories-legend" style={{ marginLeft: '24px' }}>
                {categories.map((category, index) => (
                  <div className="legend-item" key={category.category}>
                    <div className="dot" style={{ background: COLORS[index % COLORS.length] }} />
                    <span className="name">{category.category}</span>
                    <span className="value">{fmt(category.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card insights-card" style={{ padding: '24px' }}>
            <h3 className="card-title">Product Insights</h3>
            <div className="insights-grid mt-4" style={{ padding: 0 }}>
              <div className="insight-item">
                <div className="insight-icon" style={{ color: 'var(--blue)' }}>80</div>
                <div className="insight-body">
                  <span className="insight-label">Revenue Driver</span>
                  <p className="insight-text"><b>{topProductsPct}%</b> of products generate <b>80%</b> of total revenue</p>
                </div>
              </div>
              <div className="insight-item">
                <div className="insight-icon" style={{ color: 'var(--green)' }}>A</div>
                <div className="insight-body">
                  <span className="insight-label">Inventory Health</span>
                  <p className="insight-text"><b>{topProductsCount}</b> items identified as high-priority winners</p>
                </div>
              </div>
              <div className="insight-item">
                <div className="insight-icon" style={{ color: 'var(--yellow)' }}>!</div>
                <div className="insight-body">
                  <span className="insight-label">Concentration Risk</span>
                  <p className="insight-text"><b>{(kpi.concentration_pct || 0) > 60 ? 'High' : 'Moderate'}</b> risk detected in portfolio</p>
                </div>
              </div>
              <div className="insight-item">
                <div className="insight-icon" style={{ color: 'var(--red)' }}>-</div>
                <div className="insight-body">
                  <span className="insight-label">Dead Stock Alert</span>
                  <p className="insight-text">Check the bottom {100 - Math.round(kpi.concentration_pct || 0)}% for clearance</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Topbar
        title="Products"
        subtitle="Explore product performance and rank your ecommerce catalog"
        dateRange={dateRange}
        onDateChange={handleDateChange}
        onPeriodChange={handlePeriodChange}
        activePeriod={period}
      />

      <div className="product-tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          type="button"
        >
          Overview
        </button>
        <button
          className={`tab-btn ${activeTab === 'insights' ? 'active' : ''}`}
          onClick={() => setActiveTab('insights')}
          type="button"
        >
          Product Insights
        </button>
        <button
          className={`tab-btn ${activeTab === 'returns' ? 'active' : ''}`}
          onClick={() => setActiveTab('returns')}
          type="button"
        >
          Returns / RTO
        </button>
      </div>

      <div className="page-content">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'insights' && <ProductInsightsTab dateRange={dateRange} period={period} />}
        {activeTab === 'returns' && <ReturnsTab dateRange={dateRange} period={period} />}
      </div>
    </>
  );
}
