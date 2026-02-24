// promptle.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
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
  players: { id: string; name: string; guesses?: number }[] = [];   // will come from service

  private roomStateSub?: Subscription;

  constructor(
    private dbGameService: DbGameService,
    private router: Router,
    private route: ActivatedRoute,
    private auth: AuthenticationService,
    private http: HttpClient,
    private multiplayerService: MultiplayerService   // ← added here
  ) { }

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      const aiTopic   = params.get('topic')?.trim();
      const topicIdParam = params.get('id');
      const room      = params.get('room')?.trim();

      // ────────────────────────────────────────────────
      // MULTIPLAYER MODE (room present in URL)
      // ────────────────────────────────────────────────
      if (room && room.length > 0) {
        this.currentRoom = room;
        this.isMultiplayer = true;

        // Join socket with real username
        this.auth.user$.pipe(take(1)).subscribe(user => {
          const username = user?.name || user?.email?.split('@')[0] || 'Guest';
          this.multiplayerService.joinRoom(room, username);
        });

        this.subscribeToRoomUpdates();

        // Load game using room code (string) as identifier
        this.loadGame({ room });  // ← now calls fetchGameByRoom
        return;
      }

      // ────────────────────────────────────────────────
      // SINGLE PLAYER MODE
      // ────────────────────────────────────────────────
      this.isMultiplayer = false;
      this.multiplayerService.leaveRoom();

      if (aiTopic) {
        this.loadGame({ topic: aiTopic });  // AI generation
        return;
      }

      if (topicIdParam) {
        const topicId = Number(topicIdParam);
        if (!isNaN(topicId)) {
          this.loadGame({ topicId });  // DB topic
          return;
        }
      }

      this.gameError = 'No valid topic, game ID, or room provided.';
    });
  }

  private subscribeToRoomUpdates() {
    this.roomStateSub = this.multiplayerService.roomState$.subscribe(state => {
      if (state) {
        this.players = state.players;
        this.currentRoom = state.roomId;
        console.log('Room updated — players:', this.players);
      } else {
        this.players = [];
        this.currentRoom = '';
      }
    });
  }

  /**
   * Fetch a game via unified service (AI or DB depending on params)
   */
  private loadGame(options: { topic?: string; topicId?: number; room?: string }) {
    this.gameLoading = true;
    this.gameError = '';

    this.dbGameService.fetchGame(options).subscribe({
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
  }

  //─────────────────────────────────────
  // === Guess & Scoring Logic ===
  //─────────────────────────────────────

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
  }

  quitGame() {
    this.router.navigate(['/']);
  }

  //─────────────────────────────────────
  // === Lifecycle Cleanup ===
  //─────────────────────────────────────
  ngOnDestroy() {
    if (this.roomStateSub) {
      this.roomStateSub.unsubscribe();
    }
    this.multiplayerService.leaveRoom();
  }
}