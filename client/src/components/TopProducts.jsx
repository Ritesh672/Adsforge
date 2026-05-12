import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { fmt } from './StatCard';

const SORT_OPTIONS = [
  { id: 'revenue', label: 'Revenue' },
  { id: 'units', label: 'Units Sold' },
  { id: 'orders', label: 'Orders' },
  { id: 'asp', label: 'ASP' },
];

const shortName = (title = '') => (
  title.length > 72 ? `${title.slice(0, 69)}...` : title
);

const getRankClass = (index) => (
  index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'rank-other'
);

export default function TopProducts({ products = [], loading = false }) {
  const [sortBy, setSortBy] = useState('revenue');

  const rankedProducts = useMemo(() => {
    const getAsp = (product) => Number(product.total_revenue || 0) / Math.max(Number(product.total_units || 0), 1);
    const sortValue = {
      revenue: (product) => Number(product.total_revenue || 0),
      units: (product) => Number(product.total_units || 0),
      orders: (product) => Number(product.order_count || 0),
      asp: getAsp,
    }[sortBy];

    return [...products].sort((a, b) => sortValue(b) - sortValue(a)).slice(0, 5);
  }, [products, sortBy]);

  const totalRevenue = products.reduce((sum, product) => sum + Number(product.total_revenue || 0), 0);
  const selectedSortLabel = SORT_OPTIONS.find((option) => option.id === sortBy)?.label || 'Revenue';

  return (
    <div className="card top-products-card">
      <div className="top-products-header">
        <div>
          <h3>Top Selling Products</h3>
          <p>Ranked by {selectedSortLabel.toLowerCase()} in selected period</p>
        </div>

        <label className="top-products-sort">
          <span>Sort</span>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="top-products-ranked-list">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="skeleton top-product-row-skeleton" />
          ))
        ) : rankedProducts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <span>No product data for this period</span>
          </div>
        ) : (
          rankedProducts.map((product, index) => {
            const revenue = Number(product.total_revenue || 0);
            const units = Number(product.total_units || 0);
            const orders = Number(product.order_count || 0);
            const asp = revenue / Math.max(units, 1);
            const revenueShare = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;

            return (
              <div className="top-product-row" key={product.id || product.shopify_product_id || index}>
                <div className={`top-product-rank ${getRankClass(index)}`}>#{index + 1}</div>

                <div className="top-product-image-wrap">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.title} />
                  ) : (
                    <div className="top-product-image-fallback">P</div>
                  )}
                </div>

                <div className="top-product-title-block">
                  <h4 title={product.title}>{shortName(product.title)}</h4>
                  {index === 0 && (
                    <span className="best-seller-badge">★ Best Seller</span>
                  )}
                </div>

                <div className="top-product-metric revenue">
                  <span>Revenue</span>
                  <strong>{fmt(revenue)}</strong>
                </div>

                <div className="top-product-metric">
                  <span>Units Sold</span>
                  <strong>{units.toLocaleString('en-IN')}</strong>
                </div>

                <div className="top-product-metric">
                  <span>Orders</span>
                  <strong>{orders.toLocaleString('en-IN')}</strong>
                </div>

                <div className="top-product-metric">
                  <span>ASP</span>
                  <strong>{fmt(asp)}</strong>
                </div>

                <div className="top-product-share">
                  <span>Revenue Share</span>
                  <strong>{revenueShare.toFixed(1)}%</strong>
                  <div className="top-product-share-track">
                    <div style={{ width: `${Math.min(revenueShare, 100)}%` }} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="top-products-footer">
        <Link to="/products" className="view-products-link">
          View all products <span>→</span>
        </Link>
      </div>
    </div>
  );
}
