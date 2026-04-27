import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDividerModule } from '@angular/material/divider';
import { MatRadioModule } from '@angular/material/radio';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ColorblindMode, SettingsService } from '../../../services/settings.service';

@Component({
  selector: 'app-settings-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatDividerModule,
    MatIconModule,
    MatSlideToggleModule,
    MatRadioModule,
  ],
  template: `
    <div class="sd-header">
      <h2 class="sd-title">Settings</h2>
      <button class="sd-close" (click)="close()" aria-label="Close">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-dialog-content class="sd-body">
      <!-- theme -->
      <div class="sd-row">
        <div class="sd-info">
          <mat-icon class="sd-icon">{{ isDarkTheme ? 'dark_mode' : 'light_mode' }}</mat-icon>
          <div>
            <div class="sd-label">Dark Mode</div>
            <div class="sd-desc">Switch between light and dark theme</div>
          </div>
        </div>
        <mat-slide-toggle [(ngModel)]="isDarkTheme" (change)="onThemeChange()" color="primary"></mat-slide-toggle>
      </div>

      <mat-divider class="sd-divider"></mat-divider>

      <!-- game animations -->
      <div class="sd-row">
        <div class="sd-info">
          <mat-icon class="sd-icon">sports_esports</mat-icon>
          <div>
            <div class="sd-label">Game Animations</div>
            <div class="sd-desc">Win popups, power-up effects, and game reveals</div>
          </div>
        </div>
        <mat-slide-toggle [(ngModel)]="gameAnimations" (change)="onGameAnimsChange()" color="primary"></mat-slide-toggle>
      </div>

      <mat-divider class="sd-divider"></mat-divider>

      <!-- hints -->
      <div class="sd-row">
        <div class="sd-info">
          <mat-icon class="sd-icon">lightbulb</mat-icon>
          <div>
            <div class="sd-label">In-Game Hints</div>
            <div class="sd-desc">Show onboarding tips when you start a new game</div>
          </div>
        </div>
        <mat-slide-toggle [(ngModel)]="hints" (change)="onHintsChange()" color="primary"></mat-slide-toggle>
      </div>

      <mat-divider class="sd-divider"></mat-divider>

      <!-- ui animations -->
      <div class="sd-row">
        <div class="sd-info">
          <mat-icon class="sd-icon">auto_awesome</mat-icon>
          <div>
            <div class="sd-label">UI Animations</div>
            <div class="sd-desc">Background effects and decorations</div>
          </div>
        </div>
        <mat-slide-toggle [(ngModel)]="uiAnimations" (change)="onUiAnimsChange()" color="primary"></mat-slide-toggle>
      </div>

      <mat-divider class="sd-divider"></mat-divider>

      <!-- high contrast -->
      <div class="sd-row">
        <div class="sd-info">
          <mat-icon class="sd-icon">contrast</mat-icon>
          <div>
            <div class="sd-label">High Contrast</div>
            <div class="sd-desc">Bolder tile colors for easier distinction</div>
          </div>
        </div>
        <mat-slide-toggle [(ngModel)]="highContrast" (change)="onHighContrastChange()" color="primary"></mat-slide-toggle>
      </div>

      <mat-divider class="sd-divider"></mat-divider>

      <!-- colorblind mode -->
      <div class="sd-row sd-row--col">
        <div class="sd-info">
          <mat-icon class="sd-icon">palette</mat-icon>
          <div>
            <div class="sd-label">Colorblind Mode</div>
            <div class="sd-desc">Adjust tile colors for your vision type</div>
          </div>
        </div>
        <mat-radio-group [(ngModel)]="colorblindMode" (change)="onColorblindChange()" class="sd-radio-group" color="primary">
          @for (opt of colorblindOptions; track opt.value) {
            <mat-radio-button [value]="opt.value">{{ opt.label }}</mat-radio-button>
          }
        </mat-radio-group>
      </div>

    </mat-dialog-content>
  `,
  styles: [`
    :host { display: block; }

    .sd-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.25rem 1.25rem 0.75rem;
    }

    .sd-title {
      margin: 0;
      font-size: clamp(1.05rem, 0.45vw + 0.95rem, 1.2rem);
      font-weight: 700;
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .sd-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border: none;
      border-radius: 0.5rem;
      background: rgba(99, 102, 241, 0.08);
      color: #64748b;
      cursor: pointer;
      transition: background 0.18s ease, color 0.18s ease;
      flex-shrink: 0;
    }

    .sd-close:hover {
      background: rgba(99, 102, 241, 0.16);
      color: #4f46e5;
    }

    .sd-close mat-icon {
      font-size: 1.125rem;
      width: 1.125rem;
      height: 1.125rem;
      line-height: 1.125rem;
    }

    .sd-body {
      padding: 0 1.25rem 1.5rem !important;
    }

    .sd-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.625rem 0;
    }

    .sd-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex: 1;
      min-width: 0;
    }

    .sd-icon {
      color: #6366f1;
      font-size: 1.3rem;
      width: 1.3rem;
      height: 1.3rem;
      flex-shrink: 0;
    }

    .sd-label {
      font-size: 0.9rem;
      font-weight: 600;
      color: #1e293b;
    }

    .sd-desc {
      font-size: 0.8rem;
      color: #64748b;
      margin-top: 0.0625rem;
    }

    .sd-divider {
      margin: 0.125rem 0;
    }

    .sd-row--col {
      flex-direction: column;
      align-items: flex-start;
    }

    .sd-radio-group {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 0.125rem 1rem;
      padding-top: 0.375rem;
      padding-left: min(2.25rem, 7vw);
    }

    :host-context(.dark) .sd-title {
      background: linear-gradient(135deg, #93c5fd, #a5b4fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    :host-context(.dark) .sd-close {
      background: rgba(139, 92, 246, 0.1);
      color: #94a3b8;
    }

    :host-context(.dark) .sd-close:hover {
      background: rgba(139, 92, 246, 0.2);
      color: #c4b5fd;
    }

    :host-context(.dark) .sd-icon { color: #818cf8; }
    :host-context(.dark) .sd-label { color: #e2e8f0; }
    :host-context(.dark) .sd-desc { color: #94a3b8; }
    :host-context(.dark) .sd-divider { background: rgba(255, 255, 255, 0.07); }
  `]
})
export class SettingsDialogComponent implements OnInit {
  isDarkTheme = false;
  gameAnimations = true;
  uiAnimations = true;
  highContrast = false;
  colorblindMode: ColorblindMode = 'none';
  hints = true;

