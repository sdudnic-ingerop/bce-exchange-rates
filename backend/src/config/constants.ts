// Configuration constants
export const ECB_API_BASE = 'https://data-api.ecb.europa.eu/service/data/EXR/';

export const CACHE_TTL_SECONDS = Math.floor(
  parseInt(process.env.CACHE_TTL_MS || String(60 * 60 * 1000), 10) / 1000
);

export const ECB_MAX_REQ_PER_MIN = parseInt(process.env.ECB_MAX_REQ_PER_MIN || '30', 10);
export const ECB_BLOCK_DURATION_MS = parseInt(
  process.env.ECB_BLOCK_DURATION_MS || String(10 * 60 * 1000),
  10
);

export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Currency to flag mapping
export const currencyFlags: Record<string, string> = {
  'USD': 'us', 'EUR': 'eu', 'GBP': 'gb', 'CHF': 'ch', 'JPY': 'jp',
  'CAD': 'ca', 'AUD': 'au', 'NZD': 'nz', 'SEK': 'se', 'NOK': 'no',
  'DKK': 'dk', 'PLN': 'pl', 'CZK': 'cz', 'HUF': 'hu', 'RON': 'ro',
  'BGN': 'bg', 'HRK': 'hr', 'RUB': 'ru', 'TRY': 'tr', 'BRL': 'br',
  'CNY': 'cn', 'HKD': 'hk', 'IDR': 'id', 'ILS': 'il', 'INR': 'in',
  'KRW': 'kr', 'MXN': 'mx', 'MYR': 'my', 'PHP': 'ph', 'SGD': 'sg',
  'THB': 'th', 'ZAR': 'za', 'ISK': 'is'
};

export const SUPPORTED_CURRENCIES = [
  'USD', 'JPY', 'BGN', 'CZK', 'DKK', 'GBP', 'HUF', 'PLN', 'RON', 'SEK', 
  'CHF', 'ISK', 'NOK', 'TRY', 'AUD', 'BRL', 'CAD', 'CNY', 'HKD', 'IDR', 
  'ILS', 'INR', 'KRW', 'MXN', 'MYR', 'NZD', 'PHP', 'SGD', 'THB', 'ZAR'
];
