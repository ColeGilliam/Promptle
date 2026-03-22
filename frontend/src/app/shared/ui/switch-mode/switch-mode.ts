import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-switch-mode',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './switch-mode.html',
  styleUrl: './switch-mode.css',
})
export class SwitchMode {
  @Input() disabled = false;

  private _isSingleplayer = true;

  @Input()
  set isSingleplayer(value: boolean) {
    this._isSingleplayer = value;
  }

  get isSingleplayer(): boolean {
    return this._isSingleplayer;
  }

  @Output() isSingleplayerChange = new EventEmitter<boolean>();

  get modeValue(): 'singleplayer' | 'multiplayer' {
    return this._isSingleplayer ? 'singleplayer' : 'multiplayer';
  }

  onModeChange(value: 'singleplayer' | 'multiplayer') {
    const nextIsSingleplayer = value === 'singleplayer';
    if (nextIsSingleplayer === this._isSingleplayer) return;

    this._isSingleplayer = nextIsSingleplayer;
    this.isSingleplayerChange.emit(this._isSingleplayer);
  }
}
