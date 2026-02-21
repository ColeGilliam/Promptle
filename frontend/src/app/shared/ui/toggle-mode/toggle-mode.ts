import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-toggle-mode',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toggle-mode.html',
  styleUrl: './toggle-mode.css',
})
export class ToggleMode {
@Input() disabled = false;

  // Default = singleplayer (true = singleplayer, false = multiplayer)
  private _isSingleplayer = true;

  @Input()
  set isSingleplayer(value: boolean) {
    this._isSingleplayer = value;
  }

  get isSingleplayer(): boolean {
    return this._isSingleplayer;
  }

  @Output() isSingleplayerChange = new EventEmitter<boolean>();

  toggle() {
    if (this.disabled) return;
    this._isSingleplayer = !this._isSingleplayer;
    this.isSingleplayerChange.emit(this._isSingleplayer);
  }

  // Optional: expose current mode as string if parent needs it
  get mode(): 'singleplayer' | 'multiplayer' {
    return this.isSingleplayer ? 'singleplayer' : 'multiplayer';
  }
}
