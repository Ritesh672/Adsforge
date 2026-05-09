import { fmt } from './StatCard';

export default function TopProducts({ products = [], loading = false }) {
  const maxRev = Math.max(...products.map(p => p.total_revenue || 0), 1);

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="flex items-center justify-between">
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Top Selling Products</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Ranked by revenue in selected period</div>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Revenue</span>
      </div>

      <div className="top-products-list">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 52, borderRadius: 10 }} />
          ))
        ) : products.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <span>No product data for this period</span>
          </div>
        ) : (
          products.slice(0, 5).map((p, i) => {
            const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
            const pct = ((p.total_revenue || 0) / maxRev) * 100;
            return (
              <div className="top-product-item" key={p.id || i}>
                <div className={`product-rank ${rankClass}`}>#{i + 1}</div>
                <div className="product-info">
                  <div className="product-name">{p.title}</div>
                  <div className="product-meta">
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.total_units?.toLocaleString('en-IN') || 0}</span> units · 
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}> {p.order_count?.toLocaleString('en-IN') || 0}</span> orders
                  </div>
                </div>
                <div className="product-bar-wrap">
                  <div className="product-bar" style={{ width: `${pct}%` }} />
                </div>
                <div className="product-revenue">{fmt(p.total_revenue)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
