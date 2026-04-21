import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-game-feedback-card',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './game-feedback-card.html',
  styleUrls: ['./game-feedback-card.css'],
})
export class GameFeedbackCard {
  @Input() title = 'Did you like this game?';
  @Input() submittedChoice: boolean | null = null;
  @Input() submitting = false;
  @Input() error = '';

  @Output() liked = new EventEmitter<void>();
  @Output() disliked = new EventEmitter<void>();

  get hasSubmitted(): boolean {
    return this.submittedChoice !== null;
  }

  onLiked(): void {
    if (this.submitting || this.hasSubmitted) return;
    this.liked.emit();
  }

  onDisliked(): void {
    if (this.submitting || this.hasSubmitted) return;
    this.disliked.emit();
  }
}
