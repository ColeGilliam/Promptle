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
import { animate, style, transition, trigger } from '@angular/animations';

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
  animations: [
    trigger('cardEnter', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(14px)' }),
        animate('320ms cubic-bezier(0.2, 0, 0, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ]),
    trigger('cardEnterDelayed', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(14px)' }),
        animate('360ms 90ms cubic-bezier(0.2, 0, 0, 1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
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

  submittedGuesses: { name?: string; values: string[]; colors: string[] }[] = [];

  backendHeaders: string[] = [];
  backendRow: string[] = [];

  gameLoading = false;
  gameError = '';
  savedTimestamp: string | null = null;

  //─────────────────────────────────────
  // === Multiplayer ===
  //─────────────────────────────────────
  currentRoom = '';
  isMultiplayer = false;
  players: { id: string; name: string; colors?: string[]; won?: boolean }[] = [];
  private myUsername = '';  // ← cache username so we don't need async in onSubmitGuess 
  private mySocketId = '';

  private roomStateSub?: Subscription;
  private opponentGuessSub?: Subscription;
  private playerWonSub?: Subscription;

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
    this.subscribeToRoomUpdates();
    this.subscribeToOpponentEvents();

    this.route.queryParamMap.subscribe(params => {
      const loadSaved = params.get('loadSaved');
      const aiTopic = params.get('topic');
      const topicIdParam = params.get('id');
      const topicId = topicIdParam ? Number(topicIdParam) : NaN;
      const room = params.get('room')?.trim();

      if (room && room.length > 0) {
        this.currentRoom = room;
        this.isMultiplayer = true;

        this.auth.user$.pipe(take(1)).subscribe(user => {
          if (user?.sub) {
            // Fetch custom username from MongoDB
            this.http.get<any>(`/api/profile/${encodeURIComponent(user.sub)}`).subscribe({
              next: (mongoUser) => {
                const baseUsername = mongoUser?.username || user?.name || user?.email?.split('@')[0] || 'Guest';
                this.myUsername = baseUsername;
                this.multiplayerService.joinRoom(room, baseUsername);
                setTimeout(() => {
                  this.mySocketId = this.multiplayerService.getSocketId();
                }, 1000);
              },
              error: () => {
                // Fallback if profile fetch fails
                const baseUsername = user?.name || user?.email?.split('@')[0] || 'Guest';
                this.myUsername = baseUsername;
                this.multiplayerService.joinRoom(room, baseUsername);
                setTimeout(() => {
                  this.mySocketId = this.multiplayerService.getSocketId();
                }, 1000);
              }
            });
          } else {
            // Not logged in
            this.myUsername = 'Guest';
            this.multiplayerService.joinRoom(room, 'Guest');
            setTimeout(() => {
              this.mySocketId = this.multiplayerService.getSocketId();
            }, 1000);
    }
  });

  this.loadGame({ room });
  return;
}
      console.log('[Promptle] Single-player mode');
      this.isMultiplayer = false;
      this.multiplayerService.leaveRoom();

      if (loadSaved === 'true') {
        this.gameError = '';
        this.auth.user$.pipe(take(1)).subscribe(user => {
          if (user && user.sub) {
            this.http.get<any>(`/api/load-game/${encodeURIComponent(user.sub)}`).subscribe({
              next: (payload) => {
                if (payload && payload.topic) {
                  this.applySavedPayload(payload);
                } else {
                  this.gameError = 'No saved game found.';
                }
              },
              error: () => {
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

  private subscribeToOpponentEvents() {
    this.opponentGuessSub = this.multiplayerService.onOpponentGuess().subscribe(data => {
      console.log('[Promptle] opponent-guess received:', data);
      this.players = this.players.map(p =>
        p.id === data.playerId  // ← match by ID not name
          ? { ...p, colors: data.colors, won: data.isCorrect }
          : p
      );
      this.cdr.detectChanges();
    });

    this.playerWonSub = this.multiplayerService.onPlayerWon().subscribe(data => {
      this.players = this.players.map(p =>
        p.id === data.playerId 
          ? { ...p, won: true, guesses: data.guesses } 
          : p
      );
      this.cdr.detectChanges();
    });
  }

  private subscribeToRoomUpdates() {
     if (this.roomStateSub) this.roomStateSub.unsubscribe();

    this.roomStateSub = this.multiplayerService.roomState$.subscribe(state => {
      if (state) {
        const myId = this.multiplayerService.getSocketId();
        this.players = state.players.map(newPlayer => {
          const existing = this.players.find(p => p.id === newPlayer.id);
          return existing
            ? { ...existing, ...newPlayer, isMe: newPlayer.id === myId }
            : { ...newPlayer, isMe: newPlayer.id === myId };
        });
        this.currentRoom = state.roomId;
      } else {
        this.players = [];
        this.currentRoom = '';
      }
      this.cdr.detectChanges();
    });
  }

  saveGame() {
    if (this.isMultiplayer) return;
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

  loadSavedGame(): boolean {
    if (this.isMultiplayer) return false;
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

  restartGame() {
    if (this.isMultiplayer) return;
    if (!this.answers || this.answers.length === 0) return;

    if (this.answers.length === 1) {
      this.submittedGuesses = [];
      this.selectedGuess = '';
      this.guessQuery = '';
      this.filterAnswers(this.guessQuery);
      this.isGameOver = false;
      return;
    }

    const candidates = this.answers
      .map((a, idx) => ({ a, idx }))
      .filter(x => x.a.name !== this.correctAnswer.name);

    if (!candidates.length) {
      this.submittedGuesses = [];
      this.selectedGuess = '';
      this.guessQuery = '';
      this.filterAnswers(this.guessQuery);
      this.isGameOver = false;
      return;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const newCorrect = pick.a;

    this.correctAnswer = { name: newCorrect.name, values: [...newCorrect.values] };
    this.backendHeaders = [...this.headers];
    this.backendRow = [...newCorrect.values];
    this.submittedGuesses = [];
    this.selectedGuess = '';
    this.guessQuery = '';
    this.filterAnswers(this.guessQuery);
    this.isGameOver = false;
    this.gameError = '';
  }

  private loadGame(params: { topic?: string; topicId?: number; room?: string }) {
    this.gameLoading = true;
    this.gameError = '';

    this.dbGameService.fetchGame(params).subscribe({
      next: (data: GameData) => {
        this.applyGameData(data);
        this.gameLoading = false;
        if (this.isMultiplayer) this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading game data:', err);
        this.gameError = err?.error?.error ?? err?.message ?? 'Failed to load game data';
        this.gameLoading = false;
        if (this.isMultiplayer) this.cdr.detectChanges();
      }
    });
  }

  private applyGameData(data: GameData) {
    this.topic = data.topic;
    this.headers = data.headers;
    this.answers = data.answers;
    this.filterAnswers(this.guessQuery);
    this.correctAnswer = data.correctAnswer;

    const correct = this.answers.find(a => a.name === this.correctAnswer.name);
    if (correct) {
      this.backendHeaders = [...this.headers];
      this.backendRow = [...correct.values];
    } else {
      this.backendHeaders = [];
      this.backendRow = [];
    }

    this.submittedGuesses = [];
    this.selectedGuess = '';
    this.guessQuery = '';
    this.filterAnswers(this.guessQuery);
    if (this.isMultiplayer) this.cdr.detectChanges();
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

  tokenize(value: string): string[] {
    if (!value) return [];
    return value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  private handleWin() {
    this.isGameOver = true;
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

  onSubmitGuess() {
    if (this.isMultiplayer && this.currentRoom) {
      const myId = this.multiplayerService.getSocketId();
      console.log('[Debug] myId:', myId);
      console.log('[Debug] players:', this.players.map(p => ({ id: p.id, name: p.name })));
      // ... rest of code
    }
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

    const correctTokensSet = new Set<string>();
    correct.values.forEach(v => this.tokenize(v).forEach(t => correctTokensSet.add(t)));

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

    const isCorrect = this.selectedGuess === this.correctAnswer.name;

    this.submittedGuesses.push({
      name: guessed.name,
      values: [...guessed.values],
      colors: colors
    });

    // Update own colors in player list immediately (synchronously, no async needed)
    if (this.isMultiplayer && this.currentRoom) {
      const myId = this.multiplayerService.getSocketId();
      this.players = this.players.map(p =>
        p.id === myId  // ← match by ID not name
          ? { ...p, colors, won: isCorrect }
          : p
      );
      this.multiplayerService.emitGuess(this.currentRoom, this.myUsername, colors, isCorrect);
    }

    if (isCorrect) {
      this.handleWin();
    }

    this.selectedGuess = '';
    this.guessQuery = '';
    this.filterAnswers(this.guessQuery);
    if (this.isMultiplayer) this.cdr.detectChanges();
  }

  get playerNamesDisplay(): string {
    if (!this.players || this.players.length === 0) return 'empty';
    return this.players.map(p => p.name || 'Unknown').join(', ');
  }

  quitGame() {
    this.router.navigate(['/']);
  }

  ngOnDestroy() {
    this.opponentGuessSub?.unsubscribe();
    this.playerWonSub?.unsubscribe();
    this.roomStateSub?.unsubscribe();
    this.multiplayerService.leaveRoom();
  }
}