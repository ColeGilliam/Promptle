import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import {
  DailyGameMeta,
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
import { GameFeedbackService } from '../../services/game-feedback';
import { CustomGameSessionService } from '../../services/custom-game-session';

type GuessColor = 'green' | 'yellow' | 'gray';
type QuantitativeDirection = 'up' | 'down';
const QUANTITATIVE_CLOSE_RATIO = 0.25; // Number clues turn yellow when the guess is within this percent of the value range.
const PROMPTLE_GENERATION_ERROR = 'Sorry! The Promptle failed to generate. Please try again.';

interface GuessCellFeedback {
  color: GuessColor;
  direction?: QuantitativeDirection;
}

interface PromptleGuess {
  name?: string;
  values: string[];
  colors: GuessColor[];
  feedback: GuessCellFeedback[];
}

interface SpectateGuess extends PromptleGuess {
  playerId: string;
  playerName: string;
  isMe: boolean;
}

interface OneVsOneGuess extends PromptleGuess {
  guesserSocketId: string;
  guesserName: string;
  isMe: boolean;
}

interface PendingSpectateGuess {
  playerId: string;
  playerName: string;
  values: string[];
  colors: string[];
  isMe: boolean;
}

interface PendingOneVsOneGuess {
  guesserSocketId: string;
  guesserName: string;
  guessValues: string[];
  guessColors: string[];
  isMe: boolean;
}

interface DevSettingsResponse {
  showPromptleAnswerAtTop?: boolean;
  dailyGames?: {
    promptle?: {
      topic?: string;
      date?: string;
      available?: boolean;
    };
  };
}

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
  topic = '';
  headers: string[] = [];
  answers: HydratedGameAnswer[] = [];
  filteredAnswers: HydratedGameAnswer[] = [];
  correctAnswer: HydratedGameAnswer = { name: '', cells: [], values: [] };
  selectedGuess = '';
  guessQuery = '';
  isGameOver = false;
  isViewingCompletedGame = false;

  submittedGuesses: PromptleGuess[] = [];

  backendHeaders: string[] = [];
  backendRow: string[] = [];

  gameLoading = false;
  gameError = '';
  savedTimestamp: string | null = null;
  private serverSaveExists = false;

  get hasSavedGame(): boolean {
    if (this.isMultiplayer) return false;
    if (this.savedTimestamp) return true;
    if (this.serverSaveExists) return true;
    try { return !!localStorage.getItem('promptle_saved_game'); } catch { return false; }
  }

  // Contextual hint visibility
  showSkipTurnHint = true;
  showPowerupHint = true;
  private shareIdParam = '';
  private shareTopicParam = '';
  private currentSinglePlayerSource: 'custom' | 'popular' | 'daily' | '' = '';
  private currentDailyGame: DailyGameMeta | null = null;
  feedbackChoice: boolean | null = null;
  feedbackSubmitting = false;
  feedbackError = '';
  private customSessionPlayId = '';
  private customSessionInteracted = false;
  private customSessionFinalized = false;

  get guessColors(): GuessColor[][] {
    return this.submittedGuesses.map(g => g.colors);
  }

  get displayedSubmittedGuesses(): PromptleGuess[] {
    return this.reverseForDisplay(this.submittedGuesses);
  }

  get displayedSpectateGuesses(): SpectateGuess[] {
    return this.reverseForDisplay(this.spectateGuesses);
  }

  get displayedOneVsOneGuesses(): OneVsOneGuess[] {
    return this.reverseForDisplay(this.oneVsOneGuesses);
  }

  private reverseForDisplay<T>(items: T[]): T[] {
    return [...items].reverse();
  }

  private queueSpectateGuess(guess: PendingSpectateGuess): void {
    this.pendingSpectateGuesses.push(guess);
  }

  private queueOneVsOneGuess(guess: PendingOneVsOneGuess): void {
    this.pendingOneVsOneGuesses.push(guess);
  }

  private addSpectateGuess(guess: PendingSpectateGuess): void {
    const remoteGuess = this.createGuessEntry({
      values: guess.values,
      colors: guess.colors,
    });
    this.spectateGuesses.push({
      playerId: guess.playerId,
      playerName: guess.playerName,
      values: remoteGuess.values,
      colors: remoteGuess.colors,
      feedback: remoteGuess.feedback,
      isMe: guess.isMe,
    });
  }

  private addOneVsOneGuess(guess: PendingOneVsOneGuess): void {
    const remoteGuess = this.createGuessEntry({
      values: guess.guessValues,
      colors: guess.guessColors,
    });
    this.oneVsOneGuesses.push({
      guesserSocketId: guess.guesserSocketId,
      guesserName: guess.guesserName,
      values: remoteGuess.values,
      colors: remoteGuess.colors,
      feedback: remoteGuess.feedback,
      isMe: guess.isMe,
    });
  }

  private flushPendingMultiplayerGuesses(): void {
    this.pendingSpectateGuesses.forEach((guess) => this.addSpectateGuess(guess));
    this.pendingOneVsOneGuesses.forEach((guess) => this.addOneVsOneGuess(guess));
    this.pendingSpectateGuesses = [];
    this.pendingOneVsOneGuesses = [];
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

  get rankedPlayers(): { id: string; name: string; score: number; guesses: number; finishTimeMs?: number; isMe?: boolean }[] {
    return this.players
      .filter(p => p.won && p.score != null && p.guesses != null)
      .map(p => ({ id: p.id, name: p.name, score: p.score!, guesses: p.guesses!, finishTimeMs: p.finishTimeMs, isMe: p.isMe }))
      .sort((a, b) => b.score - a.score || (a.finishTimeMs ?? Infinity) - (b.finishTimeMs ?? Infinity));
  }

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
    finishTimeMs?: number;
    score?: number;
  }[] = [];

  private myUsername = '';
  private mySocketId = '';
  showPromptleAnswerAtTop = false;
  isDevAccount = false;
  private myAuth0Id = '';

  stopwatchMs = 0;
  myFinishTimeMs: number | null = null;
  private stopwatchInterval: ReturnType<typeof setInterval> | null = null;

  powerupsUsed = { blackout: false, peek: false, freeze: false };
  activePowerupEffect: { type: string; fromPlayerName: string; secondsLeft: number } | null = null;
  powerupHint: { column: string; value: string } | null = null;
  singlePlayerHint: { column: string; value: string } | null = null;
  singlePlayerHintUsed = false;
  private blackoutInterval: ReturnType<typeof setInterval> | null = null;
  private powerupHintTimeout: ReturnType<typeof setTimeout> | null = null;

  isFrozen = false;
  freezeSecondsLeft = 0;
  private freezeInterval: ReturnType<typeof setInterval> | null = null;

  isChaos = false;

  isSpectating = false;
  spectateGuesses: SpectateGuess[] = [];
  private pendingSpectateGuesses: PendingSpectateGuess[] = [];

  isOneVsOne = false;
  isMyTurn = false;
  turnTimeLeft = 30;
  currentTurnSocketId = '';
  currentTurnPlayerName = '';
  iLost = false;
  oneVsOneWinnerName = '';
  skipTurnUsed = false;   // 1v1 skip-turn power-up (once per game)
  oneVsOneGuesses: OneVsOneGuess[] = [];
  private pendingOneVsOneGuesses: PendingOneVsOneGuess[] = [];
  private turnCountdownInterval: ReturnType<typeof setInterval> | null = null;
  private oneVsOneSubs: Subscription[] = [];
  private gameDataReady = false;

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
    private settings: SettingsService,
    private gameFeedbackService: GameFeedbackService,
    private customGameSessionService: CustomGameSessionService
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
        this.myAuth0Id = user.sub ?? '';
        this.isDevAccount = user.email === 'promptle99@gmail.com';
        this.loadDevSettings();
        if (user.sub) {
          this.http.get<any>(`/api/load-game/${encodeURIComponent(user.sub)}`).subscribe({
            next:  (payload) => { if (payload?.topic) this.serverSaveExists = true; },
            error: () => {}
          });
        }
      }
    });

    this.route.queryParamMap.subscribe(params => {
      const loadSaved    = params.get('loadSaved');
      const restartSaved = params.get('restartSaved');
      const dailyGame    = params.get('daily');
      const aiTopic      = params.get('topic');
      const topicIdParam = params.get('id');
      const topicId      = topicIdParam ? Number(topicIdParam) : NaN;
      const room         = params.get('room')?.trim();
      const answerSeed   = params.get('answer') || undefined;

      if (room && room.length > 0) {
        this.currentRoom  = room;
        this.isMultiplayer = true;
        this.gameStarted  = false;
        this.currentSinglePlayerSource = '';
        this.resetCustomGameFeedback();
        this.resetCustomGameSession();

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

      if (dailyGame === 'true' || dailyGame === '1') {
        this.shareIdParam = '';
        this.shareTopicParam = '';
        this.currentSinglePlayerSource = 'daily';
        this.currentDailyGame = null;
        this.resetCustomGameFeedback();
        this.resetCustomGameSession();
        this.http.get('/api/dev-settings').subscribe({
          next: () => {
            this.loadGame({ dailyMode: 'promptle' });
          },
          error: () => {
            this.gameError = 'Daily game is still loading. Reload the app in a moment.';
          },
        });
        return;
      }

      if (aiTopic && aiTopic.trim()) {
        this.shareTopicParam = aiTopic.trim();
        this.shareIdParam = '';
        this.currentSinglePlayerSource = 'custom';
        this.currentDailyGame = null;
        this.resetCustomGameFeedback();
        this.resetCustomGameSession();
        this.auth.user$.pipe(take(1)).subscribe(user => {
          this.loadGame({ topic: aiTopic.trim(), auth0Id: user?.sub || '' });
        });
        return;
      }
      if (!isNaN(topicId)) {
        this.shareIdParam = String(topicId);
        this.shareTopicParam = '';
        this.currentSinglePlayerSource = 'popular';
        this.currentDailyGame = null;
        this.resetCustomGameFeedback();
        this.resetCustomGameSession();
        this.loadGame({ topicId, answer: answerSeed }); return;
      }

      this.currentSinglePlayerSource = '';
      this.currentDailyGame = null;
      this.resetCustomGameSession();
      this.gameError = 'No valid topic or game ID provided.';
    });
  }

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
      const guess = {
        guesserSocketId: data.guesserSocketId,
        guesserName: data.guesserName,
        isMe,
        guessValues: data.guessValues,
        guessColors: data.guessColors,
      };
      if (this.gameDataReady) {
        this.addOneVsOneGuess(guess);
      } else {
        this.queueOneVsOneGuess(guess);
      }
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

  hostStartGame() {
    if (!this.isHost || !this.currentRoom) return;
    const mode = this.isOneVsOne ? '1v1' : 'standard';
    this.multiplayerService.startGame(this.currentRoom, mode);
  }

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

  private startStopwatch(fromMs = 0) {
    this.stopwatchMs = fromMs;
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

  private subscribeToOpponentEvents() {
    this.opponentGuessSub = this.multiplayerService.onOpponentGuess().subscribe(data => {
      console.log('[Promptle] opponent-guess received:', data);
      this.players = this.players.map(p =>
        p.id === data.playerId
          ? { ...p, colors: data.colors, won: data.isCorrect }
          : p
      );
      if (data.values?.length) {
        const guess = {
          playerId: data.playerId,
          playerName: data.playerName,
          values: data.values,
          colors: data.colors,
          isMe: false,
        };
        if (this.gameDataReady) {
          this.addSpectateGuess(guess);
        } else {
          this.queueSpectateGuess(guess);
        }
      }
      this.cdr.detectChanges();
    });

    this.playerWonSub = this.multiplayerService.onPlayerWon().subscribe(data => {
      const finishSecs = data.finishTime != null ? Math.round(data.finishTime / 1000) : null;
      const formattedTime = finishSecs != null ? `${finishSecs} second${finishSecs === 1 ? '' : 's'}` : undefined;
      this.players = this.players.map(p =>
        p.id === data.playerId
          ? { ...p, won: true, guesses: data.guesses, finishTime: formattedTime, finishTimeMs: data.finishTime, score: data.score }
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

  saveGame() {
    if (this.isMultiplayer) return;
    if (!this.topic || !this.headers.length) return;

    if (this.hasSavedGame) {
      const confirmed = window.confirm(
        'You already have a saved game. Saving this game will replace it. Continue?'
      );
      if (!confirmed) return;
    }

    const payload = {
      savedAt: Date.now(),
      topic: this.topic,
      headers: this.headers,
      answers: this.answers,
      correctAnswer: this.correctAnswer,
      submittedGuesses: this.submittedGuesses,
      isGameOver: this.isGameOver,
      source: this.currentSinglePlayerSource || undefined,
      dailyGame: this.currentDailyGame || undefined,
      singlePlayerHint: this.singlePlayerHint,
      singlePlayerHintUsed: this.singlePlayerHintUsed,
      elapsedMs: this.stopwatchMs
    };

    this.auth.user$.pipe(take(1)).subscribe(user => {
      const savedAtStr = new Date(payload.savedAt).toLocaleString();
      if (user && user.sub) {
        this.http.post('/api/save-game', { auth0Id: user.sub, game: payload }).subscribe({
          next:  () => { this.savedTimestamp = savedAtStr; this.serverSaveExists = true; },
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
    this.currentSinglePlayerSource = payload?.source === 'custom'
      ? 'custom'
      : payload?.source === 'popular'
        ? 'popular'
        : payload?.source === 'daily'
          ? 'daily'
        : '';
    this.currentDailyGame = payload?.dailyGame
      ? {
          mode: typeof payload.dailyGame.mode === 'string' ? payload.dailyGame.mode : 'promptle',
          topic: typeof payload.dailyGame.topic === 'string' ? payload.dailyGame.topic : hydrated.topic,
          date: typeof payload.dailyGame.date === 'string' ? payload.dailyGame.date : '',
          generatedAt: typeof payload.dailyGame.generatedAt === 'string' ? payload.dailyGame.generatedAt : undefined,
        }
      : null;
    this.headers = hydrated.headers;
    this.answers = hydrated.answers;
    this.correctAnswer  = hydrated.correctAnswer;
    this.submittedGuesses = clearProgress ? [] : Array.isArray(payload.submittedGuesses)
      ? payload.submittedGuesses.map((guess: any) => this.createGuessEntry({
          name: typeof guess?.name === 'string' ? guess.name : undefined,
          values: Array.isArray(guess?.values) ? guess.values : [],
          colors: Array.isArray(guess?.colors) ? guess.colors : [],
        }))
      : [];
    this.selectedGuess  = '';
    this.guessQuery     = '';
    this.isGameOver     = clearProgress ? false : !!payload.isGameOver;
    this.isViewingCompletedGame = false;
    this.savedTimestamp = clearProgress ? null : payload.savedAt ? new Date(payload.savedAt).toLocaleString() : null;
    this.gameError      = '';
    this.myFinishTimeMs = null;
    this.resetCustomGameFeedback();
    this.resetCustomGameSession();
    this.singlePlayerHint = clearProgress || !payload?.singlePlayerHint
      ? null
      : {
          column: typeof payload.singlePlayerHint.column === 'string' ? payload.singlePlayerHint.column : '',
          value: typeof payload.singlePlayerHint.value === 'string' ? payload.singlePlayerHint.value : ''
        };
    this.singlePlayerHintUsed = clearProgress ? false : !!payload?.singlePlayerHintUsed;
    this.filterAnswers(this.guessQuery);

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
      const resumeMs = clearProgress ? 0 : (typeof payload?.elapsedMs === 'number' ? payload.elapsedMs : 0);
      this.startStopwatch(resumeMs);
    }
  }

  restartGame() {
    if (this.isMultiplayer) return;

    if (this.currentSinglePlayerSource === 'daily') {
      this.submittedGuesses       = [];
      this.selectedGuess          = '';
      this.guessQuery             = '';
      this.filterAnswers(this.guessQuery);
      this.isGameOver             = false;
      this.isViewingCompletedGame = false;
      this.gameError              = '';
      this.myFinishTimeMs         = null;
      this.showSkipTurnHint       = true;
      this.showPowerupHint        = true;
      this.resetCustomGameFeedback();
      this.singlePlayerHint       = null;
      this.singlePlayerHintUsed   = false;
      this.stopStopwatch();
      this.startStopwatch();
      return;
    }

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
    this.resetCustomGameFeedback();
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

  private loadGame(params: { topic?: string; topicId?: number; room?: string; answer?: string; auth0Id?: string; dailyMode?: 'promptle' | 'connections' | 'crossword' }) {
    this.gameLoading = true;
    this.gameError   = '';
    this.gameDataReady = false;
    this.pendingSpectateGuesses = [];
    this.pendingOneVsOneGuesses = [];
    this.dbGameService.fetchGame(params).subscribe({
      next: (data: GameData) => {
        this.applyGameData(data);
        this.gameLoading = false;
        if (this.isMultiplayer) this.cdr.detectChanges();
      },
      error: (err) => {
        this.gameError   = err?.error?.error ?? err?.message ?? PROMPTLE_GENERATION_ERROR;
        this.gameLoading = false;
        if (this.isMultiplayer) this.cdr.detectChanges();
      }
    });
  }

  private applyGameData(data: GameData) {
    const hydrated = hydrateGameData(data);

    this.topic   = hydrated.topic;
    this.currentDailyGame = hydrated.dailyGame || null;
    if (!this.isMultiplayer && this.currentDailyGame?.mode === 'promptle') {
      this.currentSinglePlayerSource = 'daily';
    }
    this.headers = hydrated.headers;
    this.answers = hydrated.answers;
    this.filterAnswers(this.guessQuery);
    this.correctAnswer = hydrated.correctAnswer;

    if (hydrated.mode === '1v1') this.isOneVsOne = true;
    if (hydrated.mode === 'chaos') this.isChaos = true;

    const correct = this.answers.find(a => a.name === this.correctAnswer.name);
    this.backendHeaders = correct ? [...this.headers] : [];
    this.backendRow     = correct ? [...correct.values] : [];
    this.gameDataReady = true;
    this.flushPendingMultiplayerGuesses();

    this.submittedGuesses = [];
    this.selectedGuess    = '';
    this.guessQuery       = '';
    this.isGameOver       = false;
    this.isViewingCompletedGame = false;
    this.resetCustomGameFeedback();
    this.resetCustomGameSession();
    this.singlePlayerHint = null;
    this.singlePlayerHintUsed = false;
    this.filterAnswers(this.guessQuery);
    if (this.shouldTrackCustomSession()) {
      this.startCustomGameSession(this.topic);
    }
    if (!this.isMultiplayer) {
      this.stopStopwatch();
      this.startStopwatch();
    }
    if (this.isMultiplayer) this.cdr.detectChanges();
  }

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

  private normalizeGuessColor(color: string): GuessColor {
    return color === 'green' || color === 'yellow' ? color : 'gray';
  }

  private findAnswerByGuess(name?: string, values: string[] = []): HydratedGameAnswer | undefined {
    const normalizedName = name?.trim().toLowerCase();
    if (normalizedName) {
      return this.answers.find((answer) => answer.name.trim().toLowerCase() === normalizedName);
    }

    return this.answers.find((answer) =>
      answer.values.length === values.length
      && answer.values.every((value, index) =>
        value.trim().toLowerCase() === String(values[index] ?? '').trim().toLowerCase()
      )
    );
  }

  private createGuessEntry(payload: {
    name?: string;
    values?: string[];
    colors?: string[];
  }): PromptleGuess {
    const name = typeof payload.name === 'string' ? payload.name : undefined;
    const values = Array.isArray(payload.values)
      ? payload.values.map((value) => String(value ?? ''))
      : [];
    const guessedAnswer = this.findAnswerByGuess(name, values);
    if (guessedAnswer && this.correctAnswer?.cells?.length) {
      const feedback = this.evaluateGuessFeedback(guessedAnswer.cells, this.correctAnswer.cells);
      return {
        ...(name ? { name } : {}),
        values,
        colors: feedback.map(({ color }) => color),
        feedback,
      };
    }

    const colors = Array.isArray(payload.colors)
      ? payload.colors.map((color) => this.normalizeGuessColor(String(color)))
      : [];
    return {
      ...(name ? { name } : {}),
      values,
      colors,
      feedback: colors.map((color) => ({ color })),
    };
  }

  private getGuessedNamesLowercase(): Set<string> {
    const set = new Set<string>();
    for (const guess of this.submittedGuesses) {
      const matched = this.findAnswerByGuess(guess.name, guess.values);
      if (matched) set.add(matched.name.toLowerCase());
    }
    return set;
  }

  private isAlreadyGuessed(name: string): boolean {
    return this.getGuessedNamesLowercase().has(name.trim().toLowerCase());
  }

  private evaluateGuessFeedback(guessedCells: GameCell[], correctCells: GameCell[]): GuessCellFeedback[] {
    return guessedCells.map((cell, index) => this.getCellFeedback(cell, correctCells[index], index));
  }

  private evaluateGuessColors(guessedCells: GameCell[], correctCells: GameCell[]): GuessColor[] {
    return this.evaluateGuessFeedback(guessedCells, correctCells).map(({ color }) => color);
  }

  private getCellFeedback(
    guessedCell?: GameCell,
    correctCell?: GameCell,
    columnIndex: number = -1
  ): GuessCellFeedback {
    const guessNorm = this.normalizeDisplay(guessedCell?.display ?? '');
    const correctNorm = this.normalizeDisplay(correctCell?.display ?? '');

    if (!guessNorm || !correctNorm) return { color: 'gray' };
    if (this.hasMatchingNumberValue(guessedCell, correctCell)) return { color: 'green' };
    if (this.hasMatchingReferenceValue(guessedCell, correctCell)) return { color: 'green' };
    if (guessNorm === correctNorm) return { color: 'green' };

    const quantitativeFeedback = this.getQuantitativeCellFeedback(guessedCell, correctCell, columnIndex);
    if (quantitativeFeedback) return quantitativeFeedback;

    if (this.hasListItemMatch(guessedCell, correctCell)) return { color: 'yellow' };
    if (guessedCell?.kind === 'reference' || correctCell?.kind === 'reference') {
      return { color: this.hasReferencePartMatch(guessedCell, correctCell) ? 'yellow' : 'gray' };
    }
    if (this.hasTextTokenMatch(guessedCell, correctCell)) return { color: 'yellow' };
    return { color: 'gray' };
  }

  private hasMatchingNumberValue(guessedCell?: GameCell, correctCell?: GameCell): boolean {
    if (guessedCell?.kind !== 'number' || correctCell?.kind !== 'number') return false;

    const guessedValue = guessedCell.parts?.value;
    const correctValue = correctCell.parts?.value;
    return typeof guessedValue === 'number'
      && Number.isFinite(guessedValue)
      && guessedValue === correctValue;
  }

  private hasMatchingReferenceValue(guessedCell?: GameCell, correctCell?: GameCell): boolean {
    if (guessedCell?.kind !== 'reference' || correctCell?.kind !== 'reference') return false;

    const guessedLabel = this.normalizeDisplay(String(guessedCell.parts?.label ?? ''));
    const correctLabel = this.normalizeDisplay(String(correctCell.parts?.label ?? ''));
    const guessedNumber = String(guessedCell.parts?.number ?? '').trim().toLowerCase();
    const correctNumber = String(correctCell.parts?.number ?? '').trim().toLowerCase();

    return !!guessedLabel
      && guessedLabel === correctLabel
      && !!guessedNumber
      && guessedNumber === correctNumber;
  }

  private getQuantitativeCellFeedback(
    guessedCell?: GameCell,
    correctCell?: GameCell,
    columnIndex: number = -1
  ): GuessCellFeedback | null {
    if (!guessedCell || !correctCell || columnIndex < 0) return null;

    if (guessedCell.kind === 'number' && correctCell.kind === 'number') {
      const guessedValue = this.getNumericCellValue(guessedCell);
      const correctValue = this.getNumericCellValue(correctCell);
      if (guessedValue === null || correctValue === null || guessedValue === correctValue) return null;

      return {
        color: this.isQuantitativelyClose(
          guessedValue,
          correctValue,
          this.getColumnNumericValues(columnIndex)
        ) ? 'yellow' : 'gray',
        direction: correctValue > guessedValue ? 'up' : 'down',
      };
    }

    if (
      guessedCell.kind === 'reference'
      && correctCell.kind === 'reference'
      && this.hasReferencePartMatch(guessedCell, correctCell)
    ) {
      const guessedNumber = this.getReferenceOrdinalValue(guessedCell);
      const correctNumber = this.getReferenceOrdinalValue(correctCell);
      if (guessedNumber === null || correctNumber === null || guessedNumber === correctNumber) {
        return { color: 'yellow' };
      }

      return {
        color: 'yellow',
        direction: correctNumber > guessedNumber ? 'up' : 'down',
      };
    }

    return null;
  }

  private parseComparableNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;

    const trimmed = String(value ?? '').trim();
    if (!trimmed || !/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private getNumericCellValue(cell?: GameCell): number | null {
    if (cell?.kind !== 'number') return null;
    return this.parseComparableNumber(cell.parts?.value);
  }

  private getReferenceOrdinalValue(cell?: GameCell): number | null {
    if (cell?.kind !== 'reference') return null;
    return this.parseComparableNumber(cell.parts?.number);
  }

  private getColumnNumericValues(columnIndex: number): number[] {
    return this.answers
      .map((answer) => this.getNumericCellValue(answer.cells[columnIndex]))
      .filter((value): value is number => value !== null);
  }

  private isQuantitativelyClose(
    guessedValue: number,
    correctValue: number,
    comparisonValues: number[]
  ): boolean {
    const difference = Math.abs(correctValue - guessedValue);
    if (comparisonValues.length < 2) return false;

    const minValue = Math.min(...comparisonValues);
    const maxValue = Math.max(...comparisonValues);
    const range = maxValue - minValue;
    if (!Number.isFinite(range) || range <= 0) return false;

    return difference <= range * QUANTITATIVE_CLOSE_RATIO;
  }

  private hasListItemMatch(guessedCell?: GameCell, correctCell?: GameCell): boolean {
    const guessedItems = this.getComparableItems(guessedCell);
    const correctItems = this.getComparableItems(correctCell);
    if (!guessedItems.length || !correctItems.length) return false;

    return this.countOverlap(guessedItems, correctItems) >= 1;
  }

  private hasReferencePartMatch(guessedCell?: GameCell, correctCell?: GameCell): boolean {
    const guessedIsReference = guessedCell?.kind === 'reference';
    const correctIsReference = correctCell?.kind === 'reference';
    if (!guessedIsReference && !correctIsReference) return false;

    const guessedLabel = this.normalizeDisplay(String(guessedCell?.parts?.label ?? ''));
    const correctLabel = this.normalizeDisplay(String(correctCell?.parts?.label ?? ''));
    return !!guessedLabel && guessedLabel === correctLabel;
  }

  private hasTextTokenMatch(guessedCell?: GameCell, correctCell?: GameCell): boolean {
    if (!guessedCell || !correctCell) return false;
    if (guessedCell.kind === 'number' || correctCell.kind === 'number') return false;

    const guessedTokens = this.getComparableTokens(guessedCell);
    const correctTokens = this.getComparableTokens(correctCell);
    return this.countOverlap(guessedTokens, correctTokens) >= 2;
  }

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
    this.finalizeCustomGameSession('completed');
    if (this.isMultiplayer) return;
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user?.sub) {
        this.http.post('/api/increment-win', {
          auth0Id: user.sub,
          guessCount: this.submittedGuesses.length,
          finishMs: this.myFinishTimeMs ?? undefined
        }).subscribe({ error: (e) => console.error('Failed to update stats', e) });
      }
    });
  }

  get showCustomGameFeedback(): boolean {
    return !this.isMultiplayer && this.currentSinglePlayerSource === 'custom';
  }

  private resetCustomGameFeedback() {
    this.feedbackChoice = null;
    this.feedbackSubmitting = false;
    this.feedbackError = '';
  }

  private resetCustomGameSession() {
    this.customSessionPlayId = '';
    this.customSessionInteracted = false;
    this.customSessionFinalized = false;
  }

  private shouldTrackCustomSession(): boolean {
    return !this.isMultiplayer && this.currentSinglePlayerSource === 'custom' && !!this.topic.trim();
  }

  private createPlayId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private startCustomGameSession(topic: string) {
    this.auth.user$.pipe(take(1)).subscribe((user) => {
      const auth0Id = user?.sub?.trim() || '';
      if (!auth0Id) {
        this.resetCustomGameSession();
        return;
      }

      const playId = this.createPlayId();
      this.customSessionPlayId = playId;
      this.customSessionInteracted = false;
      this.customSessionFinalized = false;

      this.customGameSessionService.startSession({
        playId,
        auth0Id,
        topic,
        gameType: 'promptle',
      }).subscribe({
        error: () => {
          this.resetCustomGameSession();
        },
      });
    });
  }

  private markCustomGameSessionInteracted() {
    if (!this.shouldTrackCustomSession() || !this.customSessionPlayId || this.customSessionInteracted) {
      return;
    }

    this.auth.user$.pipe(take(1)).subscribe((user) => {
      const auth0Id = user?.sub?.trim() || '';
      if (!auth0Id) return;

      this.customSessionInteracted = true;
      this.customGameSessionService.markInteracted({
        playId: this.customSessionPlayId,
        auth0Id,
      }).subscribe({
        error: () => {
          this.customSessionInteracted = false;
        },
      });
    });
  }

  private finalizeCustomGameSession(
    finalState: 'completed' | 'abandoned',
    options: { keepalive?: boolean } = {}
  ) {
    if (!this.shouldTrackCustomSession() || !this.customSessionPlayId || this.customSessionFinalized) {
      return;
    }

    if (finalState === 'abandoned' && (!this.customSessionInteracted || this.isGameOver)) {
      return;
    }

    this.auth.user$.pipe(take(1)).subscribe((user) => {
      const auth0Id = user?.sub?.trim() || '';
      if (!auth0Id) return;

      this.customSessionFinalized = true;
      this.customGameSessionService.finalizeSession(
        {
          playId: this.customSessionPlayId,
          auth0Id,
          finalState,
        },
        options
      ).subscribe({
        error: () => {
          this.customSessionFinalized = false;
        },
      });
    });
  }

  submitCustomGameFeedback(liked: boolean) {
    if (!this.showCustomGameFeedback || this.feedbackSubmitting || this.feedbackChoice !== null) return;
    if (!this.topic.trim()) return;

    this.feedbackSubmitting = true;
    this.feedbackError = '';

    this.auth.user$.pipe(take(1)).subscribe(user => {
      this.gameFeedbackService.submitFeedback({
        auth0Id: user?.sub || '',
        topic: this.topic,
        liked,
        gameType: 'promptle',
        result: 'won',
      }).subscribe({
        next: () => {
          this.feedbackChoice = liked;
          this.feedbackSubmitting = false;
        },
        error: () => {
          this.feedbackChoice = liked;
          this.feedbackSubmitting = false;
        },
      });
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

    const feedback = this.evaluateGuessFeedback(guessed.cells, correct.cells);
    const colors = feedback.map(({ color }) => color);

    const isCorrect = this.selectedGuess === this.correctAnswer.name;
    const finishMs  = isCorrect ? this.stopwatchMs : undefined;

    this.markCustomGameSessionInteracted();
    this.selectedGuess = '';
    this.guessQuery    = '';

    if (this.isOneVsOne) {
      this.submittedGuesses.push({
        name: guessed.name,
        values: [...guessed.values],
        colors,
        feedback,
      });
      this.filterAnswers(this.guessQuery);
      this.multiplayerService.emit1v1Guess(
        this.currentRoom, this.myUsername, guessed.values, colors, isCorrect, finishMs
      );
      if (this.isMultiplayer) this.cdr.detectChanges();
      return;
    }

    this.submittedGuesses.push({
      name: guessed.name,
      values: [...guessed.values],
      colors,
      feedback,
    });
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
        feedback,
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

  get showDevAnswerPreview(): boolean {
    return this.showPromptleAnswerAtTop
      && !this.gameLoading
      && !this.gameError
      && !!this.correctAnswer?.values?.length;
  }

  quitGame() {
    // Leaving an unsolved custom game after interaction counts as abandonment.
    this.finalizeCustomGameSession('abandoned', { keepalive: true });
    this.router.navigate(['/']);
  }

  viewCompletedGame() {
    if (!this.isGameOver) return;
    this.isViewingCompletedGame = true;
  }

  returnToResultsPopup() {
    if (!this.isGameOver) return;
    this.isViewingCompletedGame = false;
  }

  deleteCurrentRoom() {
    if (!this.currentRoom) return;
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

  stopSpectating() {
    this.isSpectating = false;
    this.cdr.detectChanges();
  }

  private loadDevSettings() {
    this.http.get<DevSettingsResponse>('/api/dev-settings').subscribe({
      next: (settings) => {
        this.showPromptleAnswerAtTop = settings.showPromptleAnswerAtTop ?? false;
      },
      error: () => {
        this.showPromptleAnswerAtTop = false;
      },
    });
  }

  get noGameAnims(): boolean {
    return !this.settings.getGameAnimations();
  }

  ngOnDestroy() {
    // Covers direct route changes and browser exits while a custom game is still active.
    this.finalizeCustomGameSession('abandoned', { keepalive: true });
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
