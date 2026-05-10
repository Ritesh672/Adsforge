import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTopProducts } from '../api';
import { fmt } from './StatCard';

const sortOptions = [
  { value: 'revenue', label: 'Top Revenue' },
  { value: 'units', label: 'Most Units Sold' },
  { value: 'growth', label: 'Highest Growth' },
  { value: 'lowest_growth', label: 'Lowest Growth' },
];

const productKey = (product) => product.id ?? product.product_id;

const imageFallback =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="760" viewBox="0 0 640 760"><rect width="640" height="760" fill="%23111118"/><rect x="130" y="150" width="380" height="460" rx="42" fill="%231c1c28"/><circle cx="320" cy="314" r="76" fill="%232a2a3e"/><path d="M206 560c33-82 89-124 169-124s136 42 169 124" fill="%232a2a3e"/><path d="M0 0h640v760H0z" fill="none" stroke="%236c63ff" stroke-opacity=".24" stroke-width="4"/></svg>';

const normalizeProduct = (product) => {
  const id = productKey(product);
  return {
    id,
    title: product.title || 'Untitled product',
    vendor: product.vendor || 'Unknown vendor',
    status: product.status || 'active',
    image: product.image_url || product.product_image || imageFallback,
    revenue: Number(product.total_revenue ?? product.period_revenue ?? 0),
    units: Number(product.total_units ?? product.period_units ?? 0),
    orders: Number(product.order_count ?? 0),
    returns: Number(product.return_count ?? 0),
    growth: Number(product.mom_revenue_change_pct ?? product.vs_previous_period_pct ?? 0),
  };
};

const GrowthBadge = ({ value, compact = false }) => {
  const isPositive = value >= 0;
  const arrow = isPositive ? '↑' : '↓';

  return (
    <span className={`growth-pill ${isPositive ? 'positive' : 'negative'} ${compact ? 'compact' : ''}`}>
      <span>{arrow}</span>
      {Math.abs(value).toFixed(1)}%
    </span>
  );
};

const ProductImage = ({ src, title }) => (
  <div className="product-browser-image-wrap">
    <img
      src={src || imageFallback}
      alt={title}
      className="product-browser-image"
      loading="lazy"
      onError={(event) => {
        event.currentTarget.src = imageFallback;
      }}
    />
  </div>
);

const TopPerformerCard = ({ product, rank, onOpen }) => (
  <button className="top-performer-card" type="button" onClick={() => onOpen(product.id)}>
    <span className={`top-rank-badge rank-${Math.min(rank, 5)}`}>{rank}</span>
    <ProductImage src={product.image} title={product.title} />
    <div className="top-performer-body">
      <div>
        <h3>{product.title}</h3>
        <p>{product.vendor}</p>
      </div>
      <div className="top-performer-metrics">
        <div>
          <span>Revenue</span>
          <strong>{fmt(product.revenue)}</strong>
        </div>
        <div>
          <span>Units Sold</span>
          <strong>{product.units.toLocaleString('en-IN')}</strong>
        </div>
      </div>
      <GrowthBadge value={product.growth} compact />
    </div>
  </button>
);

const ProductExplorerCard = ({ product, onOpen }) => (
  <button className="product-explorer-card" type="button" onClick={() => onOpen(product.id)}>
    <div className="product-explorer-media">
      <ProductImage src={product.image} title={product.title} />
      <span className="product-status-badge">{product.status}</span>
    </div>
    <div className="product-explorer-content">
      <div className="product-explorer-heading">
        <h3>{product.title}</h3>
        <p>{product.vendor}</p>
      </div>
      <div className="product-metric-grid">
        <div>
          <span>Revenue</span>
          <strong>{fmt(product.revenue)}</strong>
        </div>
        <div>
          <span>Units Sold</span>
          <strong>{product.units.toLocaleString('en-IN')}</strong>
        </div>
        <div>
          <span>Orders</span>
          <strong>{product.orders.toLocaleString('en-IN')}</strong>
        </div>
        <div>
          <span>Cancelled</span>
          <strong>{product.returns.toLocaleString('en-IN')}</strong>
        </div>
      </div>
      <div className="product-growth-row">
        <GrowthBadge value={product.growth} />
        <span>vs previous period</span>
      </div>
    </div>
  </button>
);

