import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { GameFeedbackCard } from '../game-feedback-card/game-feedback-card';

@Component({
  selector: 'app-promptle-win-popup',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, GameFeedbackCard],
  templateUrl: './promptle-win-popup.html',
  styleUrls: ['./promptle-win-popup.css']
})
export class PromptleWinPopup {
  @Input() answerName = '';
  @Input() topicName = '';
  @Input() isMultiplayer = false;
  @Input() finishTimeMs: number | null = null;
  @Input() guessCount = 0;
  @Input() guessColors: string[][] = [];
  @Input() shareUrl = '';
  @Input() showShareButton = false;
  @Input() shareDisabled = false;
  @Input() shareLoading = false;
  @Input() shareCopied = false;
  @Input() showFeedback = false;
  @Input() feedbackChoice: boolean | null = null;
  @Input() feedbackSubmitting = false;
  @Input() feedbackError = '';
  @Input() playerRankings: { name: string; score: number; guesses: number; finishTimeMs?: number; isMe?: boolean }[] = [];

  @Output() returnHome = new EventEmitter<void>();
  @Output() playAgain  = new EventEmitter<void>();
  @Output() spectate   = new EventEmitter<void>();
  @Output() viewGame   = new EventEmitter<void>();
  @Output() share = new EventEmitter<void>();
  @Output() likedGame = new EventEmitter<void>();
  @Output() dislikedGame = new EventEmitter<void>();

  formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min      = Math.floor(totalSec / 60);
    const sec      = totalSec % 60;
    const tenths   = Math.floor((ms % 1000) / 100);
    return `${min}:${String(sec).padStart(2, '0')}.${tenths}`;
  }

  colorToEmoji(color: string): string {
    if (color === 'green')  return '🟩';
    if (color === 'yellow') return '🟨';
    return '⬛';
  }

  onReturnHome(): void { this.returnHome.emit(); }
  onPlayAgain():  void { this.playAgain.emit();  }
  onSpectate():   void { this.spectate.emit();   }
  onViewGame():   void { this.viewGame.emit();   }
  onShare(): void { this.share.emit(); }
  onLikedGame(): void { this.likedGame.emit(); }
  onDislikedGame(): void { this.dislikedGame.emit(); }
}
