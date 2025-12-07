import Redis from 'ioredis';
import { REDIS_URL, CACHE_TTL_SECONDS } from '../config/constants.js';

class RedisService {
  private client: Redis;
  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
    this.client = new Redis(REDIS_URL, {
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
    });

    this.client.on('connect', () => {
      this.logger.info('✅ Redis connected');
    });

    this.client.on('error', (err) => {
      this.logger.error({ err }, '❌ Redis connection error');
    });
  }

  getCacheKey(currencies: string[], date?: string): string {
    return `bce:rates:${currencies.sort().join(',')}:${date || 'latest'}`;
  }

  async getFromCache(key: string): Promise<any | null> {
    try {
      const cached = await this.client.get(key);
      if (!cached) return null;
      
      this.logger.info(`📦 Cache HIT: ${key}`);
      return JSON.parse(cached);
    } catch (err) {
      this.logger.error({ err }, 'Redis GET error');
      return null;
    }
  }

  async setCache(key: string, data: any): Promise<void> {
    try {
      await this.client.setex(key, CACHE_TTL_SECONDS, JSON.stringify(data));
      this.logger.info(`💾 Cache SET: ${key} (TTL: ${CACHE_TTL_SECONDS}s)`);
    } catch (err) {
      this.logger.error({ err }, 'Redis SET error');
    }
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  getClient(): Redis {
    return this.client;
  }
}

export default RedisService;
