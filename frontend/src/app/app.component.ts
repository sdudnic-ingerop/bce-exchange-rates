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
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

interface ExchangeRate {
  currency: string;
  rate: number;
  flag: string;
}

interface HistoryPoint {
  currency: string;
  date: string;
  rate: number;
}

interface ExchangeResponse {
  status: string;
  date: string;
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
    MatButtonModule
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
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
  
  // State
  selectedCurrencies: string[] = ['CHF', 'MXN'];
  selectedDate: string = '';
  selectedPeriod: string = 'Année';
  currencyFilter: string = '';
  currentView: 'home' | 'docs' = 'home';
  
  // Data
  exchangeRates: ExchangeRate[] = [];
  historyData: HistoryPoint[] = [];
  
  // UI State
  loading: boolean = false;
  error: string | null = null;
  
  // Chart
  chart: Chart | null = null;
  chartRetryCount: number = 0;
  private viewInitialized: boolean = false;
  
  ngOnInit() {
    // Set date to Friday (5 days back from Sunday, 3 from Saturday, 2 from Friday)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sunday, 6=Saturday
    let daysBack = 0;
    
    if (dayOfWeek === 0) daysBack = 2; // Sunday -> Friday
    else if (dayOfWeek === 6) daysBack = 1; // Saturday -> Friday
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysBack);
    this.selectedDate = targetDate.toISOString().split('T')[0];
  }
  
  ngAfterViewInit() {
    this.viewInitialized = true;
    // Load data with the pre-calculated date
    setTimeout(() => {
      console.log('Loading data for date:', this.selectedDate);
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
  get filteredCurrencies(): string[] {
    const filter = this.currencyFilter.toUpperCase();
    return this.availableCurrencies.filter(c => 
      c.includes(filter) && !this.selectedCurrencies.includes(c)
    );
  }
  
  addCurrency(currency: string) {
    const upperCurrency = currency.toUpperCase().trim();
    if (upperCurrency && 
        this.availableCurrencies.includes(upperCurrency) && 
        !this.selectedCurrencies.includes(upperCurrency)) {
      this.selectedCurrencies.push(upperCurrency);
      this.currencyFilter = '';
      if (this.selectedDate) {
        this.fetchRatesWithValidation();
      }
    }
  }
  
  removeCurrency(currency: string) {
    const index = this.selectedCurrencies.indexOf(currency);
    if (index >= 0) { && this.selectedDate) {
        this.fetchRatesWithValidationencies.splice(index, 1);
      if (this.selectedCurrencies.length > 0) {
        this.fetchRates();
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
    this.addCurrency(currency);
  }
  
  // Date Selection
  onDateChange() {
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
    const dateParam = this.selectedDate ? `&date=${this.selectedDate}` : '';
    const url = this.buildApiUrl(`/api/bce-exchange?currencies=${currencies}${dateParam}`);
    
    console.log('Fetching from URL:', url);
    
    this.http.get<ExchangeResponse>(url).subscribe({
      next: (data) => {
        console.log('API Response:', data);
        if (data.status === 'error') {
          this.error = `Aucune donnée disponible pour le ${this.selectedDate}. Les données ECB peuvent ne pas être disponibles le weekend ou les jours fériés.`;
          this.exchangeRates = [];
          this.historyData = [];
        } else {
          this.error = null;
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
  
  // API Calls
  fetchRates() {
    if (this.selectedCurrencies.length === 0) {
      this.error = 'Veuillez sélectionner au moins une devise';
      return;
    }
    
    this.loading = true;
    this.error = null;
    
    const currencies = this.selectedCurrencies.join(',');
    const dateParam = this.selectedDate ? `&date=${this.selectedDate}` : '';
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
  
  fetchHistory() {
    const endDate = this.selectedDate || new Date().toISOString().split('T')[0];
    const startDate = this.calculateStartDate(endDate);
    
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
  
  calculateStartDate(endDate: string): string {
    const end = new Date(endDate);
    let days = 365; // Default: Année
    
    if (this.selectedPeriod === 'Mois') days = 30;
    else if (this.selectedPeriod === 'Trimestre') days = 90;
    
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    return start.toISOString().split('T')[0];
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
        pointRadius: 2,
        pointHoverRadius: 5
      };
    });
    
    // Build Y axes
    const yAxes: any = {};
    const showAxes = this.selectedCurrencies.length <= 3;
    
    this.selectedCurrencies.forEach((currency, index) => {
      const currencyData = datasetsByCurrency[currency] || [];
      const rates = currencyData.map(p => p.rate);
      const min = Math.min(...rates);
      const max = Math.max(...rates);
      const padding = (max - min) * 0.05;
      
      yAxes[`y${index}`] = {
        type: 'linear',
        display: showAxes,
        position: index % 2 === 0 ? 'left' : 'right',
        title: {
          display: showAxes,
          text: currency
        },
        min: min - padding,
        max: max + padding,
        grid: {
          drawOnChartArea: index === 0
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
    
    const date = this.exchangeRates.length > 0 ? 
      (this.selectedDate || new Date().toISOString().split('T')[0]) : '';
    
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
    
    const date = this.selectedDate || new Date().toISOString().split('T')[0];
    let csv = 'Devise,Taux (EUR),Date\n';
    this.exchangeRates.forEach(rate => {
      csv += `${rate.currency},${rate.rate.toFixed(4)},${date}\n`;
    });
    return csv;
  }
  
  // Navigation
  navigateTo(view: 'home' | 'docs') {
    this.currentView = view;
    if (view === 'home') {
      setTimeout(() => this.updateChart(), 100);
    }
  }
  
  // Helper methods
  getRateDate(): string {
    return this.selectedDate || new Date().toISOString().split('T')[0];
  }
  
  getFlagUrl(flag: string): string {
    return `https://flagcdn.com/24x18/${flag}.png`;
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
