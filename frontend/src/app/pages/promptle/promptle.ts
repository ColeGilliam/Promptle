// promptle.component.ts
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatCardModule } from '@angular/material/card';

import { MultiplayerService } from '../../services/multiplayer-promptle';
import { Subscription } from 'rxjs';
import { PromptleGameCard } from '../../shared/ui/promptle-game-card/promptle-game-card';
import { PromptleWinPopup } from '../../shared/ui/promptle-win-popup/promptle-win-popup';

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
    MatInputModule,
    MatAutocompleteModule,
    MatCardModule,
    PromptleGameCard,
    PromptleWinPopup,
    NavbarComponent
  ],
  templateUrl: './promptle.html',
  styleUrls: ['./promptle.css']
})
export class PromptleComponent implements OnInit, OnDestroy {
  //─────────────────────────────────────
  // === Game state driven by backend ===
  //─────────────────────────────────────
  topic = '';
  headers: string[] = [];
  answers: { name: string; values: string[] }[] = [];
  filteredAnswers: { name: string; values: string[] }[] = [];
  correctAnswer: {name: string; values: string[]} = {name: '', values: []};
  selectedGuess = '';
  guessQuery = '';
  isGameOver = false;

  // Each submitted guess stores both the selected answer name and its color indicators
  submittedGuesses: { name?: string; values: string[]; colors: string[] }[] = [];

  // Backend preview grid (shows the correct answer row)
  backendHeaders: string[] = [];
  backendRow: string[] = [];

  // Loading / error state
  gameLoading = false;
  gameError = '';
  // Save status for UI
  savedTimestamp: string | null = null;

  //─────────────────────────────────────
  // === Multiplayer ===
  //─────────────────────────────────────
  currentRoom = '';
  isMultiplayer = false;
  players: { id: string; name: string; guesses?: number }[] = [];

  private roomStateSub?: Subscription;

