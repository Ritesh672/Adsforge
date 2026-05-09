const axios = require('axios');

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const BASE_URL = 'https://graph.facebook.com/v19.0';

/**
 * Fetch account-level daily insights from Meta
 */
const fetchAccountDailyInsights = async (startDate, endDate) => {
  let allData = [];
  let nextUrl = `/${META_AD_ACCOUNT_ID}/insights`;

  const params = {
    access_token: META_ACCESS_TOKEN,
    fields: 'spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values',
    time_increment: 1,
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    level: 'account',
    limit: 500
  };

  try {
    let currentUrl = nextUrl;
    let isFirstPage = true;

    while (currentUrl) {
      const response = await axios.get(`${BASE_URL}${currentUrl}`, isFirstPage ? { params } : { params: { access_token: META_ACCESS_TOKEN } });
      
      const data = response.data.data.map(item => {
        let meta_purchases = 0;
        let meta_purchase_value = 0;
        let meta_add_to_cart = 0;
        let meta_initiate_checkout = 0;

        if (item.actions) {
          const purchaseAction = item.actions.find(a => a.action_type === 'purchase');
          if (purchaseAction) meta_purchases = parseInt(purchaseAction.value);

          const atcAction = item.actions.find(a => a.action_type === 'add_to_cart');
          if (atcAction) meta_add_to_cart = parseInt(atcAction.value);

          const icAction = item.actions.find(a => a.action_type === 'initiate_checkout');
          if (icAction) meta_initiate_checkout = parseInt(icAction.value);
        }

        if (item.action_values) {
          const valueAction = item.action_values.find(a => a.action_type === 'purchase');
          if (valueAction) meta_purchase_value = parseFloat(valueAction.value);
        }

        return {
          date: item.date_start,
          total_ad_spend: parseFloat(item.spend || 0),
          impressions: parseInt(item.impressions || 0),
          clicks: parseInt(item.clicks || 0),
          ctr: parseFloat(item.ctr || 0),
          cpc: parseFloat(item.cpc || 0),
          cpm: parseFloat(item.cpm || 0),
          reach: parseInt(item.reach || 0),
          frequency: parseFloat(item.frequency || 0),
          meta_purchases,
          meta_purchase_value,
          meta_add_to_cart,
          meta_initiate_checkout
        };
      });

      allData = allData.concat(data);
      
      // Handle pagination
      if (response.data.paging && response.data.paging.next) {
        // Meta returns full URL in next, but axios already has BASE_URL
        // We need to extract the path after v19.0
        currentUrl = response.data.paging.next.split('/v19.0')[1];
        isFirstPage = false;
      } else {
        currentUrl = null;
      }
    }

    return allData;

  } catch (error) {
    if (error.response && error.response.data && error.response.data.error) {
      const metaError = error.response.data.error;
      if (metaError.code === 190) throw new Error('Meta token expired');
      if (metaError.code === 17) throw new Error('Meta rate limit hit, retry later');
      throw new Error(metaError.message || error.message);
    }
    throw new Error(error.message);
  }
};

module.exports = { fetchAccountDailyInsights };
