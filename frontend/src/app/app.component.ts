import { Component, OnInit, ViewChild, ElementRef, inject, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule, DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { FrenchDateAdapter, FRENCH_DATE_FORMATS } from './date-adapter';
import { DocsSectionComponent } from './docs-section/docs-section.component';

Chart.register(...registerables);

interface ExchangeRate {
  currency: string;
  rate: number;
  flag: string;
  date?: string;
}

interface HistoryPoint {
  currency: string;
  date: string;
  rate: number;
}

interface ExchangeResponse {
  status: string;
  // `ratesUpdateDate` is the canonical field name for the API response date.
  // No fallback to `date` — server must return `ratesUpdateDate`.
  ratesUpdateDate: string;
  base: string;
  rates: ExchangeRate[];
  message?: string;
}

interface HistoryResponse {
  status: string;
  start: string;
  end: string;
  data: HistoryPoint[];
  message?: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatChipsModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTooltipModule,
    DocsSectionComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  providers: [
    { provide: DateAdapter, useClass: FrenchDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: FRENCH_DATE_FORMATS }
  ]
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('ratesChart', { static: false }) chartCanvas?: ElementRef<HTMLCanvasElement>;

  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  
  // API Configuration
  private apiBase = this.getApiBase();
  
  // Available currencies
  availableCurrencies = [
    'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK',
    'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RUB', 'TRY', 'BRL', 'CNY',
    'HKD', 'IDR', 'ILS', 'INR', 'KRW', 'MXN', 'MYR', 'PHP', 'SGD', 'THB', 'ZAR'
  ];

  // Map currency code to French country name (used for search by country)
  currencyToCountry: { [code: string]: string } = {
    'USD': 'États-Unis',
    'GBP': 'Royaume-Uni',
    'CHF': 'Suisse',
    'JPY': 'Japon',
    'CAD': 'Canada',
    'AUD': 'Australie',
    'NZD': 'Nouvelle-Zélande',
    'SEK': 'Suède',
    'NOK': 'Norvège',
    'DKK': 'Danemark',
    'PLN': 'Pologne',
    'CZK': 'République Tchèque',
    'HUF': 'Hongrie',
    'RON': 'Roumanie',
    'BGN': 'Bulgarie',
    'HRK': 'Croatie',
    'RUB': 'Russie',
    'TRY': 'Turquie',
    'BRL': 'Brésil',
    'CNY': 'Chine',
    'HKD': 'Hong Kong',
    'IDR': 'Indonésie',
    'ILS': 'Israël',
    'INR': 'Inde',
    'KRW': 'Corée du Sud',
    'MXN': 'Mexique',
    'MYR': 'Malaisie',
    'PHP': 'Philippines',
    'SGD': 'Singapour',
    'THB': 'Thaïlande',
    'ZAR': 'Afrique du Sud'
  };
  
  // State
  selectedCurrencies: string[] = ['CHF', 'MXN'];
  selectedDate: Date | null = null;
  maxDate: Date = new Date();
  selectedPeriod: string = 'Année';
  currencyFilter: string = '';
  currentView: 'home' | 'docs' = 'home';
  docsUrl: string = '';
  
  // Data
  exchangeRates: ExchangeRate[] = [];
  historyData: HistoryPoint[] = [];
  
  // UI State
  loading: boolean = false;
  error: string | null = null;
  apiResponseExample: string = '';
  
  // Chart
  chart: Chart | null = null;
  chartRetryCount: number = 0;
  private viewInitialized: boolean = false;
  private isInitializing: boolean = true;
  
  ngOnInit() {
    // Set maxDate to today
    this.maxDate = new Date();
    
    // selectedDate starts as null (will fetch latest available)
    
    // Set docs URL
    this.docsUrl = this.buildApiUrl('/docs');
    
    console.log('Initial state: no specific date selected, will fetch latest available');
  }
  
  ngAfterViewInit() {
    this.viewInitialized = true;
    this.isInitializing = false;
    
    // Load data with the initial selected date
    setTimeout(() => {
      console.log('Starting data load with date:', this.formatDateForDisplay(this.selectedDate));
      this.fetchRatesWithValidation();
    }, 0);
  }
  
  private getApiBase(): string {
    const win = window as Record<string, any>;
    const windowEnv = win?.['__env'];
    const candidate = windowEnv?.API_BASE || win?.['API_BASE'];
    if (candidate && typeof candidate === 'string') {
      return candidate.replace(/\/$/, '');
    }
    return '';
  }

  private buildApiUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (!this.apiBase) {
      return normalizedPath;
    }
    return `${this.apiBase}${normalizedPath}`;
  }
  
  // Currency Selection Methods
  // Returns filtered options based on search
  get filteredCurrencies(): string[] {
    const filter = (this.currencyFilter || '').trim().toLowerCase();
    if (!filter) {
      // Return all available currencies not yet selected
      return this.availableCurrencies.filter(c => !this.selectedCurrencies.includes(c));
    }

    // Filter by currency code or French country name
    return this.availableCurrencies.filter(c => {
      if (this.selectedCurrencies.includes(c)) return false;
      const country = this.currencyToCountry[c] || '';
      return c.toLowerCase().includes(filter) || country.toLowerCase().includes(filter);
    });
  }
  
  addCurrency(currency: string) {
    const upperCurrency = currency.toUpperCase().trim();
    if (upperCurrency && 
        this.availableCurrencies.includes(upperCurrency) && 
        !this.selectedCurrencies.includes(upperCurrency)) {
      this.selectedCurrencies.push(upperCurrency);
      this.currencyFilter = '';
      this.fetchRatesWithValidation();
    }
  }
  
  removeCurrency(currency: string) {
    const index = this.selectedCurrencies.indexOf(currency);
    if (index >= 0) {
      this.selectedCurrencies.splice(index, 1);
      if (this.selectedCurrencies.length > 0) {
        this.fetchRatesWithValidation();
      } else {
        this.error = 'Veuillez sélectionner au moins une devise';
        this.exchangeRates = [];
        this.historyData = [];
      }
    }
  }
  
  onCurrencyInput(event: any) {
    const value = event.target.value;
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addCurrency(value);
    }
  }
  
  selectCurrency(currency: string) {
    // currency is the currency code (e.g., 'CHF')
    const code = currency.toUpperCase().trim();
    if (this.availableCurrencies.includes(code) && !this.selectedCurrencies.includes(code)) {
      this.selectedCurrencies = [...this.selectedCurrencies, code];
      this.currencyFilter = '';
      this.fetchRatesWithValidation();
    }
  }
  
  // Date Selection
  onDateChange() {
    // Skip during initialization to avoid unwanted API calls
    if (this.isInitializing) return;
    
    // Validate date availability when user changes it
    this.fetchRatesWithValidation();
  }
  
  private fetchRatesWithValidation() {
    if (this.selectedCurrencies.length === 0) {
      this.error = 'Veuillez sélectionner au moins une devise';
      return;
    }
    
    this.loading = true;
    this.error = null;
    
    const currencies = this.selectedCurrencies.join(',');
    // If a date is selected, use it; otherwise, don't specify a date (will get latest)
    const dateParam = this.selectedDate ? `&date=${this.formatDateForApi(this.selectedDate)}` : '';
    const url = this.buildApiUrl(`/api/bce-exchange?currencies=${currencies}${dateParam}`);
    
    console.log('Fetching from:', url);
    
    this.http.get<ExchangeResponse>(url).subscribe({
      next: (data) => {
        console.log('API Response:', data);
        if (data.status === 'error') {
          this.error = `Erreur: ${data.message}`;
          this.exchangeRates = [];
          this.historyData = [];
        } else {
          // Update selectedDate to the actual date returned if not already set
          // if (!this.selectedDate) {
          //   const returnedDate = new Date(data.date);
          //   this.selectedDate = returnedDate;
          // }
          this.error = null;
          this.exchangeRates = data.rates;
          // Attach the response date to each rate
          // Attach the response date to each rate (server must provide `ratesUpdateDate`)
          const responseDate = (data as any).ratesUpdateDate;
          this.exchangeRates.forEach(rate => {
            rate.date = responseDate;
          });
          this.updateApiResponseExample();
          console.log('Exchange rates loaded for date:', responseDate, this.exchangeRates);
          this.fetchHistory(responseDate);
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('API Error:', err);
        this.error = `Erreur lors de la récupération des données: ${err.message}`;
        this.exchangeRates = [];
        this.loading = false;
      }
    });
  }
  
  // API Calls
  fetchRates() {
    if (this.selectedCurrencies.length === 0) {
      this.error = 'Veuillez sélectionner au moins une devise';
      return;
    }
    
    this.loading = true;
    this.error = null;
    
    const currencies = this.selectedCurrencies.join(',');
    const dateStr = this.formatDateForApi(this.selectedDate);
    const dateParam = dateStr ? `&date=${dateStr}` : '';
    const url = this.buildApiUrl(`/api/bce-exchange?currencies=${currencies}${dateParam}`);
    
    console.log('Fetching from URL:', url);
    
    this.http.get<ExchangeResponse>(url).subscribe({
      next: (data) => {
        console.log('API Response:', data);
        if (data.status === 'error') {
          this.error = `Erreur lors de la récupération des données: ${data.message}`;
          this.exchangeRates = [];
        } else {
          this.exchangeRates = data.rates;
          console.log('Exchange rates loaded:', this.exchangeRates);
          this.fetchHistory();
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('API Error:', err);
        this.error = `Erreur lors de la récupération des données: ${err.message}`;
        this.exchangeRates = [];
        this.loading = false;
      }
    });
  }
  
  fetchHistory(dateStr?: string) {
    let targetDate: Date | null = this.selectedDate;
    
    if (dateStr) {
      targetDate = this.parseDate(dateStr);
    }
    
    if (!targetDate) return;
    
    const endDate = this.formatDateForApi(targetDate);
    const startDate = this.calculateStartDate(targetDate);
    
    const currencies = this.selectedCurrencies.join(',');
    const url = this.buildApiUrl(`/api/bce-exchange/history?currencies=${currencies}&start=${startDate}&end=${endDate}`);
    
    this.http.get<HistoryResponse>(url).subscribe({
      next: (data) => {
        if (data.status === 'error') {
          console.error('Error fetching history:', data.message);
          this.historyData = [];
        } else {
          this.historyData = data.data;
          this.cdr.detectChanges();
          setTimeout(() => this.updateChart(), 200);
        }
      },
      error: (err) => {
        console.error('Error fetching history:', err);
        this.historyData = [];
      }
    });
  }
  
  calculateStartDate(endDate: Date): string {
    let days = 365; // Default: Année
    
    if (this.selectedPeriod === 'Mois') days = 30;
    else if (this.selectedPeriod === 'Trimestre') days = 90;
    
    const start = new Date(endDate);
    start.setDate(start.getDate() - days);
    return this.formatDateForApi(start);
  }
  
  // Period Selection
  onPeriodChange() {
    this.fetchHistory();
  }
  
  // Chart Methods
  updateChart() {
    if (this.currentView !== 'home' || !this.viewInitialized) return;
    
    const canvas = this.chartCanvas?.nativeElement;
    if (!canvas) {
      this.chartRetryCount++;
      if (this.chartRetryCount < 5) {
        setTimeout(() => this.updateChart(), 500);
      }
      return;
    }
    
    this.chartRetryCount = 0;
    
    // Destroy existing chart
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    
    // Prepare data by currency
    const datasetsByCurrency: { [key: string]: { date: string, rate: number }[] } = {};
    this.historyData.forEach(point => {
      if (!datasetsByCurrency[point.currency]) {
        datasetsByCurrency[point.currency] = [];
      }
      datasetsByCurrency[point.currency].push({ date: point.date, rate: point.rate });
    });
    
    // Get unique dates
    const allDates = [...new Set(this.historyData.map(p => p.date))].sort();
    const displayLabels = this.filterLabelsToMonths(allDates);
    
    // Colors for chart lines
    const colors = [
      { bg: 'rgba(52, 152, 219, 0.16)', border: 'rgba(52, 152, 219, 1)' },  // Blue
      { bg: 'rgba(231, 76, 60, 0.16)', border: 'rgba(231, 76, 60, 1)' },    // Red
      { bg: 'rgba(46, 204, 113, 0.16)', border: 'rgba(46, 204, 113, 1)' },  // Green
      { bg: 'rgba(155, 89, 182, 0.16)', border: 'rgba(155, 89, 182, 1)' },  // Purple
      { bg: 'rgba(241, 196, 15, 0.16)', border: 'rgba(241, 196, 15, 1)' }   // Yellow
    ];
    
    // Build datasets
    const datasets = this.selectedCurrencies.map((currency, index) => {
      const currencyData = datasetsByCurrency[currency] || [];
      const data = allDates.map(date => {
        const point = currencyData.find(p => p.date === date);
        return point ? point.rate : null;
      });
      
      const color = colors[index % colors.length];
      
      return {
        label: currency,
        data: data,
        borderColor: color.border,
        backgroundColor: color.bg,
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        yAxisID: `y${index}`,
        pointRadius: 0,
        pointHoverRadius: 5
      };
    });
    
    // Build Y axes - Adaptive based on number of currencies
    const yAxes: any = {};
    const numCurrencies = this.selectedCurrencies.length;
    
    // Determine display strategy based on number of currencies
    // 1-3 currencies: Show all axes with labels
    // 4+ currencies: Hide axes but keep independent scales for accurate visualization
    const showAxes = numCurrencies <= 3;
    
    this.selectedCurrencies.forEach((currency, index) => {
      const currencyData = datasetsByCurrency[currency] || [];
      const rates = currencyData.map(p => p.rate);
      
      if (rates.length === 0) return;
      
      const min = Math.min(...rates);
      const max = Math.max(...rates);
      const padding = (max - min) * 0.05 || 0.01; // Fallback padding if min === max
      
      yAxes[`y${index}`] = {
        type: 'linear',
        display: showAxes,
        position: index % 2 === 0 ? 'left' : 'right',
        title: {
          display: showAxes,
          text: `${currency} (${min.toFixed(2)} - ${max.toFixed(2)})`
        },
        min: min - padding,
        max: max + padding,
        grid: {
          drawOnChartArea: index === 0 // Only first axis draws grid lines
        },
        ticks: {
          display: showAxes,
          callback: function(value: any) {
            return typeof value === 'number' ? value.toFixed(4) : value;
          }
        }
      };
    });
    
    // Chart configuration
    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: allDates,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12
          }
        },
        scales: {
          ...yAxes,
          x: {
            ticks: {
              callback: (value: any, index: number) => {
                const date = allDates[index];
                return displayLabels.includes(date) ? date.substring(5) : '';
              },
              maxRotation: 45,
              minRotation: 45
            }
          }
        }
      }
    };
    
    this.chart = new Chart(canvas, config);
  }
  
  // CSV Export
  exportCSV() {
    if (this.exchangeRates.length === 0) return;
    
    const date = this.formatDateForApi(this.selectedDate);
    
    let csv = 'Devise,Taux (EUR),Date\n';
    this.exchangeRates.forEach(rate => {
      csv += `${rate.currency},${rate.rate.toFixed(4)},${date}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `exchange_rates_${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  getCSVOutput(): string {
    if (this.exchangeRates.length === 0) return '';
    
    const date = this.formatDateForApi(this.selectedDate);
    let csv = 'Devise,Taux (EUR),Date\n';
    this.exchangeRates.forEach(rate => {
      csv += `${rate.currency},${rate.rate.toFixed(4)},${date}\n`;
    });
    return csv;
  }
  
  getApiRequestUrl(): string {
    const currencies = this.selectedCurrencies.join(',');
    const date = this.formatDateForApi(this.selectedDate);
    const baseUrl = this.apiBase ? `${this.apiBase}/api/bce-exchange` : '/api/bce-exchange';
    return `${baseUrl}?currencies=${currencies}&date=${date}`;
  }
  updateApiResponseExample() {
    if (this.exchangeRates.length === 0) {
      this.apiResponseExample = '';
      return;
    }
    
    const response = {
      status: 'success',
      // Use `ratesUpdateDate` as the canonical field in examples
      ratesUpdateDate: this.formatDateForApi(this.selectedDate) || this.exchangeRates[0]?.date || '',
      base: 'EUR',
      rates: this.exchangeRates.map(rate => ({
        currency: rate.currency,
        rate: rate.rate,
        flag: rate.flag
      })),
      source: 'European Central Bank (ECB)',
      referenceBase: 'EUR',
      queriedAt: new Date().toISOString()
    };
    
    this.apiResponseExample = JSON.stringify(response, null, 2);
  }
  
  // Navigation
  navigateTo(view: 'home' | 'docs') {
    this.currentView = view;
    if (view === 'home') {
      setTimeout(() => this.updateChart(), 100);
    }
  }
  
  // Open Scalar API Documentation
  openApiDocs() {
    window.open('/api/docs', '_blank');
  }
  
  // Helper methods
  getRateDate(): string {
    return this.formatDateForApi(this.selectedDate);
  }
  
  formatDateForApi(date: Date | null | undefined): string {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  formatDateForDisplay(date: Date | null | undefined): string {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}/${month}/${year}`; // French format: dd/mm/yyyy
  }

  parseDate(dateString: string): Date {
    if (!dateString) return new Date();
    return new Date(dateString + 'T00:00:00Z');
  }
  
  getFlagUrl(flag: string): string {
    return `https://flagcdn.com/24x18/${flag}.png`;
  }

  getCurrencyFlag(currency: string): string {
    // Map currencies to flag codes
    const flagMap: { [key: string]: string } = {
      'USD': 'us',
      'GBP': 'gb',
      'CHF': 'ch',
      'JPY': 'jp',
      'CAD': 'ca',
      'AUD': 'au',
      'NZD': 'nz',
      'SEK': 'se',
      'NOK': 'no',
      'DKK': 'dk',
      'PLN': 'pl',
      'CZK': 'cz',
      'HUF': 'hu',
      'RON': 'ro',
      'BGN': 'bg',
      'HRK': 'hr',
      'RUB': 'ru',
      'TRY': 'tr',
      'BRL': 'br',
      'CNY': 'cn',
      'HKD': 'hk',
      'IDR': 'id',
      'ILS': 'il',
      'INR': 'in',
      'KRW': 'kr',
      'MXN': 'mx',
      'MYR': 'my',
      'PHP': 'ph',
      'SGD': 'sg',
      'THB': 'th',
      'ZAR': 'za'
    };
    return flagMap[currency] || 'eu';
  }

  private filterLabelsToMonths(dates: string[]): string[] {
    const monthlyLabels: string[] = [];
    let lastMonth = '';
    
    dates.forEach(date => {
      const month = date.substring(0, 7); // YYYY-MM
      if (month !== lastMonth) {
        monthlyLabels.push(date);
        lastMonth = month;
      }
    });
    
    return monthlyLabels;
  }
}
