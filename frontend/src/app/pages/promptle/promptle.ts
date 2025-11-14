import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import mockData from './mock-data.json';
import { JDemoService, GameData } from '../../services/j-demo.service';

@Component({
  selector: 'app-promptle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './promptle.html',
  styleUrls: ['./promptle.css']
})
export class PromptleComponent implements OnInit {
  // === Game state driven by backend ===
  //
  // These are populated from the /api/demo/game-data endpoint.
  // Previously they came from mock-data.json; now they come from MongoDB.
  topic = '';
  headers: string[] = [];
  answers: { name: string; values: string[] }[] = [];
  correctAnswer = '';
  selectedGuess: string = '';

  // Each submitted guess stores both the values and their color indicators
  submittedGuesses: { values: string[]; colors: string[] }[] = [];

  // === Backend preview grid (shows the correct answer row) ===
  //
  // This uses the same column layout as the main grid but shows only one row:
  // the row that corresponds to correctAnswer.
  backendHeaders: string[] = [];
  backendRow: string[] = [];

  // Loading / error state for loading game data
  gameLoading = false;
  gameError = '';

  // JDemoService lets this component call the backend API.
  constructor(private demoService: JDemoService) {}

  ngOnInit() {
    // On component load, fetch game data from the backend.
    // TODO (future): if you add topic selection, you can pass a topic/ID
    // into loadGameData() here or read from the route.
    this.loadGameData();
  }

  // Load the full game configuration (topic, headers, answers, correctAnswer)
  // from the backend.
  loadGameData() {
    this.gameLoading = true;
    this.gameError = '';

    this.demoService.getGameData().subscribe({
      next: (data: GameData) => {
        console.log('Game data from backend:', data);

        // Fill core game fields from the response
        this.topic = data.topic;
        this.headers = data.headers;
        this.answers = data.answers;
        this.correctAnswer = data.correctAnswer;

        // Build backend preview row from the correct answer
        const correct = this.answers.find(a => a.name === this.correctAnswer);
        if (correct) {
          this.backendHeaders = [...this.headers];
          this.backendRow = [...correct.values];
        }

        this.gameLoading = false;
      },
      error: (err) => {
        console.error('Error loading game data:', err);
        this.gameError = err?.error?.error ?? 'Failed to load game data';

        // Optional: fallback to mock data if backend fails
        // This prevents the UI from being totally empty while you're debugging.
        if (!this.headers.length && mockData) {
          console.warn('Falling back to mock-data.json');
          this.topic = mockData.topic;
          this.headers = mockData.headers;
          this.answers = mockData.answers;
          this.correctAnswer = mockData.correctAnswer;
        }

        this.gameLoading = false;
      }
    });
  }

  // Helper: split a string into lowercase word tokens (for exact word matching)
  // Used by the guess scoring logic to see if a guess partially matches tokens
  // in the correct answer.
  tokenize(value: string): string[] {
    if (!value) return [];
    // split on any non-alphanumeric character (commas, spaces, dashes, etc.)
    return value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  // Called when the user clicks "Submit Guess".
  // This uses the same logic you had before, but now "answers" and
  // "correctAnswer" come from the database instead of static JSON.
  //
  // TODO (future, ChatGPT integration):
  //  - If ChatGPT starts producing more complex fields (e.g., ranges, tags,
  //    numeric hints), you might adjust the comparison rules here:
  //      * different colors for different types of partial matches
  //      * extra visual hints based on ChatGPT-provided metadata.
  onSubmitGuess() {
    if (!this.selectedGuess) return;

    // The guessed row (from dropdown)
    const guessedCharacter = this.answers.find(a => a.name === this.selectedGuess);
    // The correct row (from backend-selected correctAnswer)
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

    // Store the guess result for rendering in the grid
    this.submittedGuesses.push({
      values: guessedCharacter.values,
      colors
    });

    // Clear dropdown for next guess
    this.selectedGuess = '';
  }
}
