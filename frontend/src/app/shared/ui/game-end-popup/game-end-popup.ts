import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { GameFeedbackCard } from '../game-feedback-card/game-feedback-card';

export interface GameEndPopupStat {
  icon: string;
  label: string;
}

export interface GameEndPopupRecapRow {
  colors: string[];
}

@Component({
  selector: 'app-game-end-popup',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, GameFeedbackCard],
  templateUrl: './game-end-popup.html',
  styleUrls: ['./game-end-popup.css'],
})
export class GameEndPopup {
  @Input() accent: 'success' | 'revealed' = 'success';
  @Input() title = 'Victory!';
  @Input() summary = '';
  @Input() detail = '';
  @Input() stats: GameEndPopupStat[] = [];
  @Input() recapRows: GameEndPopupRecapRow[] = [];
  @Input() viewLabel = 'View Game';
  @Input() playAgainLabel = 'Play Again';
  @Input() shareText = '';
  @Input() showFeedback = false;
  @Input() feedbackChoice: boolean | null = null;
  @Input() feedbackSubmitting = false;
  @Input() feedbackError = '';

  @Output() returnHome = new EventEmitter<void>();
  @Output() playAgain = new EventEmitter<void>();
  @Output() viewGame = new EventEmitter<void>();
  @Output() likedGame = new EventEmitter<void>();
  @Output() dislikedGame = new EventEmitter<void>();

  copied = false;

  get titleIcon(): string {
    return this.accent === 'success' ? 'emoji_events' : 'visibility';
  }

  copyShare(): void {
    if (!this.shareText.trim()) return;

    navigator.clipboard.writeText(this.shareText).then(() => {
      this.copied = true;
      setTimeout(() => {
        this.copied = false;
      }, 2500);
    });
  }

  onReturnHome(): void { this.returnHome.emit(); }
  onPlayAgain(): void { this.playAgain.emit(); }
  onViewGame(): void { this.viewGame.emit(); }
  onLikedGame(): void { this.likedGame.emit(); }
  onDislikedGame(): void { this.dislikedGame.emit(); }
}
