import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { animate, style, transition, trigger } from '@angular/animations';
import { Subscription } from 'rxjs';
import { GameTourService } from './game-tour.service';

@Component({
  selector: 'app-game-onboarding-tour',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './game-onboarding-tour.html',
  styleUrls: ['./game-onboarding-tour.css'],
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
export class GameOnboardingTour implements OnInit, OnChanges, OnDestroy {
  /** Which step this instance is responsible for rendering */
  @Input() forStep!: number;
  /** Arrow direction — 'down' means the tail points downward toward the target below */
  @Input() arrowSide: 'up' | 'down' = 'down';

  // Only the first instance (forStep=1) needs these to trigger the tour
  @Input() guessCount = 0;
  @Input() gameReady = false;
  @Input() isSpectating = false;

  step = 0;
  private sub?: Subscription;

  constructor(private tourService: GameTourService) {}

  ngOnInit() {
    this.sub = this.tourService.step$.subscribe(s => this.step = s);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.isSpectating) return;
    if (changes['gameReady'] && this.gameReady) {
      this.tourService.start();
    }
    if (changes['guessCount'] && this.guessCount === 1 && this.step === 1) {
      this.tourService.advance();
    }
  }

  get visible() { return this.step === this.forStep; }

  next() { this.tourService.advance(); }
  skip() { this.tourService.skip(); }

  ngOnDestroy() { this.sub?.unsubscribe(); }
}
