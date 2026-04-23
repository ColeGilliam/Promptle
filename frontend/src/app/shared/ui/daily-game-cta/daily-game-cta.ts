import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export const NO_DAILY_GAME_MESSAGE = 'There currently is no game of the day, please check again later!';

@Component({
  selector: 'app-daily-game-cta',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './daily-game-cta.html',
  styleUrls: ['./daily-game-cta.css'],
})
export class DailyGameCtaComponent {
  @Input() gameLabel = 'Game';
  @Input() topic = '';
  @Input() available = false;
  @Input() loading = false;
  @Output() activated = new EventEmitter<void>();

  get buttonLabel(): string {
    if (!this.available || !this.topic.trim()) {
      return NO_DAILY_GAME_MESSAGE;
    }

    return `${this.gameLabel} of the day: ${this.topic.trim()}`;
  }

  onActivate(): void {
    // Do not allow entering a daily game until the pre-generated payload is ready.
    if (!this.available || this.loading) return;
    this.activated.emit();
  }
}
