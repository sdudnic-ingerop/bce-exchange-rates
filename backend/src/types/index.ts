// Type definitions
export interface ExchangeRate {
  currency: string;
  rate: number;
  flag: string;
}

export interface ExchangeResponse {
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

export interface HistoryPoint {
  currency: string;
  date: string;
  rate: number;
}

export interface CSVRow {
  CURRENCY: string;
  TIME_PERIOD: string;
  OBS_VALUE: string;
}

export interface ExchangeQuerystring {
  currencies?: string;
  date?: string;
}

export interface HistoryQuerystring {
  currencies?: string;
  start?: string;
  end?: string;
}
