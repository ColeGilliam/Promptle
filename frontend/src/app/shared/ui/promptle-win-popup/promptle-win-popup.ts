import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-promptle-win-popup',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './promptle-win-popup.html',
  styleUrls: ['./promptle-win-popup.css']
})
export class PromptleWinPopup {
  @Input() answerName = '';
  @Input() isMultiplayer = false;
  @Input() finishTimeMs: number | null = null;
  @Input() guessCount = 0;
  @Input() guessColors: string[][] = [];   // [[color,...], ...]
  @Input() shareUrl = '';

  @Output() returnHome = new EventEmitter<void>();
  @Output() playAgain  = new EventEmitter<void>();
  @Output() spectate   = new EventEmitter<void>();

  copied = false;

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

  copyShare(): void {
    const emojiGrid = this.guessColors
      .map(row => row.map(c => this.colorToEmoji(c)).join(''))
      .join('\n');

    const time = this.finishTimeMs !== null ? ` · ${this.formatTime(this.finishTimeMs)}` : '';
    const text = `Promptle\n${this.guessCount} guess${this.guessCount === 1 ? '' : 'es'}${time}\n\n${emojiGrid}\n\n${this.shareUrl}`;

    navigator.clipboard.writeText(text).then(() => {
      this.copied = true;
      setTimeout(() => { this.copied = false; }, 2500);
    });
  }

  onReturnHome(): void { this.returnHome.emit(); }
  onPlayAgain():  void { this.playAgain.emit();  }
  onSpectate():   void { this.spectate.emit();   }
}
