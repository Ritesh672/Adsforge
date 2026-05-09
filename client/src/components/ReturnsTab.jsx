import React, { useState, useEffect } from 'react';
import { getReturns } from '../api';
import { fmt } from './StatCard';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const ReturnsTab = ({ dateRange, period }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const params = period === 'custom' ? dateRange : { period };
      try {
        const res = await getReturns(params);
        setData(res.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateRange, period]);

  const stats = data?.stats || {};
  const products = data?.top_returned_products || [];

  return (
    <div className="returns-tab">
      <div className="stats-grid mt-6">
        <div className="card p-6">
          <span className="text-small" style={{ color: 'var(--text-secondary)' }}>Overall Return Rate</span>
          <div className="flex items-center gap-2 mt-1">
            <h2 style={{ fontSize: '28px' }}>{stats.overall_rate?.toFixed(2)}%</h2>
            <span className="badge-down">Critical</span>
          </div>
        </div>
        <div className="card p-6">
          <span className="text-small" style={{ color: 'var(--text-secondary)' }}>Total Returned Items</span>
          <h2 style={{ fontSize: '28px', marginTop: '4px' }}>{stats.total_returns}</h2>
        </div>
        <div className="card p-6">
          <span className="text-small" style={{ color: 'var(--text-secondary)' }}>Revenue Impact (RTO)</span>
          <h2 style={{ fontSize: '28px', marginTop: '4px', color: 'var(--red)' }}>{fmt(stats.revenue_lost)}</h2>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mt-6">
        <div className="card p-6">
          <h3 className="card-title">Top 10 Returned Products</h3>
          <p className="card-subtitle">Products with highest return volume</p>
          <div className="mt-6" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={products} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="title" 
                  type="category" 
                  tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} 
                  width={120}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px' }}
                />
                <Bar dataKey="return_count" name="Returns" fill="var(--red)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="card-title">Return Rate Breakdown</h3>
          <p className="card-subtitle">Performance by product individual rates</p>
          <div className="data-table-container mt-4">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Rate</th>
                  <th>Units</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => <tr key={i}><td colSpan="3">...</td></tr>)
                ) : (
                  products.slice(0, 5).map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontSize: '12px' }}>{p.title}</td>
                      <td>
                        <span style={{ color: p.return_rate > 20 ? 'var(--red)' : 'var(--yellow)' }}>
                          {p.return_rate.toFixed(1)}%
                        </span>
                      </td>
                      <td>{p.return_count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReturnsTab;
