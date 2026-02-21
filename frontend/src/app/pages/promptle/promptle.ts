// promptle.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { DbGameService, GameData } from '../../services/setup-game';
import { ActivatedRoute, Router } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { AuthenticationService } from '../../services/authentication.service';
import { take } from 'rxjs';
import { HttpClient } from '@angular/common/http';

import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { PromptleToolbarComponent } from '../../shared/promptle-toolbar/toolbar/promptle-toolbar';

@Component({
  selector: 'app-promptle',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    HttpClientModule, 
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    NavbarComponent
  ],
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
  isGameOver = false;

  //showSettingsMenu = false;

  // Each submitted guess stores both the values and their color indicators
  submittedGuesses: { values: string[]; colors: string[] }[] = [];

  // Backend preview grid (shows the correct answer row)
  backendHeaders: string[] = [];
  backendRow: string[] = [];

  // Loading / error state
  gameLoading = false;
  gameError = '';
  // Save status for UI
  savedTimestamp: string | null = null;

  constructor(private dbGameService: DbGameService, private router: Router, private route: ActivatedRoute, private auth: AuthenticationService, private http: HttpClient) {}

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      const loadSaved = params.get('loadSaved');
      const aiTopic = params.get('topic');
      const topicIdParam = params.get('id');
      const topicId = topicIdParam ? Number(topicIdParam) : NaN;

      if (loadSaved === 'true') {
        this.gameError = '';
        // Try to load from server if logged in, otherwise localStorage
        this.auth.user$.pipe(take(1)).subscribe(user => {
          if (user && user.sub) {
                this.http.get<any>(`http://localhost:3001/api/load-game/${encodeURIComponent(user.sub)}`).subscribe({
                  next: (payload) => {
                    if (payload && payload.topic) {
                      this.applySavedPayload(payload);
                    } else {
                      // No server-side saved game for this user
                      this.gameError = 'No saved game found.';
                    }
                  },
                  error: () => {
                    // No server-side saved game for this user; do not fall back to localStorage
                    this.gameError = 'No saved game found.';
                  }
                });
          } else {
            if (!this.loadFromLocalStorage()) this.gameError = 'No saved game found.';
          }
        });

        return;
      }

      if (aiTopic && aiTopic.trim()) {
        this.loadGame({ topic: aiTopic.trim() });
        return;
      }

      if (!isNaN(topicId)) {
        this.loadGame({ topicId });
        return;
      }

      this.gameError = 'No valid topic or game ID provided.';
    });
  }

  /**
   * Save the current in-memory game progress to localStorage.
   * Only one saved game is supported; this overwrites previous save.
   */
  saveGame() {
    if (!this.topic || !this.headers.length) return;

    const payload = {
      savedAt: Date.now(),
      topic: this.topic,
      headers: this.headers,
      answers: this.answers,
      correctAnswer: this.correctAnswer,
      submittedGuesses: this.submittedGuesses,
      isGameOver: this.isGameOver
    };

    // If user is logged in, save to backend under their auth0 id. Otherwise fallback to localStorage.
    this.auth.user$.pipe(take(1)).subscribe(user => {
      const savedAtStr = new Date(payload.savedAt).toLocaleString();
      if (user && user.sub) {
        this.http.post('http://localhost:3001/api/save-game', { auth0Id: user.sub, game: payload }).subscribe({
          next: () => {
            this.savedTimestamp = savedAtStr;
            console.log('Game saved to server');
          },
          error: (err) => {
            console.error('Server save failed, falling back to localStorage', err);
            try {
              localStorage.setItem('promptle_saved_game', JSON.stringify(payload));
              this.savedTimestamp = savedAtStr;
            } catch (e) {
              console.error('Failed to save game locally', e);
              this.gameError = 'Failed to save game';
            }
          }
        });
      } else {
        try {
          localStorage.setItem('promptle_saved_game', JSON.stringify(payload));
          this.savedTimestamp = savedAtStr;
          console.log('Game saved locally');
        } catch (e) {
          console.error('Failed to save game', e);
          this.gameError = 'Failed to save game';
        }
      }
    });
  }

  /**
   * Load saved game from localStorage into current component state.
   * Returns true if a saved game was loaded.
   */
  loadSavedGame(): boolean {
    // Synchronous loader used in contexts where only localStorage should be consulted.
    // Server-backed loading is handled during route initialization in ngOnInit.
    return this.loadFromLocalStorage();
  }

  private loadFromLocalStorage(): boolean {
    try {
      const raw = localStorage.getItem('promptle_saved_game');
      if (!raw) return false;
      const payload = JSON.parse(raw);
      if (!payload || !payload.topic) return false;
      this.applySavedPayload(payload);
      return true;
    } catch (e) {
      console.error('Failed to load saved game', e);
      return false;
    }
  }

  private applySavedPayload(payload: any) {
    this.topic = payload.topic;
    this.headers = payload.headers || [];
    this.answers = payload.answers || [];
    this.correctAnswer = payload.correctAnswer || { name: '', values: [] };
    this.submittedGuesses = payload.submittedGuesses || [];
    this.isGameOver = !!payload.isGameOver;
    this.savedTimestamp = payload.savedAt ? new Date(payload.savedAt).toLocaleString() : null;

    const correct = this.answers.find(a => a.name === this.correctAnswer.name);
    if (correct) {
      this.backendHeaders = [...this.headers];
      this.backendRow = [...correct.values];
    } else {
      this.backendHeaders = [];
      this.backendRow = [];
    }
  }

  /**
   * Restart the current game by selecting a different correct answer randomly
   * and resetting guesses. If there is only one possible answer, this is a no-op.
   */
  restartGame() {
    if (!this.answers || this.answers.length === 0) return;

    // If only one answer, can't pick a different one
    if (this.answers.length === 1) {
      // Reset guesses but keep the same correct answer
      this.submittedGuesses = [];
      this.selectedGuess = '';
      this.isGameOver = false;
      return;
    }

    // Find indices of answers that are not the current correct answer
    const candidates = this.answers
      .map((a, idx) => ({ a, idx }))
      .filter(x => x.a.name !== this.correctAnswer.name);

    if (!candidates.length) {
      // All answers match current correct (unlikely) — just reset guesses
      this.submittedGuesses = [];
      this.selectedGuess = '';
      this.isGameOver = false;
      return;
    }

    // Pick a random candidate
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const newCorrect = pick.a;

    this.correctAnswer = { name: newCorrect.name, values: [...newCorrect.values] };

    // Update backend preview row
    this.backendHeaders = [...this.headers];
    this.backendRow = [...newCorrect.values];

    // Reset gameplay state
    this.submittedGuesses = [];
    this.selectedGuess = '';
    this.isGameOver = false;
    this.gameError = '';
  }

    /**
   * Fetch a game via unified service (AI or DB depending on params)
   */
  private loadGame(params: { topic?: string; topicId?: number }) {
    this.gameLoading = true;
    this.gameError = '';

    this.dbGameService.fetchGame(params).subscribe({
      next: (data: GameData) => {
        this.applyGameData(data);
        this.gameLoading = false;
      },
      error: (err) => {
        console.error('Error loading game data:', err);
        this.gameError = err?.error?.error ?? err?.message ?? 'Failed to load game data';
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

    // Build preview row from the matching correct answer
    const correct = this.answers.find(a => a.name === this.correctAnswer.name);
    if (correct) {
      this.backendHeaders = [...this.headers];
      this.backendRow = [...correct.values];
    } else {
      this.backendHeaders = [];
      this.backendRow = [];
    }

    // Reset guesses
    this.submittedGuesses = [];
    this.selectedGuess = '';
  }

    //Split a string into lowercase word tokens (for partial match scoring)
  tokenize(value: string): string[] {
    if (!value) return [];
    return value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  private handleWin() {
    this.isGameOver = true;

    // Update stats if logged in
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user?.sub) {
        this.http.post('http://localhost:3001/api/increment-win', { auth0Id: user.sub })
          .subscribe({
            next: () => console.log('Stat updated!'),
            error: (err) => console.error('Failed to update stats', err)
          });
      }
    });
  }

  // Submit a guess and calculate colors for feedback
  onSubmitGuess() {
    if (!this.selectedGuess || this.isGameOver) return;

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
      colors: colors
    });

    if (this.selectedGuess === this.correctAnswer.name) {
      this.handleWin(); 
    }

    // Clear selection for next guess
    this.selectedGuess = '';
  }

  /*toggleSettingsMenu() {
    this.showSettingsMenu = !this.showSettingsMenu;
  }*/

  quitGame() {
    this.router.navigate(['/']);   // go back to home
  }
}
