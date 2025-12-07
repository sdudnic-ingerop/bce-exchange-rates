import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import RedisService from './services/redis.service.js';
import RateLimiterService from './services/rateLimiter.service.js';
import CSVService from './services/csv.service.js';
import ECBService from './services/ecb.service.js';
import { setupRoutes } from './routes/index.js';
import { CACHE_TTL_SECONDS, ECB_MAX_REQ_PER_MIN } from './config/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Fastify
const fastify = Fastify({
  logger: true
});

// CORS configuration
await fastify.register(cors, {
  origin: true, // Allow all origins in production
  methods: ['GET', 'POST', 'OPTIONS']
});

// Initialize services
const redisService = new RedisService(fastify.log);
const rateLimiter = new RateLimiterService(fastify.log);
const csvService = new CSVService(fastify.log);
const ecbService = new ECBService(fastify.log, redisService, rateLimiter, csvService);

// Setup API routes FIRST (before static files)
setupRoutes(fastify, redisService, rateLimiter, ecbService);

// Static files - Angular app (registered AFTER routes so /api/* takes precedence)
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../public'),
  prefix: '/',
  decorateReply: false
});

// Start server
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
