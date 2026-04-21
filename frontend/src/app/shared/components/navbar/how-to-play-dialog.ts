import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type HowToPlayMode = 'promptle' | 'connections' | 'crossword';

interface HowToPlayContent {
  title: string;
  steps: string[];
}

const HOW_TO_PLAY_CONTENT: Record<HowToPlayMode, HowToPlayContent> = {
  promptle: {
    title: 'How to Play Promptle',
    steps: [
      'Choose a topic, or generate one with AI, to start a round. The game picks one hidden answer from that topic.',
      'Submit guesses from the list and use the grid to compare each guess against the hidden answer.',
      'Green means an exact match in that column, yellow means part of your guess overlaps with the answer, and gray means it does not match.',
      'Keep narrowing it down until you find the correct answer.',
      'You can play solo or in multiplayer, including standard, chaos, and 1v1 modes.',
    ],
  },
  connections: {
    title: 'How to Play Connections',
    steps: [
      'Enter a topic to generate a custom board made of four hidden groups of four words.',
      'Select exactly four words that you think belong together, then submit the set.',
      'A correct set locks into place as a solved row. A wrong set costs one of your four mistakes.',
      'If you are one word away from a correct set, the board tells you.',
      'Solve all four groups before you run out of mistakes.',
    ],
  },
  crossword: {
    title: 'How to Play Crossword',
    steps: [
      'Enter a topic to generate a themed crossword, then click any square or clue to activate a word.',
      'Type letters directly into the grid. Arrow keys move around the board, and space or enter flips between across and down.',
      'Use Check Letter, Check Word, or Check Puzzle to verify what you have filled. Checked correct answers turn green and checked wrong clues turn red.',
      'Use Save if you want to keep one crossword on this device and return to it later.',
      'Reveal Letter and Reveal Word uncover the active answer. Reveal Puzzle asks for confirmation before filling the whole grid.',
      'Fill every square correctly to finish the crossword and lock in your solve time.',
    ],
  },
};

@Component({
  selector: 'app-how-to-play-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="htp-header">
      <h2 class="htp-title">{{ content.title }}</h2>
      <button class="htp-close" (click)="close()" aria-label="Close">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-dialog-content class="htp-body">
      <ol class="htp-steps">
        <li *ngFor="let step of content.steps">{{ step }}</li>
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
  readonly content: HowToPlayContent;

  constructor(
    private dialogRef: MatDialogRef<HowToPlayDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: { mode?: HowToPlayMode } | null
  ) {
    this.content = HOW_TO_PLAY_CONTENT[data?.mode ?? 'promptle'];
  }

  close() {
    this.dialogRef.close();
  }
}
