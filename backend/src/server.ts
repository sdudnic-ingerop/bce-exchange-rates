import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';

const fastify = Fastify({
  logger: true
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORS configuration
await fastify.register(cors, {
  origin: ['http://localhost:4200', 'http://localhost:8501'],
  methods: ['GET', 'POST', 'OPTIONS']
});

await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../public'),
  prefix: '/',
  index: ['index.html']
});

// Types
interface ExchangeRate {
  currency: string;
  rate: number;
  flag: string;
}

interface ExchangeResponse {
  status: string;
  date: string;
  base: string;
  rates: ExchangeRate[];
  source?: string; // data provider
  referenceBase?: string; // reference currency (EUR)
  queriedAt?: string; // timestamp when the data was fetched
  message?: string; // optional error or info message
  ecbRequestUrl?: string;
}

// helper: fetch with retries + backoff
async function fetchWithRetries(url: string, init: any = {}, retries = 2, backoffMs = 300): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(url, init);
      return res;
    } catch (err) {
      if (attempt >= retries) throw err;
      attempt++;
      const delay = backoffMs * Math.pow(2, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

interface HistoryPoint {
  currency: string;
  date: string;
  rate: number;
}

// Currency to flag mapping
const currencyFlags: Record<string, string> = {
  'USD': 'us', 'EUR': 'eu', 'GBP': 'gb', 'CHF': 'ch', 'JPY': 'jp',
  'CAD': 'ca', 'AUD': 'au', 'NZD': 'nz', 'SEK': 'se', 'NOK': 'no',
  'DKK': 'dk', 'PLN': 'pl', 'CZK': 'cz', 'HUF': 'hu', 'RON': 'ro',
  'BGN': 'bg', 'HRK': 'hr', 'RUB': 'ru', 'TRY': 'tr', 'BRL': 'br',
  'CNY': 'cn', 'HKD': 'hk', 'IDR': 'id', 'ILS': 'il', 'INR': 'in',
  'KRW': 'kr', 'MXN': 'mx', 'MYR': 'my', 'PHP': 'ph', 'SGD': 'sg',
  'THB': 'th', 'ZAR': 'za'
};

// ECB API configuration
const ECB_API_BASE = 'https://data-api.ecb.europa.eu/service/data/EXR/';

// Simple in-memory cache
interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(currencies: string[], date?: string): string {
  return `rates_${currencies.sort().join(',')}_${date || 'latest'}`;
}

function getFromCache(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  
  return entry.data;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch exchange rates from ECB API
 */
async function fetchECBRates(currencies: string[], date?: string): Promise<ExchangeResponse> {
  const cacheKey = getCacheKey(currencies, date);
  const cached = getFromCache(cacheKey);
  
  if (cached) {
    fastify.log.info('Returning cached data');
    return { ...cached, cached: true };
  }
  try {
    const currencyFilter = currencies.join('+');
    const dateParam = date || '';
    const url = `${ECB_API_BASE}D.${currencyFilter}.EUR.SP00.A?format=jsondata${dateParam ? `&startPeriod=${dateParam}&endPeriod=${dateParam}` : '&lastNObservations=1'}`;

    fastify.log.info(`Fetching from ECB: ${url}`);
    let response: Response;
    try {
      response = await fetchWithRetries(url, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate'
        }
      });
    } catch (fetchErr: any) {
      fastify.log.error({ err: fetchErr }, 'Fetch to ECB failed');
      const err = new Error('Failed to fetch from ECB');
      (err as any).ecbRequestUrl = url;
      throw err;
    }

    if (!response.ok) {
      const errorText = await response.text();
      fastify.log.error(`ECB API error ${response.status}: ${errorText}`);
      
      // Check for rate limiting / security block
      if (response.status === 400 && errorText.includes('access has been blocked')) {
        const err = new Error('ECB API: Access blocked due to rate limiting. Please wait a few minutes.');
        (err as any).ecbRequestUrl = url;
        (err as any).blocked = true;
        throw err;
      }
      
      const err = new Error(`ECB API error: ${response.status}`);
      (err as any).ecbRequestUrl = url;
      throw err;
    }

    const rawText = await response.text();
    fastify.log.info(`Received ${rawText.length} bytes from ECB`);

    if (!rawText || rawText.trim().length === 0) {
      fastify.log.error('ECB returned empty response body');
      const err = new Error('ECB returned empty response');
      (err as any).ecbRequestUrl = url;
      throw err;
    }

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr: any) {
      fastify.log.error({ err: parseErr }, 'Error parsing ECB response');
      const err = new Error('Invalid JSON from ECB');
      (err as any).ecbRequestUrl = url;
      throw err;
    }
    const observations = data.dataSets?.[0]?.series || {};
    const dimensions = data.structure?.dimensions?.series || [];

    const currencyDim = dimensions.find((d: any) => d.id === 'CURRENCY')?.values || [];
    const rates: ExchangeRate[] = [];

    Object.keys(observations).forEach((key) => {
      const parts = key.split(':');
      const seriesKey = parts[1] ?? parts[0];
      const currencyIndex = parseInt(seriesKey);
      const currency = currencyDim[currencyIndex]?.id;

      if (currency && observations[key]?.observations) {
        const obsKeys = Object.keys(observations[key].observations);
        if (obsKeys.length > 0) {
          const lastObs = observations[key].observations[obsKeys[obsKeys.length - 1]];
          const rate = lastObs?.[0];
          
          if (rate) {
            rates.push({
              currency,
              rate: parseFloat(rate),
              flag: currencyFlags[currency] || 'xx'
    const result = {
      status: 'success',
      date: dateUsed,
      base: 'EUR',
      rates: rates.sort((a, b) => a.currency.localeCompare(b.currency)),
      source: 'European Central Bank (ECB)',
      referenceBase: 'EUR',
      queriedAt
    };
    
    // Cache successful response
    setCache(cacheKey, result);
    
    return result
    return {
      status: 'success',
      datacheKey = `history_${currencies.sort().join(',')}_${start}_${end}`;
  const cached = getFromCache(cacheKey);
  
  if (cached) {
    fastify.log.info('Returning cached history data');
    return cached;
  }
  
  const ce: dateUsed,
      base: 'EUR',
      rates: rates.sort((a, b) => a.currency.localeCompare(b.currency)),
      source: 'European Central Bank (ECB)',
      referenceBase: 'EUR',
      queriedAt
    };
  } catch (error) {
    fastify.log.error(error);
    throw error;
  }
}

async function fetchECBHistory(currencies: string[], start: string, end: string): Promise<HistoryPoint[]> {
  const currencyFilter = currencies.join('+');
  const url = `${ECB_API_BASE}D.${currencyFilter}.EUR.SP00.A?format=jsondata&startPeriod=${start}&endPeriod=${end}`;

  fastify.log.info(`Fetching history from ECB: ${url}`);
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    fastify.log.error(`ECB history error ${response.status}: ${errorText}`);
    throw new Error(`ECB API error: ${response.status}`);
  }

  const rawText = await response.text();
  fastify.log.info(`Received ${rawText.length} bytes from ECB (history)`);
  const data: any = JSON.parse(rawText);

  const series = data.dataSets?.[0]?.series || {};
  const sorted = points.sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency));
  
  // Cache the result
  setCache(cacheKey, sorted);
  
  return sorted
  const timeDim = data.structure?.dimensions?.observation?.find((d: any) => d.id === 'TIME_PERIOD')?.values || [];
  const currencyDim = seriesDims.find((d: any) => d.id === 'CURRENCY')?.values || [];

  const points: HistoryPoint[] = [];

  Object.keys(series).forEach((seriesKey) => {
    const parts = seriesKey.split(':');
    const currencyIndex = parseInt(parts[1] ?? parts[0]);
    const currency = currencyDim[currencyIndex]?.id;
    if (!currency) return;

    const observations = series[seriesKey]?.observations || {};
    Object.entries(observations).forEach(([obsIdx, value]: [string, any]) => {
      const date = timeDim[parseInt(obsIdx)]?.id;
      const rate = value?.[0];
      if (date && rate) {
        points.push({ currency, date, rate: parseFloat(rate) });
      }
    });
  });

  return points.sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency));
}

// Routes
fastify.get('/', async (request, reply) => {
  return {
    service: 'BCE Exchange Rates API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      rates: 'GET /api/bce-exchange?currencies=USD,CHF&date=2025-12-06'
    }
  };
});

fastify.get('/api/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

interface ExchangeQuerystring {
  currencies?: string;');
    
    // Special handling for rate limiting
    if (error.blocked) {
      return { 
        status: 'error', 
        message: 'L\'API ECB a temporairement bloqué l\'accès (trop de requêtes). Veuillez patienter quelques minutes.',
        blocked: true
      };
    }
    
    // If specific date failed, try to get the most recent data (last 7 days)
    if (date && !error.blocked) {
      try {
        fastify.log.info('Trying to fetch latest available data without date filter');
        const latestResult = await fetchECBRates(currencyList);
        return {
          ...latestResult,
          requestedDate: date,
          message: `No data available for ${date}, returning latest available data`
        };
      } catch (fallbackError: any) {
        fastify.log.error({ err: fallbackError }, 'Fallback also failed');
        if (fallbackError.blocked) {
          return { 
            status: 'error', 
            message: 'L\'API ECB a temporairement bloqué l\'accès. Veuillez patienter quelques minutes.',
            blocked: true
          };
        }
  try {
    const result = await fetchECBRates(currencyList, date);
    return result;
  } catch (error: any) {
    fastify.log.error({ err: error }, 'Error in /api/bce-exchange - trying last available data');
    
    // If specific date failed, try to get the most recent data (last 7 days)
    if (date) {
      try {
        fastify.log.info('Trying to fetch latest available data without date filter');
        const latestResult = await fetchECBRates(currencyList);
        return {
          ...latestResult,
          requestedDate: date,
          message: `No data available for ${date}, returning latest available data`
        };
      } catch (fallbackError: any) {
        fastify.log.error({ err: fallbackError }, 'Fallback also failed');
      }
    }
    
    const payload: any = { status: 'error', message: error.message || 'Unknown error' };
    if (error.ecbRequestUrl) payload.ecbRequestUrl = error.ecbRequestUrl;
    return payload;
  }
});

interface HistoryQuerystring {
  currencies?: string;
  start?: string;
  end?: string;
}

fastify.get<{ Querystring: HistoryQuerystring }>('/api/bce-exchange/history', async (request, reply) => {
  const { currencies, start, end } = request.query;

  if (!currencies || !start || !end) {
    reply.code(400);
    return { status: 'error', message: 'Parameters "currencies", "start" and "end" are required' };
  }

  const currencyList = currencies.split(',').map(c => c.trim().toUpperCase());

  try {
    const data = await fetchECBHistory(currencyList, start, end);
    const queriedAt = new Date().toISOString();
    return {
      status: 'success',
      start,
      end,
      referenceBase: 'EUR',
      source: 'European Central Bank (ECB)',
      queriedAt,
      data
    };
  } catch (error: any) {
    fastify.log.error({ err: error }, 'Error in /api/bce-exchange/history');
    const payload: any = { status: 'error', message: error.message || 'Unknown error' };
    if (error.ecbRequestUrl) payload.ecbRequestUrl = error.ecbRequestUrl;
    return payload;
  }
});

// SPA fallback: serve Angular index.html for other GETs
fastify.setNotFoundHandler((request, reply) => {
  if (request.method === 'GET' && request.headers.accept?.includes('text/html')) {
    return reply.sendFile('index.html');
  }
  return reply.code(404).send({ status: 'error', message: 'Not found' });
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '8000');
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    console.log(`🚀 Server running on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
