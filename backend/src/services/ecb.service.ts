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
      const currencyFilter = currencies.length > 0 ? currencies.join('+') : '';
      // If no date is provided, fetch last 2 observations to calculate trend
      const dateParam = date ? `&startPeriod=${date}&endPeriod=${date}` : '&lastNObservations=2';
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
      const timeDim = data.structure?.dimensions?.observation?.find((d: any) => d.id === 'TIME_PERIOD')?.values || [];
      const rates: any[] = [];
      let actualDate = date;

      Object.keys(observations).forEach((key) => {
        const parts = key.split(':');
        const seriesKey = parts[1] ?? parts[0];
        const currencyIndex = parseInt(seriesKey);
        const currency = currencyDim[currencyIndex]?.id;

        if (currency && observations[key]?.observations) {
          const obsKeys = Object.keys(observations[key].observations).sort((a, b) => parseInt(a) - parseInt(b));
          if (obsKeys.length > 0) {
            const lastObsIdx = obsKeys[obsKeys.length - 1];
            const lastObs = observations[key].observations[lastObsIdx];
            const rate = lastObs?.[0];
            
            if (rate) {
              const currentRate = parseFloat(rate);
              let trend: 'up' | 'down' | 'equal' = 'equal';

              // Calculate trend if we have previous observation
              if (obsKeys.length >= 2) {
                const prevObsIdx = obsKeys[obsKeys.length - 2];
                const prevObs = observations[key].observations[prevObsIdx];
                const prevRate = prevObs?.[0] ? parseFloat(prevObs[0]) : null;
                
                if (prevRate !== null) {
                  if (currentRate > prevRate) trend = 'up';
                  else if (currentRate < prevRate) trend = 'down';
                }
              }

              rates.push({
                currency,
                rate: currentRate,
                flag: currencyFlags[currency] || 'xx',
                trend
              });
              
              // Extract actual date from response if using lastNObservations
              if (!date && timeDim.length > 0) {
                actualDate = timeDim[parseInt(lastObsIdx)]?.id || actualDate;
              }
            }
          }
        }
      });

      // Fallback to today's date if we couldn't extract it
      const dateUsed = actualDate || new Date().toISOString().split('T')[0];
      const result = {
        status: 'success',
        ratesUpdateDate: dateUsed,
        base: 'EUR',
        rates: rates.sort((a, b) => a.currency.localeCompare(b.currency)),
        source: 'European Central Bank (ECB)',
        referenceBase: 'EUR',
        queriedAt: new Date().toISOString(),
        ecbRequestUrl: url
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

  async fetchLatestRates(currencies: string[]): Promise<ExchangeResponse> {
    // Fetch the latest available data using lastNObservations
    return this.fetchRates(currencies);
  }

  buildEcbRequestUrl(currencies: string[], date?: string, start?: string, end?: string): string {
    const currencyFilter = currencies.length > 0 ? currencies.join('+') : '';
    if (start && end) {
      return `${ECB_API_BASE}D.${currencyFilter}.EUR.SP00.A?format=jsondata&startPeriod=${start}&endPeriod=${end}`;
    }
    if (date) {
      return `${ECB_API_BASE}D.${currencyFilter}.EUR.SP00.A?format=jsondata&startPeriod=${date}&endPeriod=${date}`;
    }
    return `${ECB_API_BASE}D.${currencyFilter}.EUR.SP00.A?format=jsondata&lastNObservations=1`;
  }

  async getLatestDate(currency: string): Promise<string> {
    const cacheKey = `bce:latest-date:${currency}`;
    const cached = await this.redisService.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    // We use fetchRates with a single currency to get the latest data
    // The fetchRates method already handles lastNObservations=1 logic when no date is provided
    const result = await this.fetchRates([currency]);
    
    if (result.ratesUpdateDate) {
      // Cache for 1 hour
      await this.redisService.setCache(cacheKey, result.ratesUpdateDate);
      return result.ratesUpdateDate;
    }
    
    throw new Error('Could not determine latest date');
  }

  async fetchHistory(currencies: string[], start?: string, end?: string): Promise<HistoryPoint[]> {
    // Default start date to 1999-01-01 (Euro launch) if not provided
    const startDateStr = start || '1999-01-01';
    // Default end date to today if not provided
    const endDateStr = end || new Date().toISOString().split('T')[0];

    const cacheKey = `bce:history:${currencies.sort().join(',')}:${startDateStr}:${endDateStr}`;
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

    const currencyFilter = currencies.length > 0 ? currencies.join('+') : '';
    
    // Use startPeriod and endPeriod for precise range fetching
    const url = `${ECB_API_BASE}D.${currencyFilter}.EUR.SP00.A?format=jsondata&startPeriod=${startDateStr}&endPeriod=${endDateStr}`;

    this.logger.info(`Fetching history from ECB: ${url}`);
    
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

    // Filter again just in case, though API should have handled it
    const filtered = points.filter(p => p.date >= startDateStr && p.date <= endDateStr);
    const sorted = filtered.sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency));
    await this.redisService.setCache(cacheKey, sorted);
    return sorted;
  }

  async fetchHistoryWithFallback(currencies: string[], start?: string, end?: string): Promise<HistoryPoint[]> {
    try {
      return await this.fetchHistory(currencies, start, end);
    } catch (error) {
      if ((error as any).blocked) throw error;
      
      this.logger.warn('ECB history failed, trying CSV fallback');
      // Default dates for fallback if needed
      const s = start || '1999-01-01';
      const e = end || new Date().toISOString().split('T')[0];
      const fallbackData = this.csvService.buildHistoryFromCSV(currencies, s, e);
      return fallbackData;
    }
  }
}

export default ECBService;
