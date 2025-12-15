import { FastifyInstance } from 'fastify';
import { ExchangeQuerystring, HistoryQuerystring } from '../types/index.js';
import { openApiSpec } from '../config/openapi.js';
import { CACHE_TTL_SECONDS, ECB_MAX_REQ_PER_MIN, SUPPORTED_CURRENCIES, currencyFlags } from '../config/constants.js';
import RedisService from '../services/redis.service.js';
import RateLimiterService from '../services/rateLimiter.service.js';
import ECBService from '../services/ecb.service.js';

export function setupRoutes(
  fastify: FastifyInstance,
  redisService: RedisService,
  rateLimiter: RateLimiterService,
  ecbService: ECBService
) {
  // API info endpoint
  fastify.get('/api', async () => ({
    service: 'BCE Exchange Rates API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /api/health',
      rates: 'GET /api/bce-exchange?currencies=USD,CHF&date=2025-12-06',
      history: 'GET /api/bce-exchange/history?currencies=USD,CHF&start=2025-11-01&end=2025-12-06',
      docs: 'GET /api/docs'
    }
  }));

  // Scalar API Documentation - Accessible at /api/docs
  fastify.get('/api/docs', async (request, reply) => {
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
        url: '/api/openapi.json'
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
  fastify.get('/api/openapi.json', async () => openApiSpec);

  // Health check endpoint
  fastify.get('/api/health', async () => {
    let redisStatus = 'disconnected';
    let cacheKeys = 0;
    
    try {
      await redisService.ping();
      redisStatus = 'connected';
      const keys = await redisService.keys('bce:*');
      cacheKeys = keys.length;
    } catch (err) {
      fastify.log.error({ err }, 'Redis health check failed');
    }
    
    const blockedUntil = rateLimiter.getBlockedUntil();
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      ecbBlockedUntil: blockedUntil > 0 ? new Date(blockedUntil).toISOString() : null,
      redis: {
        status: redisStatus,
        cachedKeys: cacheKeys
      }
    };
  });

  // Get available currencies endpoint
  fastify.get('/api/bce-exchange/currencies', async (request, reply) => {
    try {
      // Return the static list of supported currencies as requested
      const currencies = SUPPORTED_CURRENCIES.map(code => ({
        code,
        flag: currencyFlags[code] || 'xx'
      }));
      
      return {
        status: 'success',
        currencies: currencies.sort((a, b) => a.code.localeCompare(b.code)),
        count: currencies.length,
        source: 'European Central Bank (ECB) Supported List'
      };
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error fetching available currencies');
      return {
        status: 'error',
        message: error.message || 'Could not retrieve available currencies'
      };
    }
  });

  // Exchange rates endpoint
  fastify.get<{ Querystring: ExchangeQuerystring }>('/api/bce-exchange', async (request, reply) => {
    const { currencies, date } = request.query;

    // If currencies is not provided, we assume all available currencies (empty list)
    // Handle empty string case specifically
    const currencyList = (currencies && currencies.trim() !== '') 
      ? currencies.split(',').map(c => c.trim().toUpperCase()) 
      : [];

    try {
      // If no date provided, fetch latest observations to find the most recent valid date
      let result;
      if (!date) {
        if (currencyList.length > 0) {
          fastify.log.info(`Fetching latest observations for currencies: ${currencyList.join(',')}`);
        } else {
          fastify.log.info(`Fetching latest observations for ALL currencies`);
        }
        result = await ecbService.fetchLatestRates(currencyList);
      } else {
        result = await ecbService.fetchRates(currencyList, date);
      }
      if (!result.ecbRequestUrl) {
        result.ecbRequestUrl = ecbService.buildEcbRequestUrl(currencyList);
      }
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

  // Latest date endpoint
  fastify.get<{ Querystring: { currency?: string } }>('/api/bce-exchange/latest-date', async (request, reply) => {
    const { currency } = request.query;
    const targetCurrency = currency ? currency.trim().toUpperCase() : 'USD'; // Default to USD as reference

    try {
      const date = await ecbService.getLatestDate(targetCurrency);
      return {
        status: 'success',
        currency: targetCurrency,
        date: date,
        source: 'European Central Bank (ECB)'
      };
    } catch (error: any) {
      fastify.log.error({ err: error }, 'Error in /api/bce-exchange/latest-date');
      return { status: 'error', message: error.message || 'Could not retrieve latest date' };
    }
  });

  // History endpoint
  fastify.get<{ Querystring: HistoryQuerystring }>('/api/bce-exchange/history', async (request, reply) => {
    const { currencies, start, end } = request.query;

    // If currencies is not provided, we assume all available currencies (empty list)
    // Handle empty string case specifically
    const currencyList = (currencies && currencies.trim() !== '') 
      ? currencies.split(',').map(c => c.trim().toUpperCase()) 
      : [];

    try {
      const data = await ecbService.fetchHistoryWithFallback(currencyList, start, end);
      const responsePayload: any = {
        status: 'success',
        start: start || '1999-01-01',
        end: end || new Date().toISOString().split('T')[0],
        referenceBase: 'EUR',
        source: data.length > 0 && data[0].date ? 'European Central Bank (ECB)' : 'Local CSV fallback',
        queriedAt: new Date().toISOString(),
        data
      };
      // Always include the ECB request URL the service used (helps frontend display the source link)
      responsePayload.ecbRequestUrl = ecbService.buildEcbRequestUrl(currencyList, undefined, start, end);
      return responsePayload;
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

  // 404 handler
  fastify.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && request.headers.accept?.includes('text/html')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ status: 'error', message: 'Not found' });
  });
}
