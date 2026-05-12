import { useState, useEffect, useCallback } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import Topbar from '../components/Topbar';
import StatCard, { fmt } from '../components/StatCard';
import LineChart from '../components/LineChart';
import TopProducts from '../components/TopProducts';
import SyncLog from '../components/SyncLog';
import { getMetaOverview, getMetaDaily, getTopProducts } from '../api';

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

const getPreviousPeriodRange = ({ start, end }) => {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const days = Math.max(1, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
  const prevEnd = new Date(startDate);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  const format = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  return { start: format(prevStart), end: format(prevEnd) };
};

export default function Dashboard() {
  const [activePeriod, setActivePeriod] = useState('30d');
  const [dateRange, setDateRange] = useState(getCompletedPeriodRange(30));
  const [overview, setOverview] = useState(null);
  const [dailyData, setDailyData] = useState(null);
  const [daily, setDaily] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncLogs, setSyncLogs] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState('revenue');
  const [selectedPerformanceMetric, setSelectedPerformanceMetric] = useState('ctr');

  const addLog = useCallback((type, message) => {
    const time = new Date().toLocaleTimeString('en-IN');
    setSyncLogs(prev => [{ type, message, time }, ...prev].slice(0, 20));
  }, []);

  // Fetch data whenever date range changes
  const fetchData = useCallback(async (params) => {
    setLoading(true);
    try {
      const [ov, dl, prods] = await Promise.all([
        getMetaOverview(params),
        getMetaDaily(params),
        getTopProducts({ ...params, sort: 'revenue', limit: 8 }),
      ]);
      const prevRange = getPreviousPeriodRange({ start: params.start_date, end: params.end_date });
      const prevDaily = await getMetaDaily({ start_date: prevRange.start, end_date: prevRange.end });
      setOverview(ov.data);

      // Build chart data with previous period reference
      const rows = dl.data?.daily || [];
      const prevRows = prevDaily.data?.daily || [];
      setDailyData(dl.data); // Capture the whole response including is_hourly flag
      
      const chartRows = rows.map((r, index) => {
        const prev = prevRows[index] || {};
        const prevSpend = Number(prev.spend || 0);

        return {
          ...r,
          revenue: r.revenue,
          spend: Number(r.spend || 0),
          roas: r.real_roas,
          cpa: r.cost_per_order ?? (r.orders > 0 ? Number(r.spend || 0) / r.orders : 0),
          orders: r.orders,
          cancelled_orders: r.cancelled_orders || 0,
          ctr: Number(r.ctr || 0),
          aov: r.aov ?? (r.orders > 0 ? Number(r.revenue || 0) / r.orders : 0),
          mer: r.real_roas,
          cpc: Number(r.cpc || 0),
          atc: Number(r.meta_add_to_cart || 0),
          prev_revenue: prev.revenue || 0,
          prev_spend: prevSpend,
          prev_roas: prev.real_roas || 0,
          prev_orders: prev.orders || 0,
          prev_cancelled_orders: prev.cancelled_orders || 0,
          prev_ctr: Number(prev.ctr || 0),
          prev_aov: prev.aov ?? (prev.orders > 0 ? Number(prev.revenue || 0) / prev.orders : 0),
          prev_mer: prev.real_roas || 0,
          prev_cpc: Number(prev.cpc || 0),
          prev_atc: Number(prev.meta_add_to_cart || 0),
          prev_cpa: prev.cost_per_order ?? (prev.orders > 0 ? prevSpend / prev.orders : 0),
        };
      });
      setDaily(chartRows);
      setProducts(prods.data || []);
    } catch (e) {
      addLog('error', `Data fetch failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  useEffect(() => {
    const params = { start_date: dateRange.start, end_date: dateRange.end };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(params);
  }, [dateRange, fetchData]);

  useEffect(() => {
    const refreshAfterSync = () => {
      fetchData({ start_date: dateRange.start, end_date: dateRange.end });
      addLog('success', 'Dashboard refreshed after sync');
    };

    window.addEventListener('adforge:sync-complete', refreshAfterSync);
    return () => window.removeEventListener('adforge:sync-complete', refreshAfterSync);
  }, [addLog, dateRange.end, dateRange.start, fetchData]);

  const handlePeriodChange = (period) => {
    setActivePeriod(period);
    if (period === 'today') {
      const todayStr = getLocalDate();
      setDateRange({ start: todayStr, end: todayStr });
      return;
    }
    if (period === 'yesterday') {
      const yestStr = getLocalDate(-1);
      setDateRange({ start: yestStr, end: yestStr });
      return;
    }

    const daysMap = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    setDateRange(getCompletedPeriodRange(daysMap[period] || 30));
  };

  const handleDateChange = (newRange) => {
    setActivePeriod(null);
    setDateRange(newRange);
  };

  // Process data for charts
  const isHourly = dailyData?.is_hourly;
  
  const chartData = daily.map((d) => ({
    ...d,
    // Use date field for LineChart compatibility
    date: isHourly ? `${dateRange.start}T${String(d.hour).padStart(2, '0')}:00:00` : d.date,
  }));

  const revenueSpendChartData = isHourly
    ? (() => {
        let cumulativeRevenue = 0;
        let cumulativeSpend = 0;
        const startOfDay = `${dateRange.start}T00:00:00`;
        const points = [{ date: startOfDay, revenue: 0, spend: 0 }];

        chartData.forEach((row) => {
          cumulativeRevenue += Number(row.revenue || 0);
          cumulativeSpend += Number(row.spend || 0);

          const pointDate = new Date(`${dateRange.start}T00:00:00`);
          pointDate.setHours(Number(row.hour || 0) + 1, 0, 0, 0);
          const year = pointDate.getFullYear();
          const month = String(pointDate.getMonth() + 1).padStart(2, '0');
          const day = String(pointDate.getDate()).padStart(2, '0');
          const hour = String(pointDate.getHours()).padStart(2, '0');

          points.push({
            ...row,
            date: `${year}-${month}-${day}T${hour}:00:00`,
            revenue: cumulativeRevenue,
            spend: cumulativeSpend,
          });
        });

        return points;
      })()
    : chartData;

  const ov = overview;
  const cpa = ov?.cost_per_order ?? (ov?.shopify_orders > 0 ? ov.total_spend / ov.shopify_orders : 0);

  const revenueChange = ov?.changes?.shopify_revenue ?? null;
  const spendChange = ov?.changes?.total_spend ?? null;
  const roasChange = ov?.changes?.real_roas ?? null;
  const ordersChange = ov?.changes?.shopify_orders ?? null;
  const cancelledOrdersChange = ov?.changes?.cancelled_orders ?? null;
  const cpoChange = ov?.changes?.cost_per_order ?? null;

  const metricConfigs = {
    revenue: {
      title: 'Revenue Over Time',
      subtitle: isHourly ? 'Hourly revenue distribution' : 'Daily Shopify revenue (ground truth)',
      currentKey: 'revenue',
      previousKey: 'prev_revenue',
      currentName: 'Revenue',
      currentColor: '#00d4a0',
      valueType: 'currency',
      statItems: [
        { label: 'Total Revenue', value: loading ? '...' : fmt(ov?.shopify_revenue), sub: `${ov?.shopify_orders?.toLocaleString('en-IN') || 0} orders` },
        { label: isHourly ? 'Avg Hourly Revenue' : 'Avg Daily Revenue', value: loading || !daily.length ? '...' : fmt((ov?.shopify_revenue || 0) / Math.max(daily.length, 1)) },
        { label: 'Avg Order Value', value: loading ? '...' : fmt(ov?.shopify_revenue && ov?.shopify_orders ? ov.shopify_revenue / ov.shopify_orders : 0) },
      ],
    },
    spend: {
      title: 'Meta Spend Over Time',
      subtitle: isHourly ? 'Hourly ad spend (distributed)' : 'Daily Meta Ads spend',
      currentKey: 'spend',
      previousKey: 'prev_spend',
      currentName: 'Meta Spend',
      currentColor: '#6c63ff',
      valueType: 'currency',
      statItems: [
        { label: 'Total Spend', value: loading ? '...' : fmt(ov?.total_spend), sub: `${ov?.total_impressions?.toLocaleString('en-IN') || 0} impressions` },
        { label: isHourly ? 'Avg Hourly Spend' : 'Avg Daily Spend', value: loading ? '...' : fmt(ov?.avg_daily_spend) },
        { label: 'Avg CTR', value: loading ? '...' : `${(ov?.avg_ctr || 0).toFixed(2)}%` },
      ],
    },
    roas: {
      title: 'ROAS Over Time',
      subtitle: isHourly ? 'Hourly return on ad spend' : 'Daily revenue divided by Meta spend',
      currentKey: 'roas',
      previousKey: 'prev_roas',
      currentName: 'ROAS',
      currentColor: '#4cc9f0',
      valueType: 'mult',
      statItems: [
        { label: 'Overall ROAS', value: loading ? '...' : fmt(ov?.real_roas, 'mult') },
        { label: 'Revenue', value: loading ? '...' : fmt(ov?.shopify_revenue) },
        { label: 'Spend', value: loading ? '...' : fmt(ov?.total_spend) },
      ],
    },
    orders: {
      title: 'Orders Over Time',
      subtitle: isHourly ? 'Hourly order volume' : 'Daily Shopify orders',
      currentKey: 'orders',
      previousKey: 'prev_orders',
      currentName: 'Orders',
      currentColor: '#ffd166',
      valueType: 'number',
      statItems: [
        { label: 'Total Orders', value: loading ? '...' : fmt(ov?.shopify_orders, 'number') },
        { label: isHourly ? 'Avg Hourly Orders' : 'Avg Daily Orders', value: loading || !daily.length ? '...' : fmt((ov?.shopify_orders || 0) / Math.max(daily.length, 1), 'number') },
        { label: 'Units Sold', value: loading ? '...' : fmt(ov?.shopify_units, 'number') },
      ],
    },
    cpa: {
      title: 'CPA Over Time',
      subtitle: isHourly ? 'Hourly cost per order' : 'Daily Meta spend divided by Shopify orders',
      currentKey: 'cpa',
      previousKey: 'prev_cpa',
      currentName: 'CPA',
      currentColor: '#ff4d6d',
      valueType: 'currency',
      statItems: [
        { label: 'Overall CPA', value: loading ? '...' : fmt(cpa) },
        { label: 'Spend', value: loading ? '...' : fmt(ov?.total_spend) },
        { label: 'Orders', value: loading ? '...' : fmt(ov?.shopify_orders, 'number') },
      ],
    },
    cancelled_orders: {
      title: 'Cancelled Orders Over Time',
      subtitle: isHourly ? 'Hourly cancelled order volume' : 'Daily cancelled Shopify orders',
      currentKey: 'cancelled_orders',
      previousKey: 'prev_cancelled_orders',
      currentName: 'Cancelled Orders',
      currentColor: '#ff4d6d',
      valueType: 'number',
      statItems: [
        { label: 'Cancelled Orders', value: loading ? '...' : fmt(ov?.cancelled_orders, 'number') },
        { label: 'Cancel Rate', value: loading ? '...' : `${Number(ov?.cancel_rate || 0).toFixed(1)}%` },
        { label: 'Total Orders', value: loading ? '...' : fmt(ov?.shopify_orders, 'number') },
      ],
    },
  };
  const selectedMetricConfig = metricConfigs[selectedMetric];
  const avgOrderValue = ov?.avg_order_value ?? (ov?.shopify_orders > 0 ? ov.shopify_revenue / ov.shopify_orders : 0);
  const performanceMetricConfigs = {
    ctr: {
      label: 'CTR',
      value: ov?.avg_ctr,
      valueType: 'pct',
      change: ov?.changes?.avg_ctr,
      icon: '%',
      color: 'blue',
      title: 'CTR Over Time',
      subtitle: isHourly ? 'Hourly CTR signal from Meta Ads' : 'Daily click-through rate from Meta Ads',
      currentKey: 'ctr',
      previousKey: 'prev_ctr',
      currentName: 'CTR',
      currentColor: '#4cc9f0',
      statItems: [
        { label: 'Avg CTR', value: loading ? '...' : fmt(ov?.avg_ctr, 'pct') },
        { label: 'Clicks', value: loading ? '...' : fmt(ov?.total_clicks, 'number') },
        { label: 'Impressions', value: loading ? '...' : fmt(ov?.total_impressions, 'number') },
      ],
    },
    aov: {
      label: 'AOV',
      value: avgOrderValue,
      valueType: 'currency',
      change: ov?.changes?.avg_order_value,
      icon: 'A',
      color: 'green',
      title: 'AOV Over Time',
      subtitle: isHourly ? 'Hourly average order value' : 'Daily average order value',
      currentKey: 'aov',
      previousKey: 'prev_aov',
      currentName: 'AOV',
      currentColor: '#00d4a0',
      statItems: [
        { label: 'Avg Order Value', value: loading ? '...' : fmt(avgOrderValue) },
        { label: 'Revenue', value: loading ? '...' : fmt(ov?.shopify_revenue) },
        { label: 'Orders', value: loading ? '...' : fmt(ov?.shopify_orders, 'number') },
      ],
    },
    mer: {
      label: 'MER',
      value: ov?.mer ?? ov?.real_roas,
      valueType: 'mult',
      change: ov?.changes?.real_roas,
      icon: 'M',
      color: 'purple',
      title: 'MER Over Time',
      subtitle: isHourly ? 'Hourly revenue divided by Meta spend' : 'Daily revenue divided by Meta spend',
      currentKey: 'mer',
      previousKey: 'prev_mer',
      currentName: 'MER',
      currentColor: '#6c63ff',
      statItems: [
        { label: 'MER', value: loading ? '...' : fmt(ov?.mer ?? ov?.real_roas, 'mult') },
        { label: 'Revenue', value: loading ? '...' : fmt(ov?.shopify_revenue) },
        { label: 'Spend', value: loading ? '...' : fmt(ov?.total_spend) },
      ],
    },
    cpc: {
      label: 'CPC',
      value: ov?.avg_cpc,
      valueType: 'currency',
      change: ov?.changes?.avg_cpc,
      icon: 'C',
      color: 'yellow',
      title: 'CPC Over Time',
      subtitle: isHourly ? 'Hourly CPC signal from Meta Ads' : 'Daily cost per click from Meta Ads',
      currentKey: 'cpc',
      previousKey: 'prev_cpc',
      currentName: 'CPC',
      currentColor: '#ffd166',
      statItems: [
        { label: 'Avg CPC', value: loading ? '...' : fmt(ov?.avg_cpc) },
        { label: 'Spend', value: loading ? '...' : fmt(ov?.total_spend) },
        { label: 'Clicks', value: loading ? '...' : fmt(ov?.total_clicks, 'number') },
      ],
    },
    atc: {
      label: 'ATC',
      value: ov?.meta_add_to_cart,
      valueType: 'number',
      change: ov?.changes?.meta_add_to_cart,
      icon: '+',
      color: 'red',
      title: 'Add To Cart Over Time',
      subtitle: isHourly ? 'Hourly add-to-cart signal from Meta Ads' : 'Daily add-to-cart actions from Meta Ads',
      currentKey: 'atc',
      previousKey: 'prev_atc',
      currentName: 'Add To Cart',
      currentColor: '#ff4d6d',
      statItems: [
        { label: 'Add To Cart', value: loading ? '...' : fmt(ov?.meta_add_to_cart, 'number') },
        { label: 'Clicks', value: loading ? '...' : fmt(ov?.total_clicks, 'number') },
        { label: 'ATC Rate', value: loading ? '...' : `${((Number(ov?.meta_add_to_cart || 0) / Math.max(Number(ov?.total_clicks || 0), 1)) * 100).toFixed(2)}%` },
      ],
    },
  };
  const selectedPerformanceConfig = performanceMetricConfigs[selectedPerformanceMetric];
  const atcCount = Number(ov?.meta_add_to_cart || 0);
  const purchaseCount = Number(ov?.meta_purchases || 0);
  const purchaseDonutData = [
    { name: 'Add to Cart', value: atcCount },
    { name: 'Purchases', value: purchaseCount },
  ];
  const purchaseRate = atcCount > 0 ? (purchaseCount / atcCount) * 100 : 0;

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="Your store performance at a glance"
        dateRange={dateRange}
        onDateChange={handleDateChange}
        activePeriod={activePeriod}
        onPeriodChange={handlePeriodChange}
      />

      <div className="page-content">

        {/* ─── Stat Cards ─── */}
        <div className="stats-grid dashboard-stats-grid">
          <StatCard
            label="Total Revenue"
            value={loading ? null : ov?.shopify_revenue}
            valueType="currency"
            icon="💰"
            color="green"
            change={revenueChange}
            onClick={() => setSelectedMetric('revenue')}
            isActive={selectedMetric === 'revenue'}
          />
          <StatCard
            label="Total Meta Spend"
            value={loading ? null : ov?.total_spend}
            valueType="currency"
            icon="📡"
            color="purple"
            change={spendChange}
            onClick={() => setSelectedMetric('spend')}
            isActive={selectedMetric === 'spend'}
          />
          <StatCard
            label="Overall ROAS"
            value={loading ? null : ov?.real_roas}
            valueType="mult"
            icon="📈"
            color="blue"
            change={roasChange}
            onClick={() => setSelectedMetric('roas')}
            isActive={selectedMetric === 'roas'}
          />
          <StatCard
            label="Total Orders"
            value={loading ? null : ov?.shopify_orders}
            valueType="number"
            icon="📦"
            color="yellow"
            change={ordersChange}
            onClick={() => setSelectedMetric('orders')}
            isActive={selectedMetric === 'orders'}
          />
          <StatCard
            label="Cancelled Orders"
            value={loading ? null : ov?.cancelled_orders}
            valueType="number"
            icon="X"
            color="red"
            change={cancelledOrdersChange}
            helperText={`${Number(ov?.cancel_rate || 0).toFixed(1)}% cancel rate`}
            onClick={() => setSelectedMetric('cancelled_orders')}
            isActive={selectedMetric === 'cancelled_orders'}
          />
          <StatCard
            label="CPA"
            value={loading ? null : cpa}
            valueType="currency"
            icon="C"
            color="red"
            change={cpoChange}
            onClick={() => setSelectedMetric('cpa')}
            isActive={selectedMetric === 'cpa'}
          />
        </div>

        {/* ─── Charts ─── */}
        <div className="charts-row mt-6">
          {/* Dynamic KPI Chart */}
          <LineChart
            title={selectedMetricConfig.title}
            subtitle={selectedMetricConfig.subtitle}
            data={chartData}
            currentKey={selectedMetricConfig.currentKey}
            previousKey={selectedMetricConfig.previousKey}
            currentName={selectedMetricConfig.currentName}
            previousName="Prev Period"
            currentColor={selectedMetricConfig.currentColor}
            previousColor="#334455"
            valueType={selectedMetricConfig.valueType}
            loading={loading}
            statItems={selectedMetricConfig.statItems}
          />

          {/* Revenue vs Spend Chart */}
          <LineChart
            title="Revenue vs Meta Spend"
            subtitle={isHourly ? "Cumulative revenue and spend through the day" : "Daily Shopify revenue compared with Meta Ads spend"}
            data={revenueSpendChartData}
            currentKey="revenue"
            secondaryKey="spend"
            currentName="Revenue"
            secondaryName="Meta Spend"
            currentColor="#00d4a0"
            secondaryColor="#6c63ff"
            valueType="currency"
            loading={loading}
            forceHourlyXAxis={isHourly}
            statItems={[
              {
                label: 'Total Revenue',
                value: loading ? '...' : fmt(ov?.shopify_revenue),
                sub: `${ov?.shopify_orders?.toLocaleString('en-IN') || 0} orders`,
              },
              {
                label: 'Total Spend',
                value: loading ? '...' : fmt(ov?.total_spend),
                sub: `${ov?.total_impressions?.toLocaleString('en-IN') || 0} impressions`,
              },
              {
                label: 'ROAS',
                value: loading ? '...' : fmt(ov?.real_roas, 'mult'),
              },
            ]}
          />
        </div>

        {/* ─── Bottom Row ─── */}
        <div className="dashboard-performance-section mt-6">
          <div className="stats-grid dashboard-stats-grid dashboard-performance-grid">
            {Object.entries(performanceMetricConfigs).map(([key, config]) => (
              <StatCard
                key={key}
                label={config.label}
                value={loading ? null : config.value}
                valueType={config.valueType}
                icon={config.icon}
                color={config.color}
                change={config.change}
                onClick={() => setSelectedPerformanceMetric(key)}
                isActive={selectedPerformanceMetric === key}
              />
            ))}
          </div>

          <div className="dashboard-performance-layout mt-4">
            <div className="dashboard-performance-chart">
              <LineChart
                title={selectedPerformanceConfig.title}
                subtitle={selectedPerformanceConfig.subtitle}
                data={chartData}
                currentKey={selectedPerformanceConfig.currentKey}
                previousKey={selectedPerformanceConfig.previousKey}
                currentName={selectedPerformanceConfig.currentName}
                previousName="Prev Period"
                currentColor={selectedPerformanceConfig.currentColor}
                previousColor="#334455"
                valueType={selectedPerformanceConfig.valueType}
                loading={loading}
                forceHourlyXAxis={isHourly}
                statItems={selectedPerformanceConfig.statItems}
              />
            </div>

            <div className="chart-card dashboard-purchase-card">
              <div className="chart-header">
                <div>
                  <div className="chart-title">Purchases vs Add to Cart</div>
                  <div className="chart-subtitle">Meta funnel volume for selected period</div>
                </div>
              </div>

              <div className="purchase-donut-wrap">
                {loading ? (
                  <div className="skeleton purchase-donut-skeleton" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={purchaseDonutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="58%"
                        outerRadius="82%"
                        paddingAngle={2}
                        stroke="var(--bg-card)"
                        strokeWidth={3}
                      >
                        <Cell fill="#4cc9f0" />
                        <Cell fill="#ffd166" />
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [Number(value || 0).toLocaleString('en-IN'), name]}
                        contentStyle={{
                          backgroundColor: 'var(--bg-card)',
                          border: '1px solid var(--border-light)',
                          borderRadius: 10,
                          color: 'var(--text-primary)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div className="purchase-donut-center">
                  <strong>{purchaseRate.toFixed(1)}%</strong>
                  <span>ATC to purchase</span>
                </div>
              </div>

              <div className="purchase-donut-stats">
                <div>
                  <span className="purchase-dot atc" />
                  <p>Add to Cart</p>
                  <strong>{loading ? '...' : atcCount.toLocaleString('en-IN')}</strong>
                </div>
                <div>
                  <span className="purchase-dot purchases" />
                  <p>Purchases</p>
                  <strong>{loading ? '...' : purchaseCount.toLocaleString('en-IN')}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bottom-row dashboard-bottom-row mt-4">
          <TopProducts products={products} loading={loading} />
          <SyncLog logs={syncLogs} />
        </div>

      </div>
    </>
  );
}