  constructor(
    private dbGameService: DbGameService,
    private router: Router,
    private route: ActivatedRoute,
    private auth: AuthenticationService,
    private http: HttpClient,
    private multiplayerService: MultiplayerService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    // Subscribe early so we catch all updates
    this.subscribeToRoomUpdates();

    this.route.queryParamMap.subscribe(params => {
      const loadSaved = params.get('loadSaved');
      const aiTopic = params.get('topic');
      const topicIdParam = params.get('id');
      const topicId = topicIdParam ? Number(topicIdParam) : NaN;
      const room = params.get('room')?.trim();

      // Multiplayer takes priority
      if (room && room.length > 0) {
        console.log('[Promptle] Multiplayer mode activated with room:', room);
        this.currentRoom = room;
        this.isMultiplayer = true;

        // Join socket with real username
        this.auth.user$.pipe(take(1)).subscribe(user => {
          const username = user?.name || user?.email?.split('@')[0] || 'Guest';
          console.log('[Promptle] Joining socket as:', username);
          this.multiplayerService.joinRoom(room, username);
        });

        // Load game using room code
        this.loadGame({ room });
        return;
      }

      // Single-player paths
      console.log('[Promptle] Single-player mode');
      this.isMultiplayer = false;
      this.multiplayerService.leaveRoom();

      if (loadSaved === 'true') {
        this.gameError = '';
        // Try to load from server if logged in, otherwise localStorage
        this.auth.user$.pipe(take(1)).subscribe(user => {
          if (user && user.sub) {
            this.http.get<any>(`/api/load-game/${encodeURIComponent(user.sub)}`).subscribe({
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

  private subscribeToRoomUpdates() {
    if (this.roomStateSub) {
      this.roomStateSub.unsubscribe();
    }

    this.roomStateSub = this.multiplayerService.roomState$.subscribe(state => {
      console.log('[Promptle] Room state update received:', state);

      if (state) {
        this.players = [...state.players];  // new array reference
        this.currentRoom = state.roomId;
        console.log('[Promptle] Players updated:', this.players.length, this.players.map(p => p.name));
      } else {
        this.players = [];
        this.currentRoom = '';
        console.log('[Promptle] Room state cleared');
      }

      // Force Angular to re-render
      this.cdr.detectChanges();
    });
  }

  /**
   * Save the current in-memory game progress to localStorage.
   * Only one saved game is supported; this overwrites previous save.
   * Only available in single-player mode.
   */
  saveGame() {
    if (this.isMultiplayer) return; // Disabled in multiplayer

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
        this.http.post('/api/save-game', { auth0Id: user.sub, game: payload }).subscribe({
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
   * Only available in single-player mode.
   */
  loadSavedGame(): boolean {
    if (this.isMultiplayer) return false; // Disabled in multiplayer
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
    this.submittedGuesses = Array.isArray(payload.submittedGuesses)
      ? payload.submittedGuesses.map((guess: any) => ({
          name: typeof guess?.name === 'string' ? guess.name : undefined,
          values: Array.isArray(guess?.values) ? guess.values : [],
          colors: Array.isArray(guess?.colors) ? guess.colors : []
        }))
      : [];
    this.selectedGuess = '';
    this.guessQuery = '';
    this.filterAnswers(this.guessQuery);
    this.correctAnswer = payload.correctAnswer || { name: '', values: [] };
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
   * Only available in single-player mode.
   */
  restartGame() {
    if (this.isMultiplayer) return; // Disabled in multiplayer

    if (!this.answers || this.answers.length === 0) return;

    // If only one answer, can't pick a different one
    if (this.answers.length === 1) {
      // Reset guesses but keep the same correct answer
      this.submittedGuesses = [];
      this.selectedGuess = '';
      this.guessQuery = '';
      this.filterAnswers(this.guessQuery);
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
      this.guessQuery = '';
      this.filterAnswers(this.guessQuery);
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
    this.guessQuery = '';
    this.filterAnswers(this.guessQuery);
    this.isGameOver = false;
    this.gameError = '';
  }

  /**
   * Fetch a game via unified service (AI or DB depending on params)
   */
  private loadGame(params: { topic?: string; topicId?: number; room?: string }) {
    this.gameLoading = true;
    this.gameError = '';

    this.dbGameService.fetchGame(params).subscribe({
      next: (data: GameData) => {
        this.applyGameData(data);
        this.gameLoading = false;
        if (this.isMultiplayer) {
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('Error loading game data:', err);
        this.gameError = err?.error?.error ?? err?.message ?? 'Failed to load game data';
        this.gameLoading = false;
        if (this.isMultiplayer) {
          this.cdr.detectChanges();
        }
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
    this.filterAnswers(this.guessQuery);
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
    this.guessQuery = '';
    this.filterAnswers(this.guessQuery);
    if (this.isMultiplayer) {
      this.cdr.detectChanges();
    }
  }

  onGuessQueryChange(query: string) {
    this.guessQuery = query;
    this.filterAnswers(query);

    const normalizedQuery = query.trim().toLowerCase();
    const exactMatch = this.filteredAnswers.find(answer =>
      answer.name.toLowerCase() === normalizedQuery
    );
    this.selectedGuess = exactMatch ? exactMatch.name : '';
  }

  onGuessOptionSelected(answerName: string) {
    if (this.isAlreadyGuessed(answerName)) return;
    this.selectedGuess = answerName;
    this.guessQuery = answerName;
    this.filterAnswers(answerName);
  }

  private filterAnswers(query: string) {
    const guessedNames = this.getGuessedNamesLowercase();
    const availableAnswers = this.answers.filter(answer =>
      !guessedNames.has(answer.name.toLowerCase())
    );

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      this.filteredAnswers = [...availableAnswers];
      return;
    }

    this.filteredAnswers = availableAnswers.filter(answer =>
      answer.name.toLowerCase().includes(normalizedQuery)
    );
  }

  private getGuessedNamesLowercase(): Set<string> {
    const guessedNames = new Set<string>();

    for (const guess of this.submittedGuesses) {
      const explicitName = guess.name?.trim();
      if (explicitName) {
        guessedNames.add(explicitName.toLowerCase());
        continue;
      }

      // Backward compatibility: infer name from values in older saved payloads.
      const matchedAnswer = this.answers.find(answer =>
        answer.values.length === guess.values.length &&
        answer.values.every((value, index) =>
          value.trim().toLowerCase() === String(guess.values[index] ?? '').trim().toLowerCase()
        )
      );

      if (matchedAnswer) {
        guessedNames.add(matchedAnswer.name.toLowerCase());
      }
    }

    return guessedNames;
  }

  private isAlreadyGuessed(answerName: string): boolean {
    return this.getGuessedNamesLowercase().has(answerName.trim().toLowerCase());
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

    // Update stats if logged in (single-player only for now)
    if (this.isMultiplayer) return;

    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user?.sub) {
        this.http.post('/api/increment-win', { auth0Id: user.sub })
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
    if (this.isAlreadyGuessed(this.selectedGuess)) {
      this.selectedGuess = '';
      this.guessQuery = '';
      this.filterAnswers(this.guessQuery);
      return;
    }

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
      name: guessed.name,
      values: [...guessed.values],
      colors: colors
    });

    if (this.selectedGuess === this.correctAnswer.name) {
      this.handleWin(); 
    }

    // Clear selection for next guess
    this.selectedGuess = '';
    this.guessQuery = '';
    this.filterAnswers(this.guessQuery);
    if (this.isMultiplayer) {
      this.cdr.detectChanges();
    }
  }

  get playerNamesDisplay(): string {
    if (!this.players || this.players.length === 0) {
      return 'empty';
    }
    return this.players.map(p => p.name || 'Unknown').join(', ');
  }

  quitGame() {
    this.router.navigate(['/']);   // go back to home
  }

  ngOnDestroy() {
    if (this.roomStateSub) {
      this.roomStateSub.unsubscribe();
    }
    this.multiplayerService.leaveRoom();
  }
}
