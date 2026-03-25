import { Component } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-how-to-play-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="htp-header">
      <h2 class="htp-title">How to Play</h2>
      <button class="htp-close" (click)="close()" aria-label="Close">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-dialog-content class="htp-body">
      <ol class="htp-steps">
        <li>Choose a topic, or generate one with AI, to start a round. The game picks one hidden answer from that topic.</li>
        <li>Submit guesses from the list and use the grid to compare each guess against the hidden answer.</li>
        <li><strong>Green</strong> means an exact match in that column, <strong>yellow</strong> means part of your guess overlaps with the answer, and <strong>gray</strong> means it does not match.</li>
        <li>Keep narrowing it down until you find the correct answer.</li>
        <li>You can play solo or in multiplayer, including standard, chaos, and 1v1 modes. Each new round can give you a different answer, even in the same topic.</li>
      </ol>
    </mat-dialog-content>
  `,
  styles: [`
    :host {
      display: block;
    }

    .htp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 20px 12px;
    }

    .htp-title {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 700;
      background: linear-gradient(135deg, #3b82f6, #6366f1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .htp-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 8px;
      background: rgba(99, 102, 241, 0.08);
      color: #64748b;
      cursor: pointer;
      transition: background 0.18s ease, color 0.18s ease;
      flex-shrink: 0;
    }

    .htp-close:hover {
      background: rgba(99, 102, 241, 0.16);
      color: #4f46e5;
    }

    .htp-close mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      line-height: 18px;
    }

    .htp-body {
      padding: 0 20px 24px !important;
      max-height: 60vh;
    }

    .htp-steps {
      margin: 0;
      padding-left: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .htp-steps li {
      font-size: 0.92rem;
      line-height: 1.55;
      color: #374151;
    }

    :host-context(.dark) .htp-title {
      background: linear-gradient(135deg, #93c5fd, #a5b4fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    :host-context(.dark) .htp-close {
      background: rgba(139, 92, 246, 0.1);
      color: #94a3b8;
    }

    :host-context(.dark) .htp-close:hover {
      background: rgba(139, 92, 246, 0.2);
      color: #c4b5fd;
    }

    :host-context(.dark) .htp-steps li {
      color: #e2e8f0;
    }
  `]
})
export class HowToPlayDialogComponent {
  constructor(private dialogRef: MatDialogRef<HowToPlayDialogComponent>) {}

  close() {
    this.dialogRef.close();
  }
}
