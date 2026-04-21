import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-load-saved-game-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './load-saved-game-card.html',
  styleUrls: ['./load-saved-game-card.css']
})
export class LoadSavedGameCard {
  @Input() topic: string | null = null;
  @Input() savedAt: string | null = null;
  @Input() showCancel = false;
  @Input() secondaryActionLabel = 'Restart Game';

  @Output() continueClicked = new EventEmitter<void>();
  @Output() cancelClicked = new EventEmitter<void>();
  @Output() restartClicked = new EventEmitter<void>();
  @Output() deleteClicked = new EventEmitter<void>();

  onContinueClicked(): void {
    this.continueClicked.emit();
  }

  onCancelClicked(): void {
    this.cancelClicked.emit();
  }

  onRestartClicked(): void {
    this.restartClicked.emit();
  }

  onDeleteClicked(): void {
    this.deleteClicked.emit();
  }
}
