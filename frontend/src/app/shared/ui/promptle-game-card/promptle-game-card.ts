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
  @Input() headers: string[] = [];  // ← add this
  @Input() players: { 
    id?: string; 
    name?: string; 
    guesses?: number;
    colors?: string[];  // ← add this
    won?: boolean;
    isMe?: boolean;       // ← add this
  }[] = [];

  get playerNamesText(): string {
    if (!this.players.length) return 'Waiting for players...';
    return this.players
      .map((player) => player.name?.trim() || 'Unknown')
      .join(', ');
  }
}