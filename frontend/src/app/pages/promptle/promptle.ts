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
import { MatSelectModule } from '@angular/material/select';

import { MultiplayerService } from '../../services/multiplayer-promptle';
import { Subscription } from 'rxjs';

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
export class PromptleComponent implements OnInit, OnDestroy {

  //─────────────────────────────────────
  // === Game state driven by backend ===
  //─────────────────────────────────────
  topic = '';
  headers: string[] = [];
  answers: { name: string; values: string[] }[] = [];
  correctAnswer: { name: string; values: string[] } = { name: '', values: [] };
  selectedGuess = '';
  isGameOver = false;
  submittedGuesses: { values: string[]; colors: string[] }[] = [];
  backendHeaders: string[] = [];
  backendRow: string[] = [];

  // Loading / error state
  gameLoading = false;
  gameError = '';

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
    private cdr: ChangeDetectorRef  // ← added for forcing UI updates
  ) { }

  ngOnInit() {
    // Subscribe early so we catch all updates
    this.subscribeToRoomUpdates();

    this.route.queryParamMap.subscribe(params => {
      const aiTopic = params.get('topic')?.trim();
      const topicIdParam = params.get('id');
      const room = params.get('room')?.trim();

      console.log('[Promptle] URL params:', { aiTopic, topicId: topicIdParam, room });

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

      if (aiTopic) {
        console.log('[Promptle] Loading AI topic:', aiTopic);
        this.loadGame({ topic: aiTopic });
        return;
      }

      if (topicIdParam) {
        const topicId = Number(topicIdParam);
        if (!isNaN(topicId)) {
          console.log('[Promptle] Loading DB topicId:', topicId);
          this.loadGame({ topicId });
          return;
        }
      }

      this.gameError = 'No valid topic, game ID, or room provided.';
      console.log('[Promptle] No valid params');
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

  private loadGame(options: { topic?: string; topicId?: number; room?: string }) {
    this.gameLoading = true;
    this.gameError = '';

    console.log('[Promptle] Loading game with options:', options);

    this.dbGameService.fetchGame(options).subscribe({
      next: (data: GameData) => {
        console.log('[Promptle] Game data loaded:', data);
        this.applyGameData(data);
        this.gameLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[Promptle] Load game error:', err);
        this.gameError = err?.error?.error ?? err?.message ?? 'Failed to load game data';
        this.gameLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  get playerNamesDisplay(): string {
    if (!this.players || this.players.length === 0) {
      return 'empty';
    }
    return this.players.map(p => p.name || 'Unknown').join(', ');
  }

  //─────────────────────────────────────
  // === Apply data, guess logic, win, quit, destroy ===
  //─────────────────────────────────────

  private applyGameData(data: GameData) {
    this.topic = data.topic;
    this.headers = data.headers;
    this.answers = data.answers;
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
    this.cdr.detectChanges();
  }

  tokenize(value: string): string[] {
    if (!value) return [];
    return value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  onSubmitGuess() {
    if (!this.selectedGuess || this.isGameOver) return;

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

    this.submittedGuesses.push({ values: guessed.values, colors });

    if (this.selectedGuess === this.correctAnswer.name) {
      this.handleWin();
    }

    this.selectedGuess = '';
    this.cdr.detectChanges();
  }

  private handleWin() {
    this.isGameOver = true;
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user?.sub) {
        this.http.post('http://localhost:3001/api/increment-win', { auth0Id: user.sub })
          .subscribe({
            next: () => console.log('Stat updated!'),
            error: (err) => console.error('Failed to update stats', err)
          });
      }
    });
    this.cdr.detectChanges();
  }

  quitGame() {
    this.router.navigate(['/']);
  }

  ngOnDestroy() {
    if (this.roomStateSub) {
      this.roomStateSub.unsubscribe();
    }
    this.multiplayerService.leaveRoom();
  }
}