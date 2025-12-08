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
  openApiDocs(): void {
    window.open('http://localhost:8000/api/docs', '_blank');
  }
}