const ProductCardSkeleton = () => (
  <div className="product-explorer-card skeleton-card">
    <div className="skeleton product-skeleton-image" />
    <div className="product-explorer-content">
      <div className="skeleton" style={{ height: 18, width: '78%' }} />
      <div className="skeleton" style={{ height: 12, width: '34%', marginTop: 8 }} />
      <div className="product-metric-grid">
        {[...Array(4)].map((_, index) => (
          <div key={index}>
            <div className="skeleton" style={{ height: 10, width: 52 }} />
            <div className="skeleton" style={{ height: 16, width: 72, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default function ProductInsightsTab({ dateRange, period }) {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState('revenue');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const refreshAfterSync = () => setReloadKey((value) => value + 1);

    window.addEventListener('adforge:sync-complete', refreshAfterSync);
    return () => window.removeEventListener('adforge:sync-complete', refreshAfterSync);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchProducts = async () => {
      setLoading(true);
      const rangeParams = period === 'custom'
        ? { start_date: dateRange.start, end_date: dateRange.end }
        : { period };

      try {
        const productsResult = await getTopProducts({ ...rangeParams, sort: 'revenue', limit: 48 });

        if (cancelled) return;

        const normalized = (productsResult.data || []).map((product) => normalizeProduct(product));

        setProducts(normalized);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setProducts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProducts();

    return () => {
      cancelled = true;
    };
  }, [dateRange, period, reloadKey]);

  const sortedProducts = useMemo(() => {
    const sorted = [...products];

    if (sortBy === 'units') sorted.sort((a, b) => b.units - a.units);
    else if (sortBy === 'growth') sorted.sort((a, b) => b.growth - a.growth);
    else if (sortBy === 'lowest_growth') sorted.sort((a, b) => a.growth - b.growth);
    else sorted.sort((a, b) => b.revenue - a.revenue);

    return sorted;
  }, [products, sortBy]);

  const topPerformers = useMemo(() => sortedProducts.slice(0, 4), [sortedProducts]);

  const openProduct = (id) => {
    if (id) navigate(`/products/${id}`);
  };

  return (
    <div className="product-browser">
      <section className="product-browser-section top-products-showcase">
        <div className="product-section-header">
          <div>
            <span className="section-kicker">Performance ranking</span>
            <h2>Top Performing Products</h2>
            <p>Your best ecommerce products in this period</p>
          </div>
          <span className="product-count-label">{loading ? 'Loading' : `${topPerformers.length} highlighted`}</span>
        </div>

        <div className="top-performer-scroll">
          {loading
            ? [...Array(4)].map((_, index) => <ProductCardSkeleton key={index} />)
            : topPerformers.map((product, index) => (
                <TopPerformerCard
                  key={product.id || product.title}
                  product={product}
                  rank={index + 1}
                  onOpen={openProduct}
                />
              ))}
        </div>
      </section>

      <section className="product-browser-section all-products-section">
        <div className="product-section-header products-grid-header">
          <div>
            <span className="section-kicker">Catalog explorer</span>
            <h2>All Products Grid</h2>
            <p>Browse all products ranked by revenue, volume, and growth momentum</p>
          </div>
          <label className="product-sort-control">
            <span>Sort by</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="product-explorer-grid">
          {loading
            ? [...Array(8)].map((_, index) => <ProductCardSkeleton key={index} />)
            : sortedProducts.map((product) => (
                <ProductExplorerCard key={product.id || product.title} product={product} onOpen={openProduct} />
              ))}
        </div>

        {!loading && sortedProducts.length === 0 && (
          <div className="empty-state product-empty-state">
            <div className="empty-state-icon">No products</div>
            <p>No product performance data is available for this period.</p>
          </div>
        )}
      </section>
    </div>
  );
}
