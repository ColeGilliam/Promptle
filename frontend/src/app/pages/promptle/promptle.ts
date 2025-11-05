import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import mockData from './mock-data.json';

@Component({
  selector: 'app-promptle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './promptle.html',
  styleUrls: ['./promptle.css']
})
export class PromptleComponent implements OnInit {
  topic = mockData.topic;
  headers: string[] = mockData.headers;
  answers = mockData.answers;
  correctAnswer = mockData.correctAnswer;
  selectedGuess: string = '';

  // each guess has both the values and their color indicators
  submittedGuesses: { values: string[]; colors: string[] }[] = [];

  ngOnInit() {
    console.log('Loaded topic:', this.topic);
  }

  // helper: split a string into lowercase word tokens (for exact word matching)
  tokenize(value: string): string[] {
    if (!value) return [];
    // split on any non-alphanumeric character (commas, spaces, dashes, etc.)
    return value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  onSubmitGuess() {
    if (!this.selectedGuess) return;

    const guessedCharacter = this.answers.find(a => a.name === this.selectedGuess);
    const correctCharacter = this.answers.find(a => a.name === this.correctAnswer);
    if (!guessedCharacter || !correctCharacter) return;

    // Build a set of all tokens in the correct answer’s values
    const correctTokensSet = new Set<string>();
    correctCharacter.values.forEach(v => {
      this.tokenize(v).forEach(t => correctTokensSet.add(t));
    });

    // Compare each clue slot
    const colors = guessedCharacter.values.map((value, i) => {
      const correctValue = correctCharacter.values[i];

      // GREEN: exact match for this column (case-insensitive)
      if (value && correctValue && value.toLowerCase() === correctValue.toLowerCase()) {
        return 'green';
      }

      // YELLOW: guessed value contains any whole token found in the correct answer
      const guessTokens = this.tokenize(value);
      for (const t of guessTokens) {
        if (correctTokensSet.has(t)) return 'yellow';
      }

      // GRAY: no overlap at all
      return 'gray';
    });

    // store guess result for rendering
    this.submittedGuesses.push({
      values: guessedCharacter.values,
      colors
    });

    // clear dropdown for next guess
    this.selectedGuess = '';
  }
}
