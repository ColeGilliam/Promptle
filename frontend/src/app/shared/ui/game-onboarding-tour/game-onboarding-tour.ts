import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { animate, style, transition, trigger } from '@angular/animations';
import { Subscription } from 'rxjs';
import { GameTourService } from './game-tour.service';

const STEP3_TIMEOUT_MS = 6000;

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
  @Input() forStep!: number;
  @Input() arrowSide: 'up' | 'down' = 'down';
  @Input() align: 'left' | 'center' | 'right' = 'center';

  @Input() guessCount = 0;
  @Input() gameReady = false;
  @Input() isSpectating = false;

  step = 0;
  private sub?: Subscription;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private tourService: GameTourService) {}

  ngOnInit() {
    this.sub = this.tourService.step$.subscribe(s => {
      this.step = s;
      this.clearTimer();
      // Start 6s timer when step 3 becomes active
      if (s === 3 && this.forStep === 3) {
        this.timer = setTimeout(() => this.tourService.skip(), STEP3_TIMEOUT_MS);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.isSpectating) return;

    // Start the tour when the game is ready
    if (changes['gameReady'] && this.gameReady) {
      this.tourService.start();
    }

    if (changes['guessCount']) {
      // After 1 guess move to step 2
      if (this.guessCount >= 1 && this.step === 1) {
        this.tourService.advance();
      }
      // After 3 guesses move to step 3
      if (this.guessCount >= 3 && this.step === 2) {
        this.tourService.advance();
      }
    }
  }

  get visible() { return this.step === this.forStep; }

  next() { this.tourService.advance(); }
  skip() { this.tourService.skip(); }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.clearTimer();
  }
}
