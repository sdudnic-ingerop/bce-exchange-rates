import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-docs-section',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './docs-section.component.html',
  styleUrls: ['./docs-section.component.scss']
})
export class DocsSectionComponent {
  private apiBase = this.getApiBase();

  private getApiBase(): string {
    const win = window as Record<string, any>;
    const windowEnv = win?.['__env'];
    const candidate = windowEnv?.API_BASE || win?.['API_BASE'];
    if (candidate && typeof candidate === 'string') {
      return candidate.replace(/\/$/, '');
    }
    return window.location.origin;
  }

  getApiUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.apiBase}${normalizedPath}`;
  }

  openApiDocs(): void {
    window.open(this.getApiUrl('/api/docs'), '_blank');
  }
}
