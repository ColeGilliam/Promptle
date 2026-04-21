import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { animate, style, transition, trigger } from '@angular/animations';
import { SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-game-hint-bubble',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './game-hint-bubble.html',
  styleUrls: ['./game-hint-bubble.css'],
  animations: [
    trigger('bubble', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(8px) scale(0.96)' }),
        animate('240ms cubic-bezier(0.2, 0, 0, 1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' }))
      ]),
      transition(':leave', [
        animate('160ms ease-in', style({ opacity: 0, transform: 'translateY(6px) scale(0.97)' }))
      ])
    ])
  ]
})
export class GameHintBubble {
  @Input() icon = 'lightbulb';
  @Input() message = '';
  @Input() arrowSide: 'up' | 'down' = 'down';
  @Input() show = false;
  @Output() dismissed = new EventEmitter<void>();

  constructor(private settings: SettingsService) {}

  get visible() {
    return this.show && this.settings.getHints();
  }

  dismiss() {
    this.dismissed.emit();
  }
}
