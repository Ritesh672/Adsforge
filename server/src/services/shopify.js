const axios = require('axios');

const SHOP = process.env.SHOP;
const TOKEN = process.env.TOKEN;
const API_VERSION = '2024-01';

const getISTTime = () => {
  return new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }) + ' IST';
};

const log = (msg) => {
  process.stdout.write(`[${getISTTime()}] [Shopify REST] ${msg}\n`);
};

const shopifyClient = axios.create({
  baseURL: `https://${SHOP}/admin/api/${API_VERSION}`,
  headers: {
    'X-Shopify-Access-Token': TOKEN,
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getNextPageUrl(linkHeader) {
  if (!linkHeader) return null;

  const links = linkHeader.split(',');
  const nextLink = links.find(link => link.includes('rel="next"'));
  if (!nextLink) return null;

  const match = nextLink.match(/<([^>]+)>/);
  return match ? match[1] : null;
}

async function requestWithRetry(url, retries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await shopifyClient.get(url);
    } catch (error) {
      lastError = error;

      if (error.response?.status === 401) {
        throw new Error('Unauthorized: Please check your Shopify token in .env');
      }

      const isRetryable =
        error.response?.status === 429 ||
        error.response?.status >= 500 ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        String(error.message || '').toLowerCase().includes('timeout');

      if (!isRetryable || attempt === retries) break;

      const retryAfter = Number(error.response?.headers?.['retry-after']);
      const waitMs = retryAfter ? retryAfter * 1000 : 500 * attempt;
      log(`Retrying Shopify request after ${waitMs}ms: ${error.message}`);
      await delay(waitMs);
    }
  }

  throw lastError;
}

async function fetchWithPagination(initialUrl, resourceKey) {
  let url = initialUrl;
  const records = [];

  while (url) {
    const response = await requestWithRetry(url);
    const batch = response.data?.[resourceKey] || [];
    records.push(...batch);
    log(`Received ${batch.length} ${resourceKey} (Total: ${records.length})`);

    url = getNextPageUrl(response.headers.link);
    if (url) {
      const parsed = new URL(url);
      url = `${parsed.pathname}${parsed.search}`.replace(`/admin/api/${API_VERSION}`, '');
      await delay(250);
    }
  }

  return records;
}

const fetchAllProducts = async () => {
  log('Fetching products...');
  return fetchWithPagination('/products.json?limit=250', 'products');
};

const fetchAllOrders = async (daysBack = 365, sinceDate = null) => {
  let createdAtMin;

  if (sinceDate) {
    createdAtMin = new Date(sinceDate).toISOString();
  } else {
    const date = new Date();
    date.setDate(date.getDate() - daysBack);
    createdAtMin = date.toISOString();
  }

  log(`Fetching orders since ${createdAtMin}...`);
  const params = new URLSearchParams({
    status: 'any',
    limit: '250',
    created_at_min: createdAtMin,
    order: 'created_at asc'
  });

  return fetchWithPagination(`/orders.json?${params.toString()}`, 'orders');
};

const fetchAllRefunds = async (orderId) => {
  log(`Fetching refunds for order ${orderId}...`);
  const response = await requestWithRetry(`/orders/${orderId}/refunds.json`);
  return response.data?.refunds || [];
};

module.exports = {
  fetchAllProducts,
  fetchAllOrders,
  fetchAllRefunds
};
