import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-promptle-win-popup',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule],
  templateUrl: './promptle-win-popup.html',
  styleUrls: ['./promptle-win-popup.css']
})
export class PromptleWinPopup {
  @Input() answerName = '';
  @Input() isMultiplayer = false;

  @Output() returnHome = new EventEmitter<void>();
  @Output() playAgain = new EventEmitter<void>();

  onReturnHome(): void {
    this.returnHome.emit();
  }

  onPlayAgain(): void {
    this.playAgain.emit();
  }
}
