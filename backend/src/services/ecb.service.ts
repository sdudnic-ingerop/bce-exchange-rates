import { ExchangeResponse, HistoryPoint } from '../types/index.js';
import { ECB_API_BASE, currencyFlags } from '../config/constants.js';
import RedisService from './redis.service.js';
import RateLimiterService from './rateLimiter.service.js';
import CSVService from './csv.service.js';

class ECBService {
  private logger: any;
  private redisService: RedisService;
  private rateLimiter: RateLimiterService;
  private csvService: CSVService;

  constructor(
    logger: any,
    redisService: RedisService,
    rateLimiter: RateLimiterService,
    csvService: CSVService
  ) {
    this.logger = logger;
    this.redisService = redisService;
    this.rateLimiter = rateLimiter;
    this.csvService = csvService;
  }

  private async fetchWithRetries(
    url: string,
    init: any = {},
    retries = 2,
    backoffMs = 300
  ): Promise<Response> {
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

  async fetchRates(currencies: string[], date?: string): Promise<ExchangeResponse> {
    const cacheKey = this.redisService.getCacheKey(currencies, date);
    const cached = await this.redisService.getFromCache(cacheKey);
    
    if (cached) {
      return { ...cached, cached: true };
    }

    if (this.rateLimiter.isBlocked()) {
      const err = new Error('Temporarily blocked from calling ECB due to rate limiting');
      (err as any).blocked = true;
      throw err;
    }

    if (!this.rateLimiter.recordRequest()) {
      const err = new Error('Local rate limit exceeded for ECB calls');
      (err as any).blocked = true;
      throw err;
    }

    try {
      const currencyFilter = currencies.join('+');
      const dateParam = date ? `&startPeriod=${date}&endPeriod=${date}` : '&lastNObservations=1';
      const url = `${ECB_API_BASE}D.${currencyFilter}.EUR.SP00.A?format=jsondata${dateParam}`;

      this.logger.info(`Fetching from ECB: ${url}`);
      
      const response = await this.fetchWithRetries(url, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`ECB API error ${response.status}: ${errorText}`);
        
        if (response.status === 400 && errorText.includes('access has been blocked')) {
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
      this.logger.info(`Received ${rawText.length} bytes from ECB`);

      if (!rawText || rawText.trim().length === 0) {
        const err = new Error('ECB returned empty response');
        (err as any).ecbRequestUrl = url;
        throw err;
      }

      const data = JSON.parse(rawText);
      const observations = data.dataSets?.[0]?.series || {};
      const dimensions = data.structure?.dimensions?.series || [];
      const currencyDim = dimensions.find((d: any) => d.id === 'CURRENCY')?.values || [];
      const rates: any[] = [];

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
      
      await this.redisService.setCache(cacheKey, result);
      return result;
    } catch (error) {
      this.logger.error(error);
      
      // Try CSV fallback only if ECB fails completely (not for specific dates and not if blocked)
      if (!(error as any).blocked && !date) {
        this.logger.warn('ECB API failed, trying CSV fallback for latest rates');
        try {
          const fallbackResult = this.csvService.buildResponseFromCSV(currencies, date);
          await this.redisService.setCache(cacheKey, fallbackResult);
          return fallbackResult;
        } catch (csvError) {
          this.logger.error({ err: csvError }, 'CSV fallback also failed');
        }
      }
      
      throw error;
    }
  }

  async fetchHistory(currencies: string[], start: string, end: string): Promise<HistoryPoint[]> {
    const cacheKey = `bce:history:${currencies.sort().join(',')}:${start}:${end}`;
    const cached = await this.redisService.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    if (this.rateLimiter.isBlocked()) {
      const err = new Error('Temporarily blocked from calling ECB');
      (err as any).blocked = true;
      throw err;
    }

    if (!this.rateLimiter.recordRequest()) {
      const err = new Error('Local rate limit exceeded');
      (err as any).blocked = true;
      throw err;
    }

    const currencyFilter = currencies.join('+');
    const startDate = new Date(start);
    const endDate = new Date(end);
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const numObs = Math.max(daysDiff + 50, 365);
    const url = `${ECB_API_BASE}D.${currencyFilter}.EUR.SP00.A?format=jsondata&lastNObservations=${numObs}`;

    this.logger.info(`Fetching history from ECB: ${url} (requesting ${numObs} most recent observations)`);
    
    const response = await this.fetchWithRetries(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`ECB history error ${response.status}: ${errorText}`);
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

    const filtered = points.filter(p => p.date >= start && p.date <= end);
    const sorted = filtered.sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency));
    await this.redisService.setCache(cacheKey, sorted);
    return sorted;
  }

  async fetchHistoryWithFallback(currencies: string[], start: string, end: string): Promise<HistoryPoint[]> {
    try {
      return await this.fetchHistory(currencies, start, end);
    } catch (error) {
      if ((error as any).blocked) throw error;
      
      this.logger.warn('ECB history failed, trying CSV fallback');
      const fallbackData = this.csvService.buildHistoryFromCSV(currencies, start, end);
      return fallbackData;
    }
  }
}

export default ECBService;
