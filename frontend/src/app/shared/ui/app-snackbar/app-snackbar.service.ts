import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AppSnackbarComponent,
  AppSnackbarData,
  AppSnackbarTone,
} from './app-snackbar';

export interface SnackbarMessageOptions {
  message: string;
  tone?: AppSnackbarTone;
  icon?: string;
  durationMs?: number;
}

@Injectable({ providedIn: 'root' })
export class AppSnackbarService {
  private readonly snackBar = inject(MatSnackBar);

  show(input: string | SnackbarMessageOptions): void {
    const options = typeof input === 'string' ? { message: input } : input;
    const data: AppSnackbarData = {
      tone: options.tone ?? 'info',
      icon: options.icon,
      message: options.message,
    };

    this.open(data, options.durationMs ?? 3000);
  }

  success(message: string): void {
    this.show({ message, tone: 'success', icon: 'check_circle' });
  }

  error(message: string): void {
    this.show({ message, tone: 'danger', icon: 'error', durationMs: 4500 });
  }

  private open(data: AppSnackbarData, durationMs: number): void {
    this.snackBar.dismiss();
    this.snackBar.openFromComponent(AppSnackbarComponent, {
      data,
      duration: durationMs,
      horizontalPosition: 'right',
      verticalPosition: 'bottom',
      panelClass: 'app-snackbar-panel',
    });
  }
}
