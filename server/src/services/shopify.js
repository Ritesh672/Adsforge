const axios = require('axios');

const SHOP = process.env.SHOP;
const TOKEN = process.env.TOKEN;
const API_VERSION = '2024-01';
const BASE_URL = `https://${SHOP}/admin/api/${API_VERSION}`;

const shopifyClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-Shopify-Access-Token': TOKEN,
    'Content-Type': 'application/json',
  },
});

// Rate limit interceptor
shopifyClient.interceptors.response.use(
  response => response,
  async error => {
    const { config, response } = error;
    if (response && response.status === 429) {
      const retryAfter = parseInt(response.headers['retry-after'] || '2') * 1000;
      console.log(`⚠️ Shopify Rate Limit hit. Waiting ${retryAfter}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter));
      return shopifyClient(config);
    }
    return Promise.reject(error);
  }
);

async function fetchWithPagination(url) {
  let allData = [];
  let nextUrl = url;

  while (nextUrl) {
    console.log(`Fetching page: ${nextUrl}`);
    const response = await shopifyClient.get(nextUrl);
    
    const dataKey = Object.keys(response.data)[0];
    const pageData = response.data[dataKey];
    allData = allData.concat(pageData);
    console.log(`Got ${pageData.length} records, total so far: ${allData.length}`);

    const linkHeader = response.headers['link'];
    nextUrl = null;

    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (match) {
        const fullUrl = match[1];
        const parts = fullUrl.split(`/admin/api/${API_VERSION}`);
        if (parts[1]) {
          nextUrl = parts[1];
        }
      }
    }
  }

  return allData;
}

const fetchAllProducts = async () => {
  console.log('Fetching all products from Shopify...');
  return await fetchWithPagination('/products.json?limit=250');
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
  
  console.log(`Fetching orders since ${createdAtMin} (Oldest First)...`);
  return await fetchWithPagination(`/orders.json?status=any&limit=250&created_at_min=${createdAtMin}&order=created_at+asc`);
};

const fetchAllRefunds = async (orderId, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await shopifyClient.get(`/orders/${orderId}/refunds.json`);
      return response.data.refunds;
    } catch (err) {
      if (i === retries - 1) {
        console.error(`✗ All ${retries} attempts failed for order ${orderId}`);
        throw err;
      }
      console.log(`Retrying order ${orderId}, attempt ${i + 1}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
};

module.exports = {
  fetchAllProducts,
  fetchAllOrders,
  fetchAllRefunds
};
