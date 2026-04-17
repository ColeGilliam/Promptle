import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { TeamMember } from './about-team-carousel.models';

@Component({
  selector: 'app-about-team-carousel',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule, MatIconModule],
  templateUrl: './about-team-carousel.html',
  styleUrl: './about-team-carousel.css',
})
export class AboutTeamCarouselComponent implements OnChanges, OnDestroy {
  @Input() members: TeamMember[] = [];

  readonly githubPath =
    'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';
  readonly linkedinPath =
    'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z';

  activeIndex = 0;
  trackIndex = 2;
  noTransition = false;
  isAnimating = false;

  private resetFrame: number | null = null;
  private readonly slideWidth = 100 / 3;
  private readonly peekWidth = (100 - this.slideWidth) / 2;

  get displayMembers(): TeamMember[] {
    if (this.members.length === 0) return [];

    return [
      this.getMember(-2),
      this.getMember(-1),
      ...this.members,
      this.getMember(0),
      this.getMember(1),
    ];
  }

  get trackTransform(): string {
    return `translateX(calc(${this.peekWidth - this.trackIndex * this.slideWidth}%))`;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['members']) return;

    if (this.members.length < 2) {
      this.activeIndex = 0;
      this.trackIndex = 2;
      this.noTransition = false;
      this.isAnimating = false;
      return;
    }

    this.activeIndex = Math.min(this.activeIndex, this.members.length - 1);
    this.trackIndex = this.activeIndex + 2;
    this.noTransition = false;
    this.isAnimating = false;
  }

  ngOnDestroy() {
    if (this.resetFrame !== null) {
      cancelAnimationFrame(this.resetFrame);
    }
  }

  prevMember() {
    if (this.isAnimating || this.members.length < 2) return;

    this.isAnimating = true;
    this.activeIndex = (this.activeIndex - 1 + this.members.length) % this.members.length;
    this.trackIndex--;
  }

  nextMember() {
    if (this.isAnimating || this.members.length < 2) return;

    this.isAnimating = true;
    this.activeIndex = (this.activeIndex + 1) % this.members.length;
    this.trackIndex++;
  }

  goToMember(index: number) {
    if (this.isAnimating || index === this.activeIndex || this.members.length < 2) return;

    this.isAnimating = true;
    this.activeIndex = index;
    this.trackIndex = index + 2;
  }

  onTransitionEnd(event: TransitionEvent) {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform') return;

    if (this.trackIndex === 1) {
      this.snapBack(this.members.length + 1);
    } else if (this.trackIndex === this.members.length + 2) {
      this.snapBack(2);
    } else {
      this.isAnimating = false;
    }
  }

  private getMember(index: number): TeamMember {
    const realIndex = (index + this.members.length) % this.members.length;
    return this.members[realIndex];
  }

  private snapBack(realIndex: number) {
    this.noTransition = true;
    this.trackIndex = realIndex;

    if (this.resetFrame !== null) {
      cancelAnimationFrame(this.resetFrame);
    }

    this.resetFrame = requestAnimationFrame(() => {
      this.resetFrame = requestAnimationFrame(() => {
        this.resetFrame = null;
        this.noTransition = false;
        this.isAnimating = false;
      });
    });
  }
}
