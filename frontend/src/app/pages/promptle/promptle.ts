import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

interface GameData {
  topic: string;
  headers: string[];
  answers: { name: string; values: string[] }[];
  correctAnswer: string;
}

@Component({
  selector: 'app-promptle',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './promptle.html',
  styleUrls: ['./promptle.css']
})
export class PromptleComponent implements OnInit {
  private readonly apiBaseUrl = 'http://localhost:3000/api';

  topic = 'Promptle';
  topicInput = '';
  loadingSubjects = false;
  errorMessage = '';

  headers: string[] = [];
  answers: { name: string; values: string[] }[] = [];
  correctAnswer = '';
  selectedGuess: string = '';

  // each guess has both the values and their color indicators
  submittedGuesses: { values: string[]; colors: string[] }[] = [];

  constructor(private readonly http: HttpClient) {}

  ngOnInit() {
    console.log('Promptle ready. Generate a topic to start.');
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

  // Generate subjects from the backend AI service
  generateSubjects() {
    // Reset state
    this.errorMessage = '';
    const topic = this.topicInput.trim();

    // Validate input
    if (!topic) {
      this.errorMessage = 'Enter a topic to generate subjects.';
      return;
    }

    this.loadingSubjects = true; // Indicate loading

    // Call backend API
    this.http
      .post<GameData>(`${this.apiBaseUrl}/subjects`, {
        topic,
        minCategories: 5,
        maxCategories: 7
      })
      .subscribe({
        // Handle successful response
        next: response => {
          if (!response?.headers?.length || !response?.answers?.length) {
            this.errorMessage = 'No game data was returned for that topic.';
            return;
          }

          this.applyGameData(response);
        },
        // Handle errors
        error: err => {
          console.error('Failed to generate subjects', err);
          this.errorMessage =
            err?.error?.error || 'Unable to reach the AI generator. Is the backend running?';
        },
        // Finalize loading state
        complete: () => {
          this.loadingSubjects = false;
        }
      });
  }

  // Apply received game data to component state
  private applyGameData(data: GameData) {
    this.topic = data.topic;
    this.topicInput = data.topic;
    this.headers = data.headers;
    this.answers = data.answers;
    this.correctAnswer = data.correctAnswer || data.answers[0]?.name;

    // Reset state for new game
    this.submittedGuesses = [];
    this.selectedGuess = '';
  }
}
