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
  // === Game state ===
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
  // === Share ===
  //─────────────────────────────────────
  private shareIdParam = '';
  private shareTopicParam = '';

  get guessColors(): string[][] {
    return this.submittedGuesses.map(g => g.colors);
  }

  get shareUrl(): string {
    const grid = this.submittedGuesses
      .map(g => g.colors.map(c => c === 'green' ? 'G' : c === 'yellow' ? 'Y' : 'N').join(''))
      .join('-');
    const p = new URLSearchParams({ topicname: this.topic, grid });
    if (this.shareIdParam) p.set('id', this.shareIdParam);
    if (this.shareTopicParam) p.set('topic', this.shareTopicParam);
    if (this.shareIdParam && this.correctAnswer.name) p.set('answer', this.correctAnswer.name);
    p.set('guesses', String(this.submittedGuesses.length));
    if (this.myFinishTimeMs !== null) p.set('time', String(this.myFinishTimeMs));
    return `${window.location.origin}/share?${p.toString()}`;
  }

  //─────────────────────────────────────
  // === Multiplayer ===
  //─────────────────────────────────────
  currentRoom = '';
  isMultiplayer = false;
  isHost = false;
  gameStarted = false;   // multiplayer: false until host fires start-game; SP: always true

  players: {
    id: string;
    name: string;
    colors?: string[];
    won?: boolean;
    isMe?: boolean;
    guesses?: number;
    finishTime?: string;
  }[] = [];

  private myUsername = '';
  private mySocketId = '';

  // Stopwatch
  stopwatchMs = 0;
  myFinishTimeMs: number | null = null;
  private stopwatchInterval: ReturnType<typeof setInterval> | null = null;

  // Power-ups
  powerupsUsed = { blackout: false, peek: false };
  activePowerupEffect: { type: string; fromPlayerName: string; secondsLeft: number } | null = null;
  powerupHint: { column: string; value: string } | null = null;
  private blackoutInterval: ReturnType<typeof setInterval> | null = null;
  private powerupHintTimeout: ReturnType<typeof setTimeout> | null = null;

  //─────────────────────────────────────
  // === 1v1 turn-based state ===
  //─────────────────────────────────────
  isOneVsOne = false;
  isMyTurn = false;
  turnTimeLeft = 30;
  currentTurnSocketId = '';
  currentTurnPlayerName = '';
  iLost = false;
  oneVsOneWinnerName = '';
  skipTurnUsed = false;   // 1v1 skip-turn power-up (once per game)
  oneVsOneGuesses: {
    guesserSocketId: string;
    guesserName: string;
    values: string[];
    colors: string[];
    isMe: boolean;
  }[] = [];
  private turnCountdownInterval: ReturnType<typeof setInterval> | null = null;
  private oneVsOneSubs: Subscription[] = [];

  private roomStateSub?:    Subscription;
  private opponentGuessSub?: Subscription;
  private playerWonSub?:    Subscription;
  private gameStartedSub?:  Subscription;
  private hostStatusSub?:   Subscription;
  private powerupSub?:      Subscription;
  private joinErrorSub?:    Subscription;

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
    this.subscribeToGameFlow();
    this.subscribeToOneVsOne();
    this.joinErrorSub = this.multiplayerService.onJoinError().subscribe(data => {
      this.gameError = data.message || 'Could not join room.';
      this.gameLoading = false;
      this.cdr.detectChanges();
    });

    this.route.queryParamMap.subscribe(params => {
      const loadSaved    = params.get('loadSaved');
      const aiTopic      = params.get('topic');
      const topicIdParam = params.get('id');
      const topicId      = topicIdParam ? Number(topicIdParam) : NaN;
      const room         = params.get('room')?.trim();
      const answerSeed   = params.get('answer') || undefined;

      if (room && room.length > 0) {
        this.currentRoom  = room;
        this.isMultiplayer = true;
        this.gameStarted  = false;

        this.auth.user$.pipe(take(1)).subscribe(user => {
          if (user?.sub) {
            this.http.get<any>(`/api/profile/${encodeURIComponent(user.sub)}`).subscribe({
              next: (mongoUser) => {
                const name = mongoUser?.username || user?.name || user?.email?.split('@')[0] || 'Guest';
                this.myUsername = name;
                this.multiplayerService.joinRoom(room, name);
                setTimeout(() => { this.mySocketId = this.multiplayerService.getSocketId(); }, 1000);
              },
              error: () => {
                const name = user?.name || user?.email?.split('@')[0] || 'Guest';
                this.myUsername = name;
                this.multiplayerService.joinRoom(room, name);
                setTimeout(() => { this.mySocketId = this.multiplayerService.getSocketId(); }, 1000);
              }
            });
          } else {
            this.myUsername = 'Guest';
            this.multiplayerService.joinRoom(room, 'Guest');
            setTimeout(() => { this.mySocketId = this.multiplayerService.getSocketId(); }, 1000);
          }
        });

        this.loadGame({ room });
        return;
      }

      // ── Single-player ──
      console.log('[Promptle] Single-player mode');
      this.isMultiplayer = false;
      this.gameStarted   = true;   // SP starts immediately
      this.multiplayerService.leaveRoom();

      if (loadSaved === 'true') {
        this.gameError = '';
        this.auth.user$.pipe(take(1)).subscribe(user => {
          if (user && user.sub) {
            this.http.get<any>(`/api/load-game/${encodeURIComponent(user.sub)}`).subscribe({
              next:  (payload) => payload?.topic ? this.applySavedPayload(payload) : (this.gameError = 'No saved game found.'),
              error: ()        => (this.gameError = 'No saved game found.')
            });
          } else {
            if (!this.loadFromLocalStorage()) this.gameError = 'No saved game found.';
          }
        });
        return;
      }

      if (aiTopic && aiTopic.trim()) {
        this.shareTopicParam = aiTopic.trim();
        this.shareIdParam = '';
        this.loadGame({ topic: aiTopic.trim() }); return;
      }
      if (!isNaN(topicId)) {
        this.shareIdParam = String(topicId);
        this.shareTopicParam = '';
        this.loadGame({ topicId, answer: answerSeed }); return;
      }

      this.gameError = 'No valid topic or game ID provided.';
    });
  }

  // ─── Game-flow subscriptions (host status + game started) ───────────────
  private subscribeToGameFlow() {
    this.hostStatusSub = this.multiplayerService.onHostStatus().subscribe(data => {
      this.isHost = data.isHost;
      console.log('[Promptle] isHost:', this.isHost);
      this.cdr.detectChanges();
    });

    this.gameStartedSub = this.multiplayerService.onGameStarted().subscribe(() => {
      console.log('[Promptle] Game started (standard)!');
      this.gameStarted = true;
      this.startStopwatch();
      this.powerupsUsed = { blackout: false, peek: false };
      this.cdr.detectChanges();
    });

    this.powerupSub = this.multiplayerService.onPowerupEffect().subscribe(data => {
      if (data.type === 'blackout') this.startBlackout(data.fromPlayerName);
      this.cdr.detectChanges();
    });
  }

  // ─── 1v1 subscriptions ────────────────────────────────────────────────
  private subscribeToOneVsOne() {
    const sub1 = this.multiplayerService.on1v1Started().subscribe(data => {
      console.log('[Promptle] 1v1 started! First turn:', data.currentTurnPlayerName);
      this.gameStarted = true;
      this.powerupsUsed = { blackout: false, peek: false };
      this.skipTurnUsed = false;
      this.currentTurnSocketId = data.currentTurnSocketId;
      this.currentTurnPlayerName = data.currentTurnPlayerName;
      const myId = this.multiplayerService.getSocketId() || this.mySocketId;
      this.isMyTurn = data.currentTurnSocketId === myId;
      this.startTurnCountdown();  // always run on both screens
      this.cdr.detectChanges();
    });

    const sub2 = this.multiplayerService.on1v1TurnChange().subscribe(data => {
      this.stopTurnCountdown();
      this.currentTurnSocketId = data.currentTurnSocketId;
      this.currentTurnPlayerName = data.currentTurnPlayerName;
      this.turnTimeLeft = 30;
      const myId = this.multiplayerService.getSocketId() || this.mySocketId;
      this.isMyTurn = data.currentTurnSocketId === myId;
      this.startTurnCountdown();  // always run on both screens
      this.cdr.detectChanges();
    });

    const sub3 = this.multiplayerService.on1v1GuessMade().subscribe(data => {
      const myId = this.multiplayerService.getSocketId() || this.mySocketId;
      const isMe = data.guesserSocketId === myId;
      this.oneVsOneGuesses.push({
        guesserSocketId: data.guesserSocketId,
        guesserName: data.guesserName,
        values: data.guessValues,
        colors: data.guessColors,
        isMe,
      });
      if (isMe) {
        // Also track in submittedGuesses so win popup has correct count
        this.submittedGuesses.push({ name: data.guesserName, values: data.guessValues, colors: data.guessColors });
        this.players = this.players.map(p =>
          p.id === myId ? { ...p, colors: data.guessColors, won: data.isCorrect } : p
        );
      }
      this.cdr.detectChanges();
    });

    const sub4 = this.multiplayerService.on1v1GameOver().subscribe(data => {
      this.stopTurnCountdown();
      const myId = this.multiplayerService.getSocketId() || this.mySocketId;
      this.oneVsOneWinnerName = data.winnerName;
      if (data.winnerId === myId) {
        this.myFinishTimeMs = data.finishMs ?? this.stopwatchMs;
        this.handleWin();
      } else {
        this.iLost = true;
        this.isGameOver = true;
        this.stopStopwatch();
      }
      this.cdr.detectChanges();
    });

    const sub5 = this.multiplayerService.on1v1PlayerDisconnected().subscribe(data => {
      console.log('[Promptle] 1v1 player disconnected:', data.playerName);
      this.cdr.detectChanges();
    });

    this.oneVsOneSubs = [sub1, sub2, sub3, sub4, sub5];
  }

  // ─── Host action: start game ──────────────────────────────────────────
  hostStartGame() {
    if (!this.isHost || !this.currentRoom) return;
    const mode = this.isOneVsOne ? '1v1' : 'standard';
    this.multiplayerService.startGame(this.currentRoom, mode);
  }

  // ─── 1v1 skip-turn power-up ───────────────────────────────────────────
  useSkipTurn() {
    if (this.skipTurnUsed || !this.isOneVsOne || this.isMyTurn || !this.gameStarted || this.isGameOver) return;
    this.skipTurnUsed = true;
    this.multiplayerService.emitSkipTurn(this.currentRoom);
    this.cdr.detectChanges();
  }

  usePowerup(type: 'blackout' | 'peek') {
    if (this.powerupsUsed[type] || !this.isMultiplayer || !this.gameStarted || this.isGameOver) return;
    this.powerupsUsed[type] = true;

    if (type === 'blackout') {
      this.multiplayerService.emitPowerup(this.currentRoom, 'blackout', this.myUsername);
    } else {
      const hint = this.getRevealHint();
      if (hint) {
        this.powerupHint = hint;
        this.powerupHintTimeout = setTimeout(() => {
          this.powerupHint = null;
          this.cdr.detectChanges();
        }, 9000);
      }
    }
    this.cdr.detectChanges();
  }

  private getRevealHint(): { column: string; value: string } | null {
    if (!this.correctAnswer?.values?.length || !this.headers?.length) return null;
    const greenCols = new Set<number>();
    this.submittedGuesses.forEach(g => g.colors.forEach((c, i) => { if (c === 'green') greenCols.add(i); }));
    const candidates = this.headers.map((_, i) => i).filter(i => !greenCols.has(i));
    if (!candidates.length) return null;
    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    return { column: this.headers[idx], value: this.correctAnswer.values[idx] };
  }

  private startBlackout(fromPlayerName: string) {
    const DURATION = 6;
    this.activePowerupEffect = { type: 'blackout', fromPlayerName, secondsLeft: DURATION };
    if (this.blackoutInterval) clearInterval(this.blackoutInterval);
    this.blackoutInterval = setInterval(() => {
      if (!this.activePowerupEffect) { clearInterval(this.blackoutInterval!); return; }
      this.activePowerupEffect.secondsLeft--;
      if (this.activePowerupEffect.secondsLeft <= 0) {
        this.activePowerupEffect = null;
        clearInterval(this.blackoutInterval!);
        this.blackoutInterval = null;
      }
      this.cdr.detectChanges();
    }, 1000);
  }

  // ─── Stopwatch helpers ────────────────────────────────────────────────
  private startStopwatch() {
    this.stopwatchMs = 0;
    this.stopwatchInterval = setInterval(() => {
      this.stopwatchMs += 100;
      this.cdr.detectChanges();
    }, 100);
  }

  private stopStopwatch() {
    if (this.stopwatchInterval) {
      clearInterval(this.stopwatchInterval);
      this.stopwatchInterval = null;
    }
  }

  formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min      = Math.floor(totalSec / 60);
    const sec      = totalSec % 60;
    const tenths   = Math.floor((ms % 1000) / 100);
    return `${min}:${String(sec).padStart(2, '0')}.${tenths}`;
  }

  // ─── Turn countdown helpers (1v1) ─────────────────────────────────────
  private startTurnCountdown() {
    this.turnTimeLeft = 30;
    this.turnCountdownInterval = setInterval(() => {
      this.turnTimeLeft--;
      if (this.turnTimeLeft <= 0) this.stopTurnCountdown();
      this.cdr.detectChanges();
    }, 1000);
  }

  private stopTurnCountdown() {
    if (this.turnCountdownInterval) {
      clearInterval(this.turnCountdownInterval);
      this.turnCountdownInterval = null;
    }
  }

  // ─── Opponent events ─────────────────────────────────────────────────
  private subscribeToOpponentEvents() {
    this.opponentGuessSub = this.multiplayerService.onOpponentGuess().subscribe(data => {
      console.log('[Promptle] opponent-guess received:', data);
      this.players = this.players.map(p =>
        p.id === data.playerId
          ? { ...p, colors: data.colors, won: data.isCorrect }
          : p
      );
      this.cdr.detectChanges();
    });

    this.playerWonSub = this.multiplayerService.onPlayerWon().subscribe(data => {
      const formattedTime = data.finishTime != null ? this.formatTime(data.finishTime) : undefined;
      this.players = this.players.map(p =>
        p.id === data.playerId
          ? { ...p, won: true, guesses: data.guesses, finishTime: formattedTime }
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

  // ─── Save / load ─────────────────────────────────────────────────────
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
          next:  () => { this.savedTimestamp = savedAtStr; },
          error: () => {
            try { localStorage.setItem('promptle_saved_game', JSON.stringify(payload)); this.savedTimestamp = savedAtStr; }
            catch (e) { this.gameError = 'Failed to save game'; }
          }
        });
      } else {
        try { localStorage.setItem('promptle_saved_game', JSON.stringify(payload)); this.savedTimestamp = savedAtStr; }
        catch (e) { this.gameError = 'Failed to save game'; }
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
      if (!payload?.topic) return false;
      this.applySavedPayload(payload);
      return true;
    } catch (e) { return false; }
  }

  private applySavedPayload(payload: any) {
    this.topic   = payload.topic;
    this.headers = payload.headers || [];
    this.answers = payload.answers || [];
    this.submittedGuesses = Array.isArray(payload.submittedGuesses)
      ? payload.submittedGuesses.map((g: any) => ({
          name:   typeof g?.name === 'string' ? g.name : undefined,
          values: Array.isArray(g?.values) ? g.values : [],
          colors: Array.isArray(g?.colors) ? g.colors : []
        }))
      : [];
    this.selectedGuess  = '';
    this.guessQuery     = '';
    this.filterAnswers(this.guessQuery);
    this.correctAnswer  = payload.correctAnswer || { name: '', values: [] };
    this.isGameOver     = !!payload.isGameOver;
    this.savedTimestamp = payload.savedAt ? new Date(payload.savedAt).toLocaleString() : null;

    const correct = this.answers.find(a => a.name === this.correctAnswer.name);
    if (correct) {
      this.backendHeaders = [...this.headers];
      this.backendRow     = [...correct.values];
    } else {
      this.backendHeaders = [];
      this.backendRow     = [];
    }
  }

  restartGame() {
    if (this.isMultiplayer) return;
    if (!this.answers?.length) return;

    const candidates = this.answers.filter(a => a.name !== this.correctAnswer.name);
    const pool = candidates.length ? candidates : this.answers;
    const pick = pool[Math.floor(Math.random() * pool.length)];

    this.correctAnswer    = { name: pick.name, values: [...pick.values] };
    this.backendHeaders   = [...this.headers];
    this.backendRow       = [...pick.values];
    this.submittedGuesses = [];
    this.selectedGuess    = '';
    this.guessQuery       = '';
    this.filterAnswers(this.guessQuery);
    this.isGameOver       = false;
    this.gameError        = '';
    this.myFinishTimeMs   = null;
    this.stopStopwatch();
    this.startStopwatch();
  }

  private loadGame(params: { topic?: string; topicId?: number; room?: string; answer?: string }) {
    this.gameLoading = true;
    this.gameError   = '';
    this.dbGameService.fetchGame(params).subscribe({
      next: (data: GameData) => {
        this.applyGameData(data);
        this.gameLoading = false;
        if (this.isMultiplayer) this.cdr.detectChanges();
      },
      error: (err) => {
        this.gameError   = err?.error?.error ?? err?.message ?? 'Failed to load game data';
        this.gameLoading = false;
        if (this.isMultiplayer) this.cdr.detectChanges();
      }
    });
  }

  private applyGameData(data: GameData) {
    this.topic   = data.topic;
    this.headers = data.headers;
    this.answers = data.answers;
    this.filterAnswers(this.guessQuery);
    this.correctAnswer = data.correctAnswer;

    if (data.mode === '1v1') {
      this.isOneVsOne = true;
    }

    const correct = this.answers.find(a => a.name === this.correctAnswer.name);
    this.backendHeaders = correct ? [...this.headers] : [];
    this.backendRow     = correct ? [...correct.values] : [];

    this.submittedGuesses = [];
    this.selectedGuess    = '';
    this.guessQuery       = '';
    this.filterAnswers(this.guessQuery);
    if (!this.isMultiplayer) {
      this.stopStopwatch();
      this.startStopwatch();
    }
    if (this.isMultiplayer) this.cdr.detectChanges();
  }

  // ─── Guess logic ─────────────────────────────────────────────────────
  onGuessQueryChange(query: string) {
    this.guessQuery = query;
    this.filterAnswers(query);
    const exact = this.filteredAnswers.find(a => a.name.toLowerCase() === query.trim().toLowerCase());
    this.selectedGuess = exact ? exact.name : '';
  }

  onGuessOptionSelected(answerName: string) {
    if (this.isAlreadyGuessed(answerName)) return;
    this.selectedGuess = answerName;
    this.guessQuery    = answerName;
    this.filterAnswers(answerName);
  }

  private filterAnswers(query: string) {
    const guessed   = this.getGuessedNamesLowercase();
    const available = this.answers.filter(a => !guessed.has(a.name.toLowerCase()));
    const norm      = query.trim().toLowerCase();
    this.filteredAnswers = norm
      ? available.filter(a => a.name.toLowerCase().includes(norm))
      : [...available];
  }

  private getGuessedNamesLowercase(): Set<string> {
    const set = new Set<string>();
    for (const guess of this.submittedGuesses) {
      if (guess.name?.trim()) { set.add(guess.name.trim().toLowerCase()); continue; }
      const matched = this.answers.find(a =>
        a.values.length === guess.values.length &&
        a.values.every((v, i) => v.trim().toLowerCase() === String(guess.values[i] ?? '').trim().toLowerCase())
      );
      if (matched) set.add(matched.name.toLowerCase());
    }
    return set;
  }

  private isAlreadyGuessed(name: string): boolean {
    return this.getGuessedNamesLowercase().has(name.trim().toLowerCase());
  }

  tokenize(value: string): string[] {
    if (!value) return [];
    return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }

  private handleWin() {
    this.isGameOver = true;
    this.stopStopwatch();
    if (this.isMultiplayer) return;
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user?.sub) {
        this.http.post('/api/increment-win', { auth0Id: user.sub })
          .subscribe({ error: (e) => console.error('Failed to update stats', e) });
      }
    });
  }

  onSubmitGuess() {
    if (!this.selectedGuess || this.isGameOver) return;
    if (this.isMultiplayer && !this.gameStarted) return;
    if (this.isOneVsOne && !this.isMyTurn) return;  // block if not player's turn
    if (this.isAlreadyGuessed(this.selectedGuess)) {
      this.selectedGuess = '';
      this.guessQuery    = '';
      this.filterAnswers(this.guessQuery);
      return;
    }

    const guessed = this.answers.find(a => a.name === this.selectedGuess);
    const correct = this.answers.find(a => a.name === this.correctAnswer.name);
    if (!guessed || !correct) return;

    const correctTokens = new Set<string>();
    correct.values.forEach(v => this.tokenize(v).forEach(t => correctTokens.add(t)));

    const colors = guessed.values.map((value, i) => {
      const cv = correct.values[i];
      if (value && cv && value.toLowerCase() === cv.toLowerCase()) return 'green';
      for (const t of this.tokenize(value)) if (correctTokens.has(t)) return 'yellow';
      return 'gray';
    });

    const isCorrect = this.selectedGuess === this.correctAnswer.name;
    const finishMs  = isCorrect ? this.stopwatchMs : undefined;

    this.selectedGuess = '';
    this.guessQuery    = '';
    this.filterAnswers(this.guessQuery);

    if (this.isOneVsOne) {
      // In 1v1 mode: emit to server; the broadcast '1v1-guess-made' will add to oneVsOneGuesses
      this.multiplayerService.emit1v1Guess(
        this.currentRoom, this.myUsername, guessed.values, colors, isCorrect, finishMs
      );
      if (this.isMultiplayer) this.cdr.detectChanges();
      return;
    }

    // Standard (non-1v1) flow
    this.submittedGuesses.push({ name: guessed.name, values: [...guessed.values], colors });

    if (this.isMultiplayer && this.currentRoom) {
      const myId = this.multiplayerService.getSocketId();
      this.players = this.players.map(p =>
        p.id === myId ? { ...p, colors, won: isCorrect } : p
      );
      this.multiplayerService.emitGuess(this.currentRoom, this.myUsername, colors, isCorrect, finishMs);
    }

    if (isCorrect) {
      this.myFinishTimeMs = this.stopwatchMs;
      this.handleWin();
    }

    if (this.isMultiplayer) this.cdr.detectChanges();
  }

  get playerNamesDisplay(): string {
    if (!this.players?.length) return 'empty';
    return this.players.map(p => p.name || 'Unknown').join(', ');
  }

  quitGame() { this.router.navigate(['/']); }

  ngOnDestroy() {
    this.stopStopwatch();
    this.stopTurnCountdown();
    this.opponentGuessSub?.unsubscribe();
    this.playerWonSub?.unsubscribe();
    this.roomStateSub?.unsubscribe();
    this.gameStartedSub?.unsubscribe();
    this.hostStatusSub?.unsubscribe();
    this.powerupSub?.unsubscribe();
    this.oneVsOneSubs.forEach(s => s.unsubscribe());
    this.joinErrorSub?.unsubscribe();
    if (this.blackoutInterval) clearInterval(this.blackoutInterval);
    if (this.powerupHintTimeout) clearTimeout(this.powerupHintTimeout);
    this.multiplayerService.leaveRoom();
  }
}
