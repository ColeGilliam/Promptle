import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';

export type AppSnackbarTone = 'info' | 'success' | 'warning' | 'danger';

export interface AppSnackbarData {
  message: string;
  tone?: AppSnackbarTone;
  icon?: string;
}

@Component({
  selector: 'app-snackbar',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './app-snackbar.html',
  styleUrls: ['./app-snackbar.css'],
})
export class AppSnackbarComponent {
  readonly data = inject(MAT_SNACK_BAR_DATA) as AppSnackbarData;

  get icon(): string {
    if (this.data.icon) return this.data.icon;

    switch (this.data.tone ?? 'info') {
      case 'success':
        return 'check_circle';
      case 'warning':
        return 'warning';
      case 'danger':
        return 'error';
      default:
        return 'info';
    }
  }
}
