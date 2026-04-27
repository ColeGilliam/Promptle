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
      'Green means an exact match. For text and list columns, yellow means part of your guess overlaps with the answer.',
      'For number columns, arrows show whether the correct answer is higher or lower and yellow means you are relatively close. For numbered references, a matching label turns yellow and the arrow shows whether the number is higher or lower.',
      'Keep narrowing it down until you find the correct answer.',
      'You can play solo or in multiplayer, including standard, chaos, and 1v1 modes.',
    ],
  },
  connections: {
    title: 'How to Play Connections',
    steps: [
      'Enter a topic to generate a custom board made of 16 words - with 4 groups of 4 words all relating to your topic.',
      'Select exactly four words that you think belong together, then submit the set.',
      'A correct set locks into place as a solved row. A wrong set costs you one of your four lives. If you are one word away, the game notifies you.',
      'Solve all four groups before you run out of lives to win.',
    ],
  },
  crossword: {
    title: 'How to Play Crossword',
    steps: [
      'Enter a topic to generate a custom crossword based around your topic.',
      'Click any square or clue to select where you want to type and what clue you want to solve.',
      'Type one character per square directly into the grid. Arrow keys move around the board, and space or enter flips between across and down.',
      'You can use Check Character, Check Word, or Check Puzzle to check your selected square, clue, or board',
      'Reveal Character, Reveal Word, and Reveal Puzzle uncover your selected square, word, or the whole puzzle.',
      'Fill every square correctly to finish the crossword. If any squares are wrong the game will let you know and continue.',
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
