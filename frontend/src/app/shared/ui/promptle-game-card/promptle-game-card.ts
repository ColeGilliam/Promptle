import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-promptle-game-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatProgressBarModule],
  templateUrl: './promptle-game-card.html',
  styleUrls: ['./promptle-game-card.css']
})
export class PromptleGameCard {
  @Input() loading = false;
  @Input() topic = '';
  @Input() isMultiplayer = false;
  @Input() currentRoom = '';
  @Input() players: { id?: string; name?: string; guesses?: number }[] = [];
}
