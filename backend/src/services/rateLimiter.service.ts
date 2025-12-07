import { ECB_MAX_REQ_PER_MIN, ECB_BLOCK_DURATION_MS } from '../config/constants.js';

class RateLimiterService {
  private requestCount: number = 0;
  private windowStart: number = Date.now();
  private blockedUntil: number = 0;
  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
  }

  isBlocked(): boolean {
    return Date.now() < this.blockedUntil;
  }

  getBlockedUntil(): number {
    return this.blockedUntil;
  }

  recordRequest(): boolean {
    const now = Date.now();
    
    // Reset window if elapsed
    if (now - this.windowStart > 60_000) {
      this.windowStart = now;
      this.requestCount = 0;
    }
    
    this.requestCount++;
    
    if (this.requestCount > ECB_MAX_REQ_PER_MIN) {
      this.blockedUntil = Date.now() + ECB_BLOCK_DURATION_MS;
      this.logger.warn(
        `ECB request rate exceeded (${ECB_MAX_REQ_PER_MIN}/min). ` +
        `Blocking until ${new Date(this.blockedUntil).toISOString()}`
      );
      return false;
    }
    
    return true;
  }
}

export default RateLimiterService;
