import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ColorblindMode = 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia' | 'achromatopsia';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly themeKey = 'promptle-theme';
  private readonly gameAnimKey = 'promptle-game-anims';
  private readonly uiAnimKey = 'promptle-ui-anims';
  private readonly highContrastKey = 'promptle-high-contrast';
  private readonly colorblindKey = 'promptle-colorblind';
  private readonly colorblindModes: ColorblindMode[] = ['none', 'deuteranopia', 'protanopia', 'tritanopia', 'achromatopsia'];

  private _isDarkTheme: boolean;
  readonly isDarkTheme$ = new BehaviorSubject<boolean>(false);
  private gameAnimationsOn = true;

  constructor() {
    const saved = localStorage.getItem(this.themeKey);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this._isDarkTheme = saved ? saved === 'dark' : prefersDark;
    this.isDarkTheme$.next(this._isDarkTheme);
    this.applyTheme(this._isDarkTheme);
    this.gameAnimationsOn = localStorage.getItem(this.gameAnimKey) !== 'false';
    this.applyGameAnimations(this.gameAnimationsOn);
    this.applyUiAnimations(this.getUiAnimations());
    this.applyHighContrast(this.getHighContrast());
    this.applyColorblind(this.getColorblindMode());
  }

  get isDarkTheme(): boolean {
    return this._isDarkTheme;
  }

  setTheme(isDark: boolean): void {
    this._isDarkTheme = isDark;
    this.isDarkTheme$.next(isDark);
    localStorage.setItem(this.themeKey, isDark ? 'dark' : 'light');
    document.body.classList.toggle('dark', isDark);
  }

  private applyTheme(isDark: boolean): void {
    document.body.classList.toggle('dark', isDark);
  }

  getGameAnimations(): boolean {
    return this.gameAnimationsOn;
  }

  setGameAnimations(enabled: boolean): void {
    this.gameAnimationsOn = enabled;
    localStorage.setItem(this.gameAnimKey, String(enabled));
    this.applyGameAnimations(enabled);
  }

  getUiAnimations(): boolean {
    return localStorage.getItem(this.uiAnimKey) !== 'false';
  }

  setUiAnimations(enabled: boolean): void {
    localStorage.setItem(this.uiAnimKey, String(enabled));
    this.applyUiAnimations(enabled);
  }

  getHighContrast(): boolean {
    return localStorage.getItem(this.highContrastKey) === 'true';
  }

  setHighContrast(enabled: boolean): void {
    localStorage.setItem(this.highContrastKey, String(enabled));
    this.applyHighContrast(enabled);
  }

  getColorblindMode(): ColorblindMode {
    const saved = localStorage.getItem(this.colorblindKey) as ColorblindMode | null;
    return saved && this.colorblindModes.includes(saved) ? saved : 'none';
  }

  setColorblindMode(mode: ColorblindMode): void {
    localStorage.setItem(this.colorblindKey, mode);
    this.applyColorblind(mode);
  }

  private applyGameAnimations(enabled: boolean): void {
    document.body.classList.toggle('no-game-anims', !enabled);
  }

  private applyUiAnimations(enabled: boolean): void {
    document.body.classList.toggle('no-ui-anims', !enabled);
  }

  private applyHighContrast(enabled: boolean): void {
    document.body.classList.toggle('high-contrast', enabled);
  }

  private applyColorblind(mode: ColorblindMode): void {
    this.colorblindModes
      .filter((item) => item !== 'none')
      .forEach((item) => document.body.classList.remove(`colorblind-${item}`));

    if (mode !== 'none') {
      document.body.classList.add(`colorblind-${mode}`);
    }
  }
}
