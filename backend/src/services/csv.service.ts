import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CSVRow, ExchangeResponse, HistoryPoint } from '../types/index.js';
import { currencyFlags } from '../config/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CSVService {
  private csvFallbackPath: string;
  private csvData: CSVRow[] | null = null;
  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
    this.csvFallbackPath = path.join(__dirname, '../../../data/data.csv');
  }

  private parseCSV(): CSVRow[] {
    try {
      const csvContent = readFileSync(this.csvFallbackPath, 'utf-8');
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
      this.logger.error({ err }, 'Failed to parse CSV fallback');
      return [];
    }
  }

  private getCSVData(): CSVRow[] {
    if (!this.csvData) {
      this.csvData = this.parseCSV();
      this.logger.info(`Loaded ${this.csvData.length} rows from CSV fallback`);
    }
    return this.csvData;
  }

  buildResponseFromCSV(currencies: string[], date?: string): ExchangeResponse {
    const csvData = this.getCSVData();
    
    // Find latest or specific date data
    const targetDate = date || csvData
      .map(r => r.TIME_PERIOD)
      .sort()
      .reverse()[0];
    
    const rates: any[] = [];
    
    currencies.forEach(currency => {
      const rows = csvData.filter(r => 
        r.CURRENCY === currency && 
        (!date || r.TIME_PERIOD === date || r.TIME_PERIOD.startsWith(date))
      );
      
      if (rows.length > 0) {
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

  buildHistoryFromCSV(currencies: string[], start: string, end: string): HistoryPoint[] {
    const csvData = this.getCSVData();
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
}

export default CSVService;
