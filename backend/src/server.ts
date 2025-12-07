import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import Redis from 'ioredis';

const fastify = Fastify({
  logger: true
});

// Redis client
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(REDIS_URL, {
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3
});

redis.on('connect', () => {
  fastify.log.info('✅ Redis connected');
});

redis.on('error', (err) => {
  fastify.log.error({ err }, '❌ Redis connection error');
});

// OpenAPI specification
const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'BCE Exchange Rates API',
    version: '1.0.0',
    description: `API pour récupérer les taux de change de la Banque Centrale Européenne (ECB) avec cache Redis (1h TTL) et fallback CSV.

**Documentation officielle ECB:**
- [Vue d'ensemble API](https://data.ecb.europa.eu/help/api/overview)
- [Documentation Data API](https://data.ecb.europa.eu/help/api/data)
- [Astuces et exemples](https://data.ecb.europa.eu/help/api/useful-tips)

**Caractéristiques:**
- Cache Redis: 1 heure (3600s)
- Rate limiting: 30 requêtes/min vers ECB
- Fallback CSV: données historiques locales si ECB indisponible
- Format: JSON`,
    contact: {
      name: 'API Support'
    }
  },
  servers: [
    {
      url: 'http://localhost:8000',
      description: 'Development server'
    }
  ],
  paths: {
    '/api/health': {
      get: {
        summary: 'Health check',
        description: 'Vérifie le statut de l\'API et de Redis',
        tags: ['System'],
        responses: {
          '200': {
            description: 'API is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                    ecbBlockedUntil: { type: 'string', format: 'date-time', nullable: true },
                    redis: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'connected' },
                        cachedKeys: { type: 'number', example: 5 }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/bce-exchange': {
      get: {
        summary: 'Get exchange rates',
        description: `Récupère les taux de change pour les devises spécifiées (cache 1h, fallback CSV si ECB fail)

**URLs à copier/coller (virgules non-encodées):**

Taux actuels:
\`\`\`
http://localhost:8000/api/bce-exchange?currencies=USD,CHF,GBP
\`\`\`

Taux à une date:
\`\`\`
http://localhost:8000/api/bce-exchange?currencies=USD,CHF&date=2025-12-06
\`\`\`

**Note importante:**
- Si la date demandée n'existe pas (weekend, futur, férié), l'API retourne une erreur avec le message ECB
- Le champ \`requestedDate\` indique la date demandée
- Exemple: demander dimanche 2025-12-08 (futur) → retourne status "error" avec le message d'erreur`,
        tags: ['Exchange Rates'],
        parameters: [
          {
            name: 'currencies',
            in: 'query',
            required: true,
            description: 'Devises séparées par virgule',
            schema: { type: 'string' },
            example: 'USD,CHF,GBP'
          },
          {
            name: 'date',
            in: 'query',
            required: false,
            description: 'Date au format YYYY-MM-DD (optionnel)',
            schema: { type: 'string', format: 'date' },
            example: '2025-12-06'
          }
        ],
        'x-codeSamples': [
          {
            lang: 'Shell',
            source: "curl 'http://localhost:8000/api/bce-exchange?currencies=USD,CHF,GBP'"
          },
          {
            lang: 'Shell',
            label: 'With date',
            source: "curl 'http://localhost:8000/api/bce-exchange?currencies=USD,CHF&date=2025-12-06'"
          }
        ],
        responses: {
          '200': {
            description: 'Taux de change récupérés',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'success' },
                    date: { type: 'string', format: 'date' },
                    base: { type: 'string', example: 'EUR' },
                    rates: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          currency: { type: 'string', example: 'USD' },
                          rate: { type: 'number', example: 1.0623 },
                          flag: { type: 'string', example: 'us' }
                        }
                      }
                    },
                    source: { type: 'string', example: 'European Central Bank (ECB)' },
                    cached: { type: 'boolean', example: true }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Paramètre manquant, date invalide ou aucune donnée disponible',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'error' },
                    message: { type: 'string', example: 'Aucune donnée disponible pour cette date' },
                    requestedDate: { type: 'string', example: '2025-12-08' },
                    ecbRequestUrl: { type: 'string', example: 'https://data-api.ecb.europa.eu/service/data/EXR/...' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/bce-exchange/history': {
      get: {
        summary: 'Get historical rates',
        description: `Récupère l'historique des taux de change pour une période donnée.

**Comportement :** Pour chaque devise demandée, l'API retourne les données les plus récentes disponibles dans la période spécifiée. Si une date spécifique n'a pas de données (weekend, jour férié), la date la plus récente antérieure est automatiquement utilisée.

**L'API ECB utilise le paramètre \`lastNObservations\` pour récupérer les N dernières observations disponibles** puis filtre les résultats pour la période demandée.

**URL à copier/coller:**
\`\`\`
http://localhost:8000/api/bce-exchange/history?currencies=USD,CHF&start=2025-11-01&end=2025-12-06
\`\`\``,
        tags: ['Exchange Rates'],
        'x-codeSamples': [
          {
            lang: 'Shell',
            source: "curl 'http://localhost:8000/api/bce-exchange/history?currencies=USD,CHF&start=2025-11-01&end=2025-12-06'"
          }
        ],
        parameters: [
          {
            name: 'currencies',
            in: 'query',
            required: true,
            description: 'Devises séparées par virgule',
            schema: { type: 'string' },
            example: 'USD,CHF'
          },
          {
            name: 'start',
            in: 'query',
            required: true,
            description: 'Date de début',
            schema: { type: 'string', format: 'date' },
            example: '2025-11-01'
          },
          {
            name: 'end',
            in: 'query',
            required: true,
            description: 'Date de fin',
            schema: { type: 'string', format: 'date' },
            example: '2025-12-06'
          }
        ],
        responses: {
          '200': {
            description: 'Historique récupéré avec succès',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'success' },
                    start: { type: 'string', format: 'date', example: '2025-11-01' },
                    end: { type: 'string', format: 'date', example: '2025-12-06' },
                    referenceBase: { type: 'string', example: 'EUR' },
                    source: { type: 'string', example: 'European Central Bank (ECB)' },
                    queriedAt: { type: 'string', format: 'date-time', example: '2025-12-07T10:00:00.000Z' },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          currency: { type: 'string', example: 'USD' },
                          date: { type: 'string', format: 'date', example: '2025-12-01' },
                          rate: { type: 'number', example: 1.0623 }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Paramètres manquants ou invalides',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'error' },
                    message: { type: 'string', example: 'Parameters "currencies", "start" and "end" are required' }
                  }
                },
                examples: {
                  missingParams: {
                    summary: 'Paramètres manquants',
                    value: {
                      status: 'error',
                      message: 'Parameters "currencies", "start" and "end" are required'
                    }
                  },
                  invalidDate: {
                    summary: 'Format de date invalide',
                    value: {
                      status: 'error',
                      message: 'Invalid date format. Use YYYY-MM-DD'
                    }
                  }
                }
              }
            }
          },
          '429': {
            description: 'Trop de requêtes vers l\'API ECB (rate limit atteint)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'error' },
                    message: { type: 'string', example: 'L\'API ECB a temporairement bloqué l\'accès.' },
                    blocked: { type: 'boolean', example: true }
                  }
                }
              }
            }
          },
          '500': {
            description: 'Erreur serveur ou API ECB indisponible',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'error' },
                    message: { type: 'string', example: 'ECB API error or internal server error' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

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
  source?: string;
  referenceBase?: string;
  queriedAt?: string;
  message?: string;
  ecbRequestUrl?: string;
  blocked?: boolean;
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

// CSV Fallback configuration
const CSV_FALLBACK_PATH = path.join(__dirname, '../../data/data.csv');

// Parse CSV fallback data
interface CSVRow {
  CURRENCY: string;
  TIME_PERIOD: string;
  OBS_VALUE: string;
}

function parseCSVFallback(): CSVRow[] {
  try {
    const csvContent = readFileSync(CSV_FALLBACK_PATH, 'utf-8');
    const lines = csvContent.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',');
    
    const currencyIdx = headers.indexOf('CURRENCY');
    const timeIdx = headers.indexOf('TIME_PERIOD');
    const valueIdx = headers.indexOf('OBS_VALUE');
    
    return lines.slice(1).map(line => {
      const cols = line.split(',');
      return {
        CURRENCY: cols[currencyIdx] || '',
        TIME_PERIOD: cols[timeIdx] || '',
        OBS_VALUE: cols[valueIdx] || ''
      };
    }).filter(row => row.CURRENCY && row.OBS_VALUE);
  } catch (err) {
    fastify.log.error({ err }, 'Failed to parse CSV fallback');
    return [];
  }
}

