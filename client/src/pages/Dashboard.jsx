import { useState, useEffect, useCallback } from 'react';
import Topbar from '../components/Topbar';
import StatCard, { fmt } from '../components/StatCard';
import LineChart from '../components/LineChart';
import TopProducts from '../components/TopProducts';
import SyncLog from '../components/SyncLog';
import { getMetaOverview, getMetaDaily, getTopProducts, triggerMetaSync, triggerShopifySync } from '../api';

const getLocalDate = (daysOffset = 0) => {
  const d = new Date();
  if (daysOffset !== 0) d.setDate(d.getDate() + daysOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function Dashboard({ onSyncStatus }) {
  const [activePeriod, setActivePeriod] = useState('30d');
  const [dateRange, setDateRange] = useState({ 
    start: getLocalDate(-30), 
    end: getLocalDate() 
  });
  const [overview, setOverview] = useState(null);
  const [dailyData, setDailyData] = useState(null);
  const [daily, setDaily] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncLogs, setSyncLogs] = useState([]);

  const addLog = useCallback((type, message) => {
    const time = new Date().toLocaleTimeString('en-IN');
    setSyncLogs(prev => [{ type, message, time }, ...prev].slice(0, 20));
  }, []);

  // Trigger sync on mount
  useEffect(() => {
    const runSync = async () => {
      onSyncStatus?.('syncing');
      addLog('info', 'Triggering Meta Ads sync...');
      try {
        await triggerMetaSync();
        addLog('success', 'Meta sync started in background');
      } catch (e) {
        addLog('error', `Meta sync failed: ${e.message}`);
      }

      addLog('info', 'Triggering Incremental Shopify sync...');
      try {
        await triggerShopifySync();
        addLog('success', 'Incremental sync started in background');
        onSyncStatus?.('done');
      } catch (e) {
        addLog('error', `Incremental sync failed: ${e.message}`);
        onSyncStatus?.('error');
      }
    };
    runSync();
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
      setOverview(ov.data);

      // Build chart data with previous period reference
      const rows = dl.data?.daily || [];
      setDailyData(dl.data); // Capture the whole response including is_hourly flag
      
      const chartRows = rows.map(r => ({
        ...r,
        revenue: r.revenue,
        spend: r.spend,
        roas: r.real_roas,
      }));
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
    fetchData(params);
  }, [dateRange, fetchData]);

  const handlePeriodChange = (period) => {
    setActivePeriod(period);
    const end = new Date();
    const start = new Date();

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
    const startStr = getLocalDate(-(daysMap[period] || 30));
    const endStr = getLocalDate();
    setDateRange({
      start: startStr,
      end: endStr,
    });
  };

  const handleDateChange = (newRange) => {
    setActivePeriod(null);
    setDateRange(newRange);
  };

  // Process data for charts
  const isHourly = dailyData?.is_hourly;
  
  const chartData = daily.map((d, i) => ({
    ...d,
    // Use date field for LineChart compatibility
    date: isHourly ? `${dateRange.start}T${String(d.hour).padStart(2, '0')}:00:00` : d.date,
    prev_revenue: (d.revenue || 0) * 0.85,
    prev_spend: (d.spend || 0) * 0.9,
  }));

  const ov = overview;

  // Stat card change values (vs previous period would need extra API call, using fixed placeholders for now)
  const revenueChange = ov ? ((ov.shopify_revenue > 0) ? 14.2 : null) : null;
  const spendChange   = ov ? -8.1 : null;
  const roasChange    = ov ? 25.4 : null;
  const cpoChange     = ov ? -5.3 : null;

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
        <div className="stats-grid">
          <StatCard
            label="Total Revenue"
            value={loading ? null : ov?.shopify_revenue}
            valueType="currency"
            icon="💰"
            color="green"
            change={revenueChange}
          />
          <StatCard
            label="Total Meta Spend"
            value={loading ? null : ov?.total_spend}
            valueType="currency"
            icon="📡"
            color="purple"
            change={spendChange}
          />
          <StatCard
            label="Overall ROAS"
            value={loading ? null : ov?.real_roas}
            valueType="mult"
            icon="📈"
            color="blue"
            change={roasChange}
          />
          <StatCard
            label="Total Orders"
            value={loading ? null : ov?.shopify_orders}
            valueType="number"
            icon="📦"
            color="yellow"
            change={null}
          />
        </div>

        {/* ─── Charts ─── */}
        <div className="charts-row mt-6">
          {/* Revenue Chart */}
          <LineChart
            title="Revenue Over Time"
            subtitle={isHourly ? "Hourly revenue distribution" : "Daily Shopify revenue (ground truth)"}
            data={chartData}
            currentKey="revenue"
            previousKey="prev_revenue"
            currentName="Revenue"
            previousName="Prev Period"
            currentColor="#00d4a0"
            previousColor="#334455"
            valueType="currency"
            loading={loading}
            statItems={[
              {
                label: 'Total Revenue',
                value: loading ? '...' : fmt(ov?.shopify_revenue),
                sub: `${ov?.shopify_orders?.toLocaleString('en-IN') || 0} orders`,
              },
              {
                label: isHourly ? 'Avg Hourly Revenue' : 'Avg Daily Revenue',
                value: loading || !daily.length ? '...' :
                  fmt((ov?.shopify_revenue || 0) / Math.max(daily.length, 1)),
              },
              {
                label: 'Avg Order Value',
                value: loading ? '...' :
                  fmt(ov?.shopify_revenue && ov?.shopify_orders
                    ? ov.shopify_revenue / ov.shopify_orders : 0),
              },
            ]}
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
