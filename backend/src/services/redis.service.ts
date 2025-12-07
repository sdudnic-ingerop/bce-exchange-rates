import Redis from 'ioredis';
import { REDIS_URL, CACHE_TTL_SECONDS } from '../config/constants.js';

class RedisService {
  private client: Redis | null;
  private logger: any;
  private enabled: boolean;

  constructor(logger: any) {
    this.logger = logger;
    // Only enable Redis if REDIS_URL is explicitly set in environment
    this.enabled = !!process.env.REDIS_URL && process.env.REDIS_URL !== 'redis://localhost:6379';

    if (!this.enabled) {
      this.logger.info('⚠️  Redis disabled (REDIS_URL not set) - running without cache');
      this.client = null;
      return;
    }

    this.client = new Redis(REDIS_URL, {
      retryStrategy(times) {
        if (times > 3) return null; // Stop retrying after 3 attempts
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      lazyConnect: true // Don't connect immediately
    });

    this.client.on('connect', () => {
      this.logger.info('✅ Redis connected');
    });

    this.client.on('error', (err) => {
      this.logger.warn({ err }, '⚠️  Redis connection error - continuing without cache');
    });

    // Try to connect but don't fail if it doesn't work
    this.client.connect().catch(err => {
      this.logger.warn({ err }, '⚠️  Redis unavailable - continuing without cache');
      this.enabled = false;
    });
  }

  getCacheKey(currencies: string[], date?: string): string {
    return `bce:rates:${currencies.sort().join(',')}:${date || 'latest'}`;
  }

  async getFromCache(key: string): Promise<any | null> {
    if (!this.enabled || !this.client) return null;
    
    try {
      const cached = await this.client.get(key);
      if (!cached) return null;
      
      this.logger.info(`📦 Cache HIT: ${key}`);
      return JSON.parse(cached);
    } catch (err) {
      this.logger.warn({ err }, 'Redis GET error');
      return null;
    }
  }

  async setCache(key: string, data: any): Promise<void> {
    if (!this.enabled || !this.client) return;
    
    try {
      await this.client.setex(key, CACHE_TTL_SECONDS, JSON.stringify(data));
      this.logger.info(`💾 Cache SET: ${key} (TTL: ${CACHE_TTL_SECONDS}s)`);
    } catch (err) {
      this.logger.warn({ err }, 'Redis SET error');
    }
  }

  async ping(): Promise<void> {
    if (!this.enabled || !this.client) return;
    await this.client.ping();
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.enabled || !this.client) return [];
    return await this.client.keys(pattern);
  }

  getClient(): Redis | null {
    return this.client;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export default RedisService;
