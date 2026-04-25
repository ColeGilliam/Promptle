// promptle.component.ts
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import {
  DbGameService,
  GameCell,
  GameData,
  HydratedGameAnswer,
  hydrateGameData,
  tokenizeDisplay,
} from '../../services/setup-game';
import { ActivatedRoute, Router } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { AuthenticationService } from '../../services/authentication.service';
import { HttpClient } from '@angular/common/http';

import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { animate, style, transition, trigger } from '@angular/animations';

import { MultiplayerService } from '../../services/multiplayer-promptle';
import { Subscription, take } from 'rxjs';
import { PromptleGameCard } from '../../shared/ui/promptle-game-card/promptle-game-card';
import { PromptleWinPopup } from '../../shared/ui/promptle-win-popup/promptle-win-popup';
import { GameOnboardingTour } from '../../shared/ui/game-onboarding-tour/game-onboarding-tour';
import { GameHintBubble } from '../../shared/ui/game-hint-bubble/game-hint-bubble';
import { SettingsService } from '../../services/settings.service';

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
    PromptleGameCard,
    PromptleWinPopup,
    NavbarComponent,
    GameOnboardingTour,
    GameHintBubble
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
  answers: HydratedGameAnswer[] = [];
  filteredAnswers: HydratedGameAnswer[] = [];
  correctAnswer: HydratedGameAnswer = { name: '', cells: [], values: [] };
  selectedGuess = '';
  guessQuery = '';
  isGameOver = false;
  isViewingCompletedGame = false;

  submittedGuesses: { name?: string; values: string[]; colors: string[] }[] = [];

  backendHeaders: string[] = [];
  backendRow: string[] = [];

  gameLoading = false;
  gameError = '';
  savedTimestamp: string | null = null;

  // Contextual hint visibility
  showSkipTurnHint = true;
  showPowerupHint = true;

  //─────────────────────────────────────
  // === Share ===
  //─────────────────────────────────────
  private shareIdParam = '';
  private shareTopicParam = '';

  get guessColors(): string[][] {
    return this.submittedGuesses.map(g => g.colors);
  }

  get displayedSubmittedGuesses(): { name?: string; values: string[]; colors: string[] }[] {
    return this.reverseForDisplay(this.submittedGuesses);
  }

  get displayedSpectateGuesses(): { playerId: string; playerName: string; values: string[]; colors: string[]; isMe: boolean }[] {
    return this.reverseForDisplay(this.spectateGuesses);
  }

  get displayedOneVsOneGuesses(): {
    guesserSocketId: string;
    guesserName: string;
    values: string[];
    colors: string[];
    isMe: boolean;
  }[] {
    return this.reverseForDisplay(this.oneVsOneGuesses);
  }

  private reverseForDisplay<T>(items: T[]): T[] {
    return [...items].reverse();
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
  isDevAccount = false;
  private myAuth0Id = '';

  // Stopwatch
  stopwatchMs = 0;
  myFinishTimeMs: number | null = null;
  private stopwatchInterval: ReturnType<typeof setInterval> | null = null;

  // Power-ups
  powerupsUsed = { blackout: false, peek: false, freeze: false };
  activePowerupEffect: { type: string; fromPlayerName: string; secondsLeft: number } | null = null;
  powerupHint: { column: string; value: string } | null = null;
  singlePlayerHint: { column: string; value: string } | null = null;
  singlePlayerHintUsed = false;
  private blackoutInterval: ReturnType<typeof setInterval> | null = null;
  private powerupHintTimeout: ReturnType<typeof setTimeout> | null = null;

  // Chaos incoming effects (shown to the victim)
  isFrozen = false;
  freezeSecondsLeft = 0;
  private freezeInterval: ReturnType<typeof setInterval> | null = null;

  isChaos = false;  // true when mode === 'chaos' (has power-ups)

  //─────────────────────────────────────
  // === Spectate state ===
  //─────────────────────────────────────
  isSpectating = false;
  spectateGuesses: { playerId: string; playerName: string; values: string[]; colors: string[]; isMe: boolean }[] = [];

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
    private cdr: ChangeDetectorRef,
    private settings: SettingsService
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

    this.multiplayerService.onRoomDeleted().subscribe(() => {
      this.router.navigate(['/']);
    });

    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user) {
        this.isDevAccount = user.email === 'promptle99@gmail.com';
        this.myAuth0Id = user.sub ?? '';
      }
    });

    this.route.queryParamMap.subscribe(params => {
      const loadSaved    = params.get('loadSaved');
      const restartSaved = params.get('restartSaved');
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
                const name = mongoUser?.username || 'Player';
                this.myUsername = name;
                this.multiplayerService.joinRoom(room, name);
                setTimeout(() => { this.mySocketId = this.multiplayerService.getSocketId(); }, 1000);
              },
              error: () => {
                const name = 'Player';
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

      if (restartSaved === 'true') {
        this.gameError = '';
        this.restoreSavedGame(true);
        return;
      }

      if (loadSaved === 'true') {
        this.gameError = '';
        this.restoreSavedGame(false);
        return;
      }

      if (aiTopic && aiTopic.trim()) {
        this.shareTopicParam = aiTopic.trim();
        this.shareIdParam = '';
        this.auth.user$.pipe(take(1)).subscribe(user => {
          this.loadGame({ topic: aiTopic.trim(), auth0Id: user?.sub || '' });
        });
        return;
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
      this.powerupsUsed = { blackout: false, peek: false, freeze: false };
      this.isFrozen = false;
      this.cdr.detectChanges();
    });

    this.powerupSub = this.multiplayerService.onPowerupEffect().subscribe(data => {
      if (this.isSpectating) return;
      if (data.type === 'blackout') this.startBlackout(data.fromPlayerName);
      if (data.type === 'freeze')   this.startFreeze();
      this.cdr.detectChanges();
    });
  }

  // ─── 1v1 subscriptions ────────────────────────────────────────────────
  private subscribeToOneVsOne() {
    const sub1 = this.multiplayerService.on1v1Started().subscribe(data => {
      console.log('[Promptle] 1v1 started! First turn:', data.currentTurnPlayerName);
      this.gameStarted = true;
      this.powerupsUsed = { blackout: false, peek: false, freeze: false };
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
        // submittedGuesses was already updated optimistically in onSubmitGuess — skip re-add.
        // Just update the player's color indicator in the player list.
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

  usePowerup(type: 'blackout' | 'peek' | 'freeze') {
    if (this.powerupsUsed[type] || !this.isMultiplayer || !this.gameStarted || this.isGameOver) return;
    this.powerupsUsed[type] = true;

    if (type === 'blackout') {
      this.multiplayerService.emitPowerup(this.currentRoom, 'blackout', this.myUsername);
    } else if (type === 'freeze') {
      this.multiplayerService.emitPowerup(this.currentRoom, 'freeze', this.myUsername);
    } else {
      this.useRevealHint('peek');
    }
    this.cdr.detectChanges();
  }

  useSinglePlayerHint() {
    if (this.isMultiplayer || this.singlePlayerHintUsed || this.isGameOver) return;
    this.useRevealHint('singleplayer');
  }

  canUseSinglePlayerHint(): boolean {
    return !this.isMultiplayer && !this.isGameOver && !this.singlePlayerHintUsed && this.getRevealHintCandidateIndexes('singleplayer').length > 0;
  }

  private useRevealHint(mode: 'peek' | 'singleplayer') {
    const hint = this.getRevealHint(mode);
    if (!hint) return;

    if (mode === 'singleplayer') {
      this.singlePlayerHint = hint;
      this.singlePlayerHintUsed = true;
      return;
    }

    this.powerupHint = hint;
    if (this.powerupHintTimeout) clearTimeout(this.powerupHintTimeout);
    this.powerupHintTimeout = setTimeout(() => {
      this.powerupHint = null;
      this.cdr.detectChanges();
    }, 9000);
  }

  private getRevealHint(mode: 'peek' | 'singleplayer'): { column: string; value: string } | null {
    if (!this.correctAnswer?.values?.length || !this.headers?.length) return null;
    const candidates = this.getRevealHintCandidateIndexes(mode);
    if (!candidates.length) return null;
    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    return { column: this.headers[idx], value: this.correctAnswer.values[idx] };
  }

  private getRevealHintCandidateIndexes(mode: 'peek' | 'singleplayer'): number[] {
    const columnStates = this.getBestKnownColumnStates();
    const excludedColumns = new Set<number>([0]);
    const grayCandidates: number[] = [];
    const yellowCandidates: number[] = [];

    if (mode === 'singleplayer' && this.singlePlayerHint) {
      const hintedIndex = this.headers.indexOf(this.singlePlayerHint.column);
      if (hintedIndex >= 0) excludedColumns.add(hintedIndex);
    }

    columnStates.forEach((state, index) => {
      if (excludedColumns.has(index)) return;
      if (state === 'green') {
        excludedColumns.add(index);
        return;
      }
      if (state === 'gray') {
        grayCandidates.push(index);
        return;
      }
      if (state === 'yellow') yellowCandidates.push(index);
    });

    return grayCandidates.length ? grayCandidates : yellowCandidates;
  }

  private getBestKnownColumnStates(): string[] {
    const bestStates = this.headers.map(() => 'gray');
    const colorPriority: Record<string, number> = { gray: 0, yellow: 1, green: 2 };

    this.submittedGuesses.forEach(guess =>
      guess.colors.forEach((color, index) => {
        const normalizedColor = color === 'green' || color === 'yellow' ? color : 'gray';
        if ((colorPriority[normalizedColor] ?? 0) > (colorPriority[bestStates[index]] ?? 0)) {
          bestStates[index] = normalizedColor;
        }
      })
    );

    return bestStates;
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

  private startFreeze() {
    const DURATION = 8;
    this.isFrozen = true;
    this.freezeSecondsLeft = DURATION;
    if (this.freezeInterval) clearInterval(this.freezeInterval);
    this.freezeInterval = setInterval(() => {
      this.freezeSecondsLeft--;
      if (this.freezeSecondsLeft <= 0) {
        this.isFrozen = false;
        clearInterval(this.freezeInterval!);
        this.freezeInterval = null;
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
      if (data.values?.length) {
        this.spectateGuesses.push({
          playerId: data.playerId,
          playerName: data.playerName,
          values: data.values,
          colors: data.colors,
          isMe: false
        });
      }
      this.cdr.detectChanges();
    });

    this.playerWonSub = this.multiplayerService.onPlayerWon().subscribe(data => {
      const finishSecs = data.finishTime != null ? Math.round(data.finishTime / 1000) : null;
      const formattedTime = finishSecs != null ? `${finishSecs} second${finishSecs === 1 ? '' : 's'}` : undefined;
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
          const isMe = newPlayer.id === myId;
          const existing = this.players.find(p => p.id === newPlayer.id);
          return existing
            ? { ...existing, ...newPlayer, isMe }
            : { ...newPlayer, isMe };
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
      isGameOver: this.isGameOver,
      singlePlayerHint: this.singlePlayerHint,
      singlePlayerHintUsed: this.singlePlayerHintUsed
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

  private restoreSavedGame(clearProgress: boolean): void {
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user && user.sub) {
        this.http.get<any>(`/api/load-game/${encodeURIComponent(user.sub)}`).subscribe({
          next:  (payload) => payload?.topic ? this.applySavedPayload(payload, { clearProgress }) : (this.gameError = 'No saved game found.'),
          error: ()        => (this.gameError = 'No saved game found.')
        });
        return;
      }

      if (!this.loadFromLocalStorage(clearProgress)) this.gameError = 'No saved game found.';
    });
  }

  private loadFromLocalStorage(clearProgress: boolean = false): boolean {
    try {
      const raw = localStorage.getItem('promptle_saved_game');
      if (!raw) return false;
      const payload = JSON.parse(raw);
      if (!payload?.topic) return false;
      this.applySavedPayload(payload, { clearProgress });
      return true;
    } catch (e) { return false; }
  }

  private applySavedPayload(payload: any, options: { clearProgress?: boolean } = {}) {
    const clearProgress = !!options.clearProgress;
    const hydrated = hydrateGameData({
      topic: payload?.topic,
      headers: payload?.headers,
      answers: payload?.answers,
      correctAnswer: payload?.correctAnswer,
      mode: payload?.mode,
    });

    this.topic   = hydrated.topic;
    this.headers = hydrated.headers;
    this.answers = hydrated.answers;
    this.submittedGuesses = clearProgress ? [] : Array.isArray(payload.submittedGuesses)
      ? payload.submittedGuesses.map((g: any) => ({
          name:   typeof g?.name === 'string' ? g.name : undefined,
          values: Array.isArray(g?.values) ? g.values : [],
          colors: Array.isArray(g?.colors) ? g.colors : []
        }))
      : [];
    this.selectedGuess  = '';
    this.guessQuery     = '';
    this.filterAnswers(this.guessQuery);
    this.correctAnswer  = hydrated.correctAnswer;
    this.isGameOver     = clearProgress ? false : !!payload.isGameOver;
    this.isViewingCompletedGame = false;
    this.savedTimestamp = clearProgress ? null : payload.savedAt ? new Date(payload.savedAt).toLocaleString() : null;
    this.gameError      = '';
    this.myFinishTimeMs = null;
    this.singlePlayerHint = clearProgress || !payload?.singlePlayerHint
      ? null
      : {
          column: typeof payload.singlePlayerHint.column === 'string' ? payload.singlePlayerHint.column : '',
          value: typeof payload.singlePlayerHint.value === 'string' ? payload.singlePlayerHint.value : ''
        };
    this.singlePlayerHintUsed = clearProgress ? false : !!payload?.singlePlayerHintUsed;

    const correct = this.answers.find(a => a.name === this.correctAnswer.name);
    if (correct) {
      this.backendHeaders = [...this.headers];
      this.backendRow     = [...correct.values];
    } else {
      this.backendHeaders = [];
      this.backendRow     = [];
    }

    if (!this.isMultiplayer && !this.isGameOver) {
      this.stopStopwatch();
      this.startStopwatch();
    }
  }

  restartGame() {
    if (this.isMultiplayer) return;

    this.isGameOver             = false;
    this.isViewingCompletedGame = false;
    this.submittedGuesses       = [];
    this.selectedGuess          = '';
    this.guessQuery             = '';
    this.myFinishTimeMs         = null;
    this.gameError              = '';
    this.singlePlayerHint       = null;
    this.singlePlayerHintUsed   = false;
    this.showSkipTurnHint       = true;
    this.showPowerupHint        = true;
    this.stopStopwatch();

    if (this.shareIdParam) {
      this.loadGame({ topicId: Number(this.shareIdParam) });
    } else if (this.shareTopicParam) {
      this.loadGame({ topic: this.shareTopicParam, auth0Id: this.myAuth0Id });
    } else if (this.answers?.length) {
      const candidates = this.answers.filter(a => a.name !== this.correctAnswer.name);
      const pool = candidates.length ? candidates : this.answers;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      this.correctAnswer  = { name: pick.name, cells: [...pick.cells], values: [...pick.values] };
      this.headers        = [...this.headers];
      this.backendHeaders = [...this.headers];
      this.backendRow     = [...pick.values];
      this.filterAnswers(this.guessQuery);
      this.startStopwatch();
    }
  }

  private loadGame(params: { topic?: string; topicId?: number; room?: string; answer?: string; auth0Id?: string }) {
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
    const hydrated = hydrateGameData(data);

    this.topic   = hydrated.topic;
    this.headers = hydrated.headers;
    this.answers = hydrated.answers;
    this.filterAnswers(this.guessQuery);
    this.correctAnswer = hydrated.correctAnswer;

    if (hydrated.mode === '1v1') this.isOneVsOne = true;
    if (hydrated.mode === 'chaos') this.isChaos = true;

    const correct = this.answers.find(a => a.name === this.correctAnswer.name);
    this.backendHeaders = correct ? [...this.headers] : [];
    this.backendRow     = correct ? [...correct.values] : [];

    this.submittedGuesses = [];
    this.selectedGuess    = '';
    this.guessQuery       = '';
    this.isGameOver       = false;
    this.isViewingCompletedGame = false;
    this.singlePlayerHint = null;
    this.singlePlayerHintUsed = false;
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
    const result = norm
      ? available.filter(a => a.name.toLowerCase().includes(norm))
      : [...available];
    this.filteredAnswers = result;
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

  // Evaluate guess colors based on the guessed cells and the correct answer's cells.
  private evaluateGuessColors(guessedCells: GameCell[], correctCells: GameCell[]): string[] {
    return guessedCells.map((cell, i) => this.getCellColor(cell, correctCells[i]));
  }

  // Determine the color of a cell based on its value and the correct answer's cell.
  private getCellColor(guessedCell?: GameCell, correctCell?: GameCell): string {
    const guessNorm = this.normalizeDisplay(guessedCell?.display ?? '');
    const correctNorm = this.normalizeDisplay(correctCell?.display ?? '');

    if (!guessNorm || !correctNorm) return 'gray';
    if (this.hasMatchingNumberValue(guessedCell, correctCell)) return 'green';
    if (guessNorm === correctNorm) return 'green';

    if (this.hasListItemMatch(guessedCell, correctCell)) return 'yellow';
    if (guessedCell?.kind === 'reference' || correctCell?.kind === 'reference') {
      return this.hasReferencePartMatch(guessedCell, correctCell) ? 'yellow' : 'gray';
    }
    if (this.hasTextTokenMatch(guessedCell, correctCell)) return 'yellow';
    return 'gray';
  }

  // For number-type cells: check if the 'value' part matches exactly (after confirming both are numbers).
  private hasMatchingNumberValue(guessedCell?: GameCell, correctCell?: GameCell): boolean {
    if (guessedCell?.kind !== 'number' || correctCell?.kind !== 'number') return false;

    const guessedValue = guessedCell.parts?.value;
    const correctValue = correctCell.parts?.value;
    return typeof guessedValue === 'number'
      && Number.isFinite(guessedValue)
      && guessedValue === correctValue;
  }

  // For list-type cells: check if there's at least one overlapping item after normalization.
  private hasListItemMatch(guessedCell?: GameCell, correctCell?: GameCell): boolean {
    const guessedItems = this.getComparableItems(guessedCell);
    const correctItems = this.getComparableItems(correctCell);
    if (!guessedItems.length || !correctItems.length) return false;

    return this.countOverlap(guessedItems, correctItems) >= 1;
  }

  // For reference-type cells: check if the 'label' part matches after normalization.
  private hasReferencePartMatch(guessedCell?: GameCell, correctCell?: GameCell): boolean {
    const guessedIsReference = guessedCell?.kind === 'reference';
    const correctIsReference = correctCell?.kind === 'reference';
    if (!guessedIsReference && !correctIsReference) return false;

    const guessedLabel = this.normalizeDisplay(String(guessedCell?.parts?.label ?? ''));
    const correctLabel = this.normalizeDisplay(String(correctCell?.parts?.label ?? ''));
    return !!guessedLabel && guessedLabel === correctLabel;
  }

  // For text-type cells: check if there's significant token overlap (at least 2 shared tokens) after normalization.
  private hasTextTokenMatch(guessedCell?: GameCell, correctCell?: GameCell): boolean {
    if (!guessedCell || !correctCell) return false;
    if (guessedCell.kind === 'number' || correctCell.kind === 'number') return false;

    const guessedTokens = this.getComparableTokens(guessedCell);
    const correctTokens = this.getComparableTokens(correctCell);
    return this.countOverlap(guessedTokens, correctTokens) >= 2;
  }

  // For list-type cells: extract and normalize the list items for comparison.
  private getComparableItems(cell?: GameCell): string[] {
    if (!cell) return [];
    const items = Array.isArray(cell.items) ? cell.items : [];
    return items
      .map(item => this.normalizeDisplay(item))
      .filter(Boolean);
  }

  private getComparableTokens(cell?: GameCell): string[] {
    if (!cell) return [];
    const tokens = Array.isArray(cell.parts?.tokens) && cell.parts.tokens.length
      ? cell.parts.tokens
      : tokenizeDisplay(cell.display);

    return Array.from(new Set(tokens.map((token: string) => this.normalizeDisplay(token)).filter(Boolean)));
  }

  private normalizeDisplay(value: string): string {
    return tokenizeDisplay(value).join(' ');
  }

  // Count the number of overlapping items between two arrays of strings.
  private countOverlap(left: string[], right: string[]): number {
    if (!left.length || !right.length) return 0;
    const rightSet = new Set(right);
    let count = 0;
    for (const value of new Set(left)) {
      if (rightSet.has(value)) count++;
    }
    return count;
  }

  private handleWin() {
    this.isGameOver = true;
    this.isViewingCompletedGame = false;
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

    const colors = this.evaluateGuessColors(guessed.cells, correct.cells);

    const isCorrect = this.selectedGuess === this.correctAnswer.name;
    const finishMs  = isCorrect ? this.stopwatchMs : undefined;

    this.selectedGuess = '';
    this.guessQuery    = '';

    if (this.isOneVsOne) {
      // Add to submittedGuesses immediately so the dropdown filter removes this answer right away.
      // on1v1GuessMade will handle adding to oneVsOneGuesses (the shared grid) once server confirms.
      this.submittedGuesses.push({ name: guessed.name, values: [...guessed.values], colors });
      this.filterAnswers(this.guessQuery);
      this.multiplayerService.emit1v1Guess(
        this.currentRoom, this.myUsername, guessed.values, colors, isCorrect, finishMs
      );
      if (this.isMultiplayer) this.cdr.detectChanges();
      return;
    }

    // Standard (non-1v1) flow
    this.submittedGuesses.push({ name: guessed.name, values: [...guessed.values], colors });
    this.filterAnswers(this.guessQuery);

    if (this.isMultiplayer && this.currentRoom) {
      const myId = this.multiplayerService.getSocketId();
      this.players = this.players.map(p =>
        p.id === myId ? { ...p, colors, won: isCorrect } : p
      );
      this.spectateGuesses.push({
        playerId: myId,
        playerName: this.myUsername,
        values: [...guessed.values],
        colors,
        isMe: true
      });
      this.multiplayerService.emitGuess(this.currentRoom, this.myUsername, colors, isCorrect, finishMs, [...guessed.values]);
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

  viewCompletedGame() {
    if (!this.isGameOver) return;
    this.isViewingCompletedGame = true;
  }

  returnToResultsPopup() {
    if (!this.isGameOver) return;
    this.isViewingCompletedGame = false;
  }

  deleteCurrentRoom() {
    if (!this.isDevAccount || !this.currentRoom) return;
    if (!confirm(`Delete room ${this.currentRoom}? All players will be removed.`)) return;
    this.http.delete(`/api/game/rooms/${this.currentRoom}`, { body: { auth0Id: this.myAuth0Id } }).subscribe({
      next: () => {
        this.multiplayerService.emitDeleteRoom(this.currentRoom);
        this.router.navigate(['/']);
      },
      error: (err) => alert(err?.error?.error || 'Failed to delete room.'),
    });
  }

  startSpectating() {
    this.isSpectating = true;
    this.cdr.detectChanges();
  }

  get noGameAnims(): boolean {
    return !this.settings.getGameAnimations();
  }

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
    if (this.freezeInterval) clearInterval(this.freezeInterval);
    if (this.powerupHintTimeout) clearTimeout(this.powerupHintTimeout);
    this.multiplayerService.leaveRoom();
  }
}