let csvFallbackData: CSVRow[] | null = null;

function getCSVFallback(): CSVRow[] {
  if (!csvFallbackData) {
    csvFallbackData = parseCSVFallback();
    fastify.log.info(`Loaded ${csvFallbackData.length} rows from CSV fallback`);
  }
  return csvFallbackData;
}

function buildResponseFromCSV(currencies: string[], date?: string): ExchangeResponse {
  const csvData = getCSVFallback();
  
  // Find latest or specific date data
  const targetDate = date || csvData
    .map(r => r.TIME_PERIOD)
    .sort()
    .reverse()[0];
  
  const rates: ExchangeRate[] = [];
  
  currencies.forEach(currency => {
    const rows = csvData.filter(r => 
      r.CURRENCY === currency && 
      (!date || r.TIME_PERIOD === date || r.TIME_PERIOD.startsWith(date))
    );
    
    if (rows.length > 0) {
      // Get latest matching row
      const latestRow = rows.sort((a, b) => b.TIME_PERIOD.localeCompare(a.TIME_PERIOD))[0];
      rates.push({
        currency,
        rate: parseFloat(latestRow.OBS_VALUE),
        flag: currencyFlags[currency] || 'xx'
      });
    }
  });
  
  return {
    status: 'success',
    date: targetDate,
    base: 'EUR',
    rates: rates.sort((a, b) => a.currency.localeCompare(b.currency)),
    source: 'Local CSV fallback (ECB historical data)',
    referenceBase: 'EUR',
    queriedAt: new Date().toISOString(),
    message: 'Using cached historical data due to ECB API unavailability'
  };
}

