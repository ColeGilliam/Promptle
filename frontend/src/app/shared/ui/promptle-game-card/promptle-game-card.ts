import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, AfterViewChecked, OnChanges, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-promptle-game-card',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatProgressBarModule],
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
export class PromptleGameCard implements AfterViewChecked, OnChanges {
  @ViewChild('chatScroll') private chatScrollRef?: ElementRef<HTMLDivElement>;

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
    finishTime?: string;
    finishTimeMs?: number;
    score?: number;
  }[] = [];
  @Input() chatMessages: {senderName: string; text: string; isMe: boolean}[] = [];
  @Output() chatSend = new EventEmitter<string>();

  get leaderId(): string | undefined {
    const winners = this.players
      .filter(p => p.won && p.score != null)
      .sort((a, b) => (b.score! - a.score!) || ((a.finishTimeMs ?? Infinity) - (b.finishTimeMs ?? Infinity)));
    return winners[0]?.id;
  }

  get playerNamesText(): string {
    if (!this.players.length) return 'Waiting for players...';
    return this.players
      .map((player) => player.name?.trim() || 'Unknown')
      .join(', ');
  }

  chatOpen = false;
  chatInput = '';
  private chatNeedsScroll = false;

  toggleChat(): void {
    this.chatOpen = !this.chatOpen;
  }

  sendChat(): void {
    const text = this.chatInput.trim();
    if (!text) return;
    this.chatInput = '';
    this.chatSend.emit(text);
  }

  ngAfterViewChecked() {
    if (this.chatNeedsScroll && this.chatScrollRef) {
      const el = this.chatScrollRef.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.chatNeedsScroll = false;
    }
  }

  ngOnChanges() {
    if (this.chatMessages.length) {
      this.chatNeedsScroll = true;
    }
  }
}
