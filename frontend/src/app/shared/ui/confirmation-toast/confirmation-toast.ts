import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type ConfirmationTone = 'warning' | 'danger' | 'neutral';

@Component({
  selector: 'app-confirmation-toast',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './confirmation-toast.html',
  styleUrls: ['./confirmation-toast.css'],
})
export class ConfirmationToastComponent {
  @Input() title = 'Confirm action';
  @Input() message = '';
  @Input() confirmLabel = 'Confirm';
  @Input() cancelLabel = 'Cancel';
  @Input() icon = 'warning';
  @Input() tone: ConfirmationTone = 'warning';
  @Input() autoConfirmSeconds = 10;

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  countdownRemaining = this.autoConfirmSeconds;
  private countdownInterval: ReturnType<typeof window.setInterval> | null = null;
  private hasResolved = false;

  ngOnInit(): void {
    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.clearCountdown();
  }

  onConfirm(): void {
    if (this.hasResolved) return;
    this.hasResolved = true;
    this.clearCountdown();
    this.confirmed.emit();
  }

  onCancel(): void {
    if (this.hasResolved) return;
    this.hasResolved = true;
    this.clearCountdown();
    this.cancelled.emit();
  }

  private startCountdown(): void {
    this.countdownRemaining = Math.max(0, this.autoConfirmSeconds);
    if (this.countdownRemaining === 0) {
      this.onConfirm();
      return;
    }

    this.countdownInterval = window.setInterval(() => {
      this.countdownRemaining = Math.max(0, this.countdownRemaining - 1);
      if (this.countdownRemaining === 0) {
        this.onConfirm();
      }
    }, 1000);
  }

  private clearCountdown(): void {
    if (!this.countdownInterval) return;
    window.clearInterval(this.countdownInterval);
    this.countdownInterval = null;
  }
}