function buildHistoryFromCSV(currencies: string[], start: string, end: string): HistoryPoint[] {
  const csvData = getCSVFallback();
  const points: HistoryPoint[] = [];
  
  currencies.forEach(currency => {
    csvData
      .filter(r => 
        r.CURRENCY === currency &&
        r.TIME_PERIOD >= start &&
        r.TIME_PERIOD <= end
      )
      .forEach(r => {
        points.push({
          currency,
          date: r.TIME_PERIOD,
          rate: parseFloat(r.OBS_VALUE)
        });
      });
  });
  
  return points.sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency));
}

// Redis cache functions
const CACHE_TTL_SECONDS = Math.floor(parseInt(process.env.CACHE_TTL_MS || String(60 * 60 * 1000), 10) / 1000);

function getCacheKey(currencies: string[], date?: string): string {
  return `bce:rates:${currencies.sort().join(',')}:${date || 'latest'}`;
}

async function getFromCache(key: string): Promise<any | null> {
  try {
    const cached = await redis.get(key);
    if (!cached) return null;
    
    fastify.log.info(`📦 Cache HIT: ${key}`);
    return JSON.parse(cached);
  } catch (err) {
    fastify.log.error({ err }, 'Redis GET error');
    return null;
  }
}

async function setCache(key: string, data: any): Promise<void> {
  try {
    await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(data));
    fastify.log.info(`💾 Cache SET: ${key} (TTL: ${CACHE_TTL_SECONDS}s)`);
  } catch (err) {
    fastify.log.error({ err }, 'Redis SET error');
  }
}

// Outbound rate limiting to ECB
const ECB_MAX_REQ_PER_MIN = parseInt(process.env.ECB_MAX_REQ_PER_MIN || '30', 10);
const ECB_BLOCK_DURATION_MS = parseInt(process.env.ECB_BLOCK_DURATION_MS || String(10 * 60 * 1000), 10);
let ecbRequestCount = 0;
let ecbWindowStart = Date.now();
let ecbBlockedUntil = 0;

function isEcbBlocked(): boolean {
  return Date.now() < ecbBlockedUntil;
}

function recordEcbRequest(): boolean {
  const now = Date.now();
  if (now - ecbWindowStart > 60_000) {
    ecbWindowStart = now;
    ecbRequestCount = 0;
  }
  ecbRequestCount++;
  if (ecbRequestCount > ECB_MAX_REQ_PER_MIN) {
    ecbBlockedUntil = Date.now() + ECB_BLOCK_DURATION_MS;
    fastify.log.warn(`ECB request rate exceeded (${ECB_MAX_REQ_PER_MIN}/min). Blocking until ${new Date(ecbBlockedUntil).toISOString()}`);
    return false;
  }
  return true;
}