  readonly colorblindOptions: { value: ColorblindMode; label: string }[] = [
    { value: 'none',          label: 'None' },
    { value: 'deuteranopia',  label: 'Deuteranopia' },
    { value: 'protanopia',    label: 'Protanopia' },
    { value: 'tritanopia',    label: 'Tritanopia' },
    { value: 'achromatopsia', label: 'Achromatopsia' },
  ];

  constructor(
    private dialogRef: MatDialogRef<SettingsDialogComponent>,
    private settingsService: SettingsService,
  ) {}

  ngOnInit(): void {
    this.settingsService.isDarkTheme$.subscribe(v => this.isDarkTheme = v);
    this.gameAnimations = this.settingsService.getGameAnimations();
    this.uiAnimations = this.settingsService.getUiAnimations();
    this.highContrast = this.settingsService.getHighContrast();
    this.colorblindMode = this.settingsService.getColorblindMode();
    this.hints = this.settingsService.getHints();
  }

  onThemeChange(): void {
    this.settingsService.setTheme(this.isDarkTheme);
  }

  onGameAnimsChange(): void {
    this.settingsService.setGameAnimations(this.gameAnimations);
  }

  onUiAnimsChange(): void {
    this.settingsService.setUiAnimations(this.uiAnimations);
  }

  onHighContrastChange(): void {
    this.settingsService.setHighContrast(this.highContrast);
  }

  onColorblindChange(): void {
    this.settingsService.setColorblindMode(this.colorblindMode);
  }

  onHintsChange(): void {
    this.settingsService.setHints(this.hints);
  }

  close(): void {
    this.dialogRef.close();
  }
}
