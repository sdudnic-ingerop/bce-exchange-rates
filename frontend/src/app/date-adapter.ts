import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';
import { MatDateFormats, MAT_DATE_FORMATS } from '@angular/material/core';

@Injectable()
export class FrenchDateAdapter extends NativeDateAdapter {
  override format(date: Date, displayFormat: string): string {
    if (!date) {
      return '';
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    switch (displayFormat) {
      case 'input':
      case 'parse':
        return `${day}/${month}/${year}`;
      case 'year':
        return String(year);
      case 'month':
        return this.getMonthNames('long')[date.getMonth()];
      case 'monthyear':
        return `${this.getMonthNames('long')[date.getMonth()]} ${year}`;
      default:
        return `${day}/${month}/${year}`;
    }
  }

  override parse(value: any): Date | null {
    if (typeof value === 'string') {
      // Support dd/mm/yyyy format
      const parts = value.trim().split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);

        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          // Create date in local time, not UTC
          return new Date(year, month - 1, day);
        }
      }
    }
    return super.parse(value);
  }
}

export const FRENCH_DATE_FORMATS: MatDateFormats = {
  parse: {
    dateInput: 'dd/MM/yyyy'
  },
  display: {
    dateInput: 'dd/MM/yyyy',
    monthYearLabel: 'MMM yyyy',
    dateA11yLabel: 'DD/MM/YYYY',
    monthYearA11yLabel: 'MMMM yyyy'
  }
};
