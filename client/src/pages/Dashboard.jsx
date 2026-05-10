import { useState, useEffect, useCallback } from 'react';
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
          prev_revenue: prev.revenue || 0,
          prev_spend: prevSpend,
          prev_roas: prev.real_roas || 0,
          prev_orders: prev.orders || 0,
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

  const ov = overview;
  const cpa = ov?.cost_per_order ?? (ov?.shopify_orders > 0 ? ov.total_spend / ov.shopify_orders : 0);

  const revenueChange = ov?.changes?.shopify_revenue ?? null;
  const spendChange = ov?.changes?.total_spend ?? null;
  const roasChange = ov?.changes?.real_roas ?? null;
  const ordersChange = ov?.changes?.shopify_orders ?? null;
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
  };
  const selectedMetricConfig = metricConfigs[selectedMetric];

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

          {/* Spend Chart */}
          <LineChart
            title="Ad Spend Over Time"
            subtitle={isHourly ? "Hourly ad spend (distributed)" : "Daily Meta Ads spend"}
            data={chartData}
            currentKey="spend"
            previousKey="prev_spend"
            currentName="Meta Spend"
            previousName="Prev Period"
            currentColor="#6c63ff"
            previousColor="#334455"
            valueType="currency"
            loading={loading}
            statItems={[
              {
                label: 'Total Spend',
                value: loading ? '...' : fmt(ov?.total_spend),
                sub: `${ov?.total_impressions?.toLocaleString('en-IN') || 0} impressions`,
              },
              {
                label: isHourly ? 'Avg Hourly Spend' : 'Avg Daily Spend',
                value: loading ? '...' : fmt(ov?.avg_daily_spend),
              },
              {
                label: 'Avg CTR',
                value: loading ? '...' : `${(ov?.avg_ctr || 0).toFixed(2)}%`,
              },
            ]}
          />
        </div>

        {/* ─── Bottom Row ─── */}
        <div className="bottom-row mt-4">
          <TopProducts products={products} loading={loading} />
          <SyncLog logs={syncLogs} />
        </div>

      </div>
    </>
  );
}
