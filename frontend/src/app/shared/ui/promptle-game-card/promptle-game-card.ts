import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-promptle-game-card',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule, MatIconModule, MatProgressBarModule],
  templateUrl: './promptle-game-card.html',
  styleUrls: ['./promptle-game-card.css'],
  animations: [
    trigger('leftPane', [
      state('visible', style({
        opacity: 1,
        transform: 'translateY(0) scale(1)',
        filter: 'blur(0)'
      })),
      state('hidden', style({
        opacity: 0,
        transform: 'translateY(-8px) scale(0.98)',
        filter: 'blur(2px)'
      })),
      transition('visible <=> hidden', [
        animate('220ms cubic-bezier(0.4, 0, 0.2, 1)')
      ])
    ])
  ]
})
export class PromptleGameCard {
  @Input() loading = false;
  @Input() topic = '';
  @Input() isMultiplayer = false;
  @Input() currentRoom = '';
  @Input() headers: string[] = [];
  @Input() players: {
    id?: string;
    name?: string;
    guesses?: number;
    colors?: string[];
    won?: boolean;
    isMe?: boolean;
  }[] = [];

  get playerNamesText(): string {
    if (!this.players.length) return 'Waiting for players...';
    return this.players
      .map((player) => player.name?.trim() || 'Unknown')
      .join(', ');
  }

  leftPanelHidden = false;

  toggleLeftPanel(): void {
    this.leftPanelHidden = !this.leftPanelHidden;
  }
}
