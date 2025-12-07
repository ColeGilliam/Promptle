// promptle.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { DbGameService, GameData } from '../../services/setup-game';

@Component({
  selector: 'app-promptle',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './promptle.html',
  styleUrls: ['./promptle.css']
})
export class PromptleComponent implements OnInit {
  // === Game state driven by backend ===
  topic = '';
  headers: string[] = [];
  answers: { name: string; values: string[] }[] = [];
  correctAnswer: {name: string; values: string[]} = {name: '', values: []};
  selectedGuess = '';

  // Each submitted guess stores both the values and their color indicators
  submittedGuesses: { values: string[]; colors: string[] }[] = [];

  // Backend preview grid (shows the correct answer row)
  backendHeaders: string[] = [];
  backendRow: string[] = [];

  // Loading / error state
  gameLoading = false;
  gameError = '';

  constructor(private dbGameService: DbGameService) {}

  ngOnInit() {
    // Load a game for topicId 1 by default (can be dynamic later)
    this.loadGame(1);
  }

  /**
   * Fetch game data from the database service
   */
  loadGame(topicId: number) {
    this.gameLoading = true;
    this.gameError = '';

    this.dbGameService.fetchGameByTopic(topicId).subscribe({
      next: (data: GameData) => {
        this.applyGameData(data);
        this.gameLoading = false;
      },
      error: (err) => {
        console.error('Error loading game data:', err);
        this.gameError = err?.error?.error ?? 'Failed to load game data';
        this.gameLoading = false;
      }
    });
  }

  /**
   * Apply fetched game data to the component state
   */
  private applyGameData(data: GameData) {
    this.topic = data.topic;
    this.headers = data.headers;
    this.answers = data.answers;
    this.correctAnswer = data.correctAnswer;

    // Build backend preview row from correct answer
    const correct = this.answers.find(a => a.name === this.correctAnswer.name);
    if (correct) {
      this.backendHeaders = [...this.headers];
      this.backendRow = [...correct.values];
    }

    // Reset guesses
    this.submittedGuesses = [];
    this.selectedGuess = '';
  }

  /**
   * Split a string into lowercase word tokens (for partial match scoring)
   */
  tokenize(value: string): string[] {
    if (!value) return [];
    return value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  /**
   * Submit a guess and calculate colors for feedback
   */
  onSubmitGuess() {
    if (!this.selectedGuess) return;

    const guessed = this.answers.find(a => a.name === this.selectedGuess);
    const correct = this.answers.find(a => a.name === this.correctAnswer.name);
    if (!guessed || !correct) return;

    // Build a set of all tokens in correct answer values
    const correctTokensSet = new Set<string>();
    correct.values.forEach(v => this.tokenize(v).forEach(t => correctTokensSet.add(t)));

    // Determine colors for each column
    const colors = guessed.values.map((value, i) => {
      const correctValue = correct.values[i];

      if (value && correctValue && value.toLowerCase() === correctValue.toLowerCase()) {
        return 'green';
      }

      const guessTokens = this.tokenize(value);
      for (const t of guessTokens) {
        if (correctTokensSet.has(t)) return 'yellow';
      }

      return 'gray';
    });

    // Store the result
    this.submittedGuesses.push({
      values: guessed.values,
      colors
    });

    // Clear selection for next guess
    this.selectedGuess = '';
  }
}