// Helper: fetch with retries + backoff
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

async function fetchECBRates(currencies: string[], date?: string): Promise<ExchangeResponse> {
  const cacheKey = getCacheKey(currencies, date);
  const cached = await getFromCache(cacheKey);
  
  if (cached) {
    return { ...cached, cached: true };
  }

  if (isEcbBlocked()) {
    const err = new Error('Temporarily blocked from calling ECB due to rate limiting');
    (err as any).blocked = true;
    throw err;
  }

  if (!recordEcbRequest()) {
    const err = new Error('Local rate limit exceeded for ECB calls');
    (err as any).blocked = true;
    throw err;
  }

  try {
    const currencyFilter = currencies.join('+');
    const dateParam = date ? `&startPeriod=${date}&endPeriod=${date}` : '&lastNObservations=1';
    const url = `${ECB_API_BASE}D.${currencyFilter}.EUR.SP00.A?format=jsondata${dateParam}`;

    fastify.log.info(`Fetching from ECB: ${url}`);
    
    const response = await fetchWithRetries(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      fastify.log.error(`ECB API error ${response.status}: ${errorText}`);
      
      if (response.status === 400 && errorText.includes('access has been blocked')) {
        ecbBlockedUntil = Date.now() + ECB_BLOCK_DURATION_MS;
        const err = new Error('ECB API: Access blocked due to rate limiting');
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
      const err = new Error('ECB returned empty response');
      (err as any).ecbRequestUrl = url;
      throw err;
    }

    const data = JSON.parse(rawText);
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
            });
          }
        }
      }
    });

    const dateUsed = date || new Date().toISOString().split('T')[0];
    const result = {
      status: 'success',
      date: dateUsed,
      base: 'EUR',
      rates: rates.sort((a, b) => a.currency.localeCompare(b.currency)),
      source: 'European Central Bank (ECB)',
      referenceBase: 'EUR',
      queriedAt: new Date().toISOString()
    };
    
    await setCache(cacheKey, result);
    return result;
  } catch (error) {
    fastify.log.error(error);
    
    // Try CSV fallback only if ECB fails completely (not for specific dates and not if blocked)
    if (!(error as any).blocked && !date) {
      fastify.log.warn('ECB API failed, trying CSV fallback for latest rates');
      try {
        const fallbackResult = buildResponseFromCSV(currencies, date);
        await setCache(cacheKey, fallbackResult);
        return fallbackResult;
      } catch (csvError) {
        fastify.log.error({ err: csvError }, 'CSV fallback also failed');
      }
    }
    
    throw error;
  }
}

async function fetchECBHistory(currencies: string[], start: string, end: string): Promise<HistoryPoint[]> {
  const cacheKey = `bce:history:${currencies.sort().join(',')}:${start}:${end}`;
  const cached = await getFromCache(cacheKey);
  
  if (cached) {
    return cached;
  }

  if (isEcbBlocked()) {
    const err = new Error('Temporarily blocked from calling ECB');
    (err as any).blocked = true;
    throw err;
  }

  if (!recordEcbRequest()) {
    const err = new Error('Local rate limit exceeded');
    (err as any).blocked = true;
    throw err;
  }

  const currencyFilter = currencies.join('+');
  // Calcul du nombre de jours entre start et end
  const startDate = new Date(start);
  const endDate = new Date(end);
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  // Utiliser lastNObservations pour obtenir les N dernières observations disponibles
  // On demande daysDiff + marge de 50 jours pour couvrir les weekends/jours fériés
  const numObs = Math.max(daysDiff + 50, 365);
  const url = `${ECB_API_BASE}D.${currencyFilter}.EUR.SP00.A?format=jsondata&lastNObservations=${numObs}`;

  fastify.log.info(`Fetching history from ECB: ${url} (requesting ${numObs} most recent observations)`);
  
  const response = await fetchWithRetries(url, {
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
  const data = JSON.parse(rawText);

  const series = data.dataSets?.[0]?.series || {};
  const seriesDims = data.structure?.dimensions?.series || [];
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

  // Filtrer les points pour ne garder que ceux dans la plage demandée
  const filtered = points.filter(p => p.date >= start && p.date <= end);
  const sorted = filtered.sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency));
  await setCache(cacheKey, sorted);
  return sorted;
}

