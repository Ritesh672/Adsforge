// Central API configuration and helper functions

const BASE_URL = '/api';

const api = {
  get: async (path, params = {}) => {
    const query = new URLSearchParams(params).toString();
    const url = `${BASE_URL}${path}${query ? `?${query}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API Error ${res.status}: ${await res.text()}`);
    return res.json();
  },
  post: async (path, body = {}) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    return res.json();
  },
};

// Meta
export const getMetaOverview = (params) => api.get('/meta/overview', params);
export const getMetaDaily    = (params) => api.get('/meta/daily', params);
export const triggerMetaSync = ()       => api.post('/meta/sync');

// Shopify
export const triggerShopifySync = () => api.post('/sync/incremental');
export const triggerShopifyBackfill = () => api.post('/sync/backfill');
export const triggerUnifiedSync = () => api.post('/sync/all');

// Products
export const getTopProducts = (params) => api.get('/products', params);
export const getProductOverview = (params) => api.get('/analytics-overview', params);
export const getDeadVariants = (params) => api.get('/insights/dead-variants', params);
export const getTopPerformers = (params) => api.get('/insights/top-performers', params);
export const getSizeIntelligence = (params) => api.get('/insights/size-intelligence', params);
export const getReturns = (params) => api.get('/insights/returns', params);
export const getBoughtTogether = (params) => api.get('/portfolio/bought-together', params);
export const getPareto = (params) => api.get('/portfolio/pareto', params);