async function fetchECBHistoryWithFallback(currencies: string[], start: string, end: string): Promise<HistoryPoint[]> {
  try {
    return await fetchECBHistory(currencies, start, end);
  } catch (error) {
    if ((error as any).blocked) throw error;
    
    fastify.log.warn('ECB history failed, trying CSV fallback');
    const fallbackData = buildHistoryFromCSV(currencies, start, end);
    return fallbackData;
  }
}

// Routes
fastify.get('/', async () => ({
  service: 'BCE Exchange Rates API',
  version: '1.0.0',
  endpoints: {
    health: 'GET /api/health',
    rates: 'GET /api/bce-exchange?currencies=USD,CHF&date=2025-12-06',
    docs: 'GET /docs - Scalar API Documentation'
  }
}));

// Scalar API Documentation
fastify.get('/docs', async (request, reply) => {
  reply.type('text/html');
  return `
<!DOCTYPE html>
<html>
<head>
  <title>BCE Exchange Rates API Documentation</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script
    id="api-reference"
    type="application/json"
    data-configuration='${JSON.stringify({
      spec: {
        url: '/openapi.json'
      },
      servers: [
        {
          url: 'http://localhost:8000',
          description: 'Development'
        }
      ],
      defaultHttpClient: {
        targetKey: 'shell',
        clientKey: 'curl'
      }
    })}'></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>
  `;
});

// OpenAPI JSON endpoint
fastify.get('/openapi.json', async () => openApiSpec);

fastify.get('/api/health', async () => {
  let redisStatus = 'disconnected';
  let cacheKeys = 0;
  
  try {
    await redis.ping();
    redisStatus = 'connected';
    const keys = await redis.keys('bce:*');
    cacheKeys = keys.length;
  } catch (err) {
    fastify.log.error({ err }, 'Redis health check failed');
  }
  
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    ecbBlockedUntil: ecbBlockedUntil > 0 ? new Date(ecbBlockedUntil).toISOString() : null,
    redis: {
      status: redisStatus,
      cachedKeys: cacheKeys
    }
  };
});

interface ExchangeQuerystring {
  currencies?: string;
  date?: string;
}

fastify.get<{ Querystring: ExchangeQuerystring }>('/api/bce-exchange', async (request, reply) => {
  const { currencies, date } = request.query;

  if (!currencies) {
    reply.code(400);
    return { status: 'error', message: 'Parameter "currencies" is required' };
  }

  const currencyList = currencies.split(',').map(c => c.trim().toUpperCase());

  try {
    const result = await fetchECBRates(currencyList, date);
    return result;
  } catch (error: any) {
    fastify.log.error({ err: error }, 'Error in /api/bce-exchange');
    
    if (error.blocked) {
      return {
        status: 'error',
        message: 'L\'API ECB a temporairement bloqué l\'accès (trop de requêtes). Veuillez patienter quelques minutes.',
        blocked: true
      };
    }
    
    const payload: any = { 
      status: 'error', 
      message: error.message || 'Aucune donnée disponible pour cette date',
      requestedDate: date
    };
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
    const data = await fetchECBHistoryWithFallback(currencyList, start, end);
    return {
      status: 'success',
      start,
      end,
      referenceBase: 'EUR',
      source: data.length > 0 && data[0].date ? 'European Central Bank (ECB)' : 'Local CSV fallback',
      queriedAt: new Date().toISOString(),
      data
    };
  } catch (error: any) {
    fastify.log.error({ err: error }, 'Error in /api/bce-exchange/history');
    
    if (error.blocked) {
      return {
        status: 'error',
        message: 'L\'API ECB a temporairement bloqué l\'accès.',
        blocked: true
      };
    }
    
    const payload: any = { status: 'error', message: error.message || 'Unknown error' };
    if (error.ecbRequestUrl) payload.ecbRequestUrl = error.ecbRequestUrl;
    return payload;
  }
});

fastify.setNotFoundHandler((request, reply) => {
  if (request.method === 'GET' && request.headers.accept?.includes('text/html')) {
    return reply.sendFile('index.html');
  }
  return reply.code(404).send({ status: 'error', message: 'Not found' });
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '8000');
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    console.log(`🚀 Server running on http://${host}:${port}`);
    console.log(`⚙️  Rate limit: ${ECB_MAX_REQ_PER_MIN} requests/min to ECB`);
    console.log(`⏱️  Redis cache TTL: ${CACHE_TTL_SECONDS}s (${CACHE_TTL_SECONDS / 60} min)`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
